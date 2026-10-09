import json
from datetime import UTC, datetime
from time import perf_counter
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.prompts.registry import prompt_body, prompt_versions_metadata
from app.ai.providers.factory import get_chat_provider
from app.ai.providers.foundry import FoundryUnavailableError
from app.ai.quality import compute_quality_signal
from app.ai.retrieval.service import HybridRetrievalService
from app.config import Settings
from app.models.entities import AiRun, AiRunStep, Ticket
from app.models.enums import AiRunStatus, ProviderKind
from app.schemas.ai import ResolutionDraft, ReviewResult, TriageResult, WorkflowOutput


class SupportWorkflowRunner:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self.settings = settings
        self.session = session
        self.chat = get_chat_provider(settings)
        self.retrieval = HybridRetrievalService(settings, session)

    async def run(self, ticket: Ticket, guest_feedback: str | None = None) -> AiRun:
        started = perf_counter()
        run = AiRun(
            ticket_id=ticket.id,
            status=AiRunStatus.QUEUED.value,
            provider_kind=getattr(self.chat, "kind", ProviderKind.UNAVAILABLE.value),
            model_deployment=getattr(self.chat, "model_name", None),
            embedding_model=self.settings.foundry_embedding_model
            if self.settings.app_mode == "foundry"
            else "deterministic-hash",
            agent_versions={"triage": "1", "resolution": "1", "review": "1", "retrieval": "1"},
            prompt_versions=prompt_versions_metadata(),
        )
        self.session.add(run)
        await self.session.flush()

        try:
            output = await self._execute(ticket, run, guest_feedback)
        except FoundryUnavailableError as exc:
            run.status = AiRunStatus.FOUNDRY_UNAVAILABLE.value
            run.error_message = str(exc)
            await self.session.commit()
            return run
        except Exception as exc:  # noqa: BLE001
            run.status = AiRunStatus.FAILED.value
            run.error_message = str(exc)
            await self.session.commit()
            raise

        run.triage_result = output.triage.model_dump()
        run.retrieval_result = {"chunks": [item.model_dump() for item in output.retrieved]}
        run.resolution_draft = output.resolution.model_dump()
        run.review_result = output.review.model_dump()
        run.original_customer_response = output.resolution.customer_response_draft
        run.revision_count = output.revision_count
        run.retrieved_chunk_count = len(output.retrieved)
        run.quality_signal = output.resolution.quality_signal_components.model_dump()
        run.status = (
            AiRunStatus.AWAITING_HUMAN.value
            if not output.forced_human_escalation
            else AiRunStatus.AWAITING_HUMAN.value
        )
        if output.forced_human_escalation:
            run.error_message = "Review failed after one revision. Human escalation is required."
        run.duration_ms = int((perf_counter() - started) * 1000)
        ticket.last_ai_analysis_at = datetime.now(UTC)
        ticket.category = output.triage.category
        ticket.severity = output.triage.severity
        ticket.ai_review_status = run.status
        if output.forced_human_escalation:
            ticket.status = "escalated"
        else:
            ticket.status = "waiting_on_human"
        await self.session.commit()
        await self.session.refresh(run, attribute_names=["steps"])
        return run

    async def _execute(
        self, ticket: Ticket, run: AiRun, guest_feedback: str | None
    ) -> WorkflowOutput:
        ticket_payload = _ticket_payload(ticket, guest_feedback)

        triage = await self._step(
            run,
            "triage",
            lambda: self.chat.complete_structured(
                instructions=prompt_body("triage"),
                user_input=ticket_payload,
                schema=TriageResult,
            ),
        )
        run.status = AiRunStatus.TRIAGE_COMPLETED.value

        retrieved = await self._step(
            run,
            "retrieval",
            lambda: self.retrieval.search(
                triage.retrieval_query,
                exclude_evaluation_only=True,
            ),
        )
        run.status = AiRunStatus.KNOWLEDGE_RETRIEVED.value

        resolution_input = _resolution_input(ticket_payload, triage, retrieved, None)
        resolution = await self._step(
            run,
            "resolution",
            lambda: self.chat.complete_structured(
                instructions=prompt_body("resolution"),
                user_input=resolution_input,
                schema=ResolutionDraft,
            ),
        )
        run.status = AiRunStatus.RESOLUTION_GENERATED.value

        review = await self._step(
            run,
            "review",
            lambda: self.chat.complete_structured(
                instructions=prompt_body("review"),
                user_input=_review_input(ticket_payload, resolution, retrieved),
                schema=ReviewResult,
            ),
        )
        revision_count = 0
        forced = False
        if review.status == "REVISE":
            revision_count = 1
            resolution = await self._step(
                run,
                "resolution_revision",
                lambda: self.chat.complete_structured(
                    instructions=prompt_body("resolution"),
                    user_input=_resolution_input(
                        ticket_payload, triage, retrieved, review
                    ),
                    schema=ResolutionDraft,
                ),
            )
            review = await self._step(
                run,
                "review_revision",
                lambda: self.chat.complete_structured(
                    instructions=prompt_body("review"),
                    user_input=_review_input(ticket_payload, resolution, retrieved),
                    schema=ReviewResult,
                ),
            )
            if review.status == "REVISE":
                forced = True
        run.status = AiRunStatus.REVIEW_COMPLETED.value

        cited = [item.chunk_id for item in resolution.source_citations]
        resolution.quality_signal_components = compute_quality_signal(
            retrieved,
            cited,
            review,
            triage.missing_information,
            self.settings.retrieval_min_score,
        )
        return WorkflowOutput(
            triage=triage,
            retrieved=retrieved,
            resolution=resolution,
            review=review,
            revision_count=revision_count,
            forced_human_escalation=forced,
            provider_kind=getattr(self.chat, "kind", "unknown"),
        )

    async def _step(self, run: AiRun, name: str, factory):
        started_at = datetime.now(UTC)
        started = perf_counter()
        step = AiRunStep(
            ai_run_id=run.id,
            name=name,
            status="running",
            started_at=started_at,
        )
        self.session.add(step)
        await self.session.flush()
        try:
            result = await factory()
        except Exception:
            step.status = "failed"
            step.ended_at = datetime.now(UTC)
            step.duration_ms = int((perf_counter() - started) * 1000)
            await self.session.flush()
            raise
        step.status = "completed"
        step.ended_at = datetime.now(UTC)
        step.duration_ms = int((perf_counter() - started) * 1000)
        if hasattr(result, "model_dump"):
            step.payload = result.model_dump()
        elif isinstance(result, list):
            step.payload = {"count": len(result)}
        await self.session.flush()
        return result


def _ticket_payload(ticket: Ticket, feedback: str | None) -> str:
    history = "\n".join(f"{message.author_name}: {message.body}" for message in ticket.messages)
    extra = f"\nHuman regeneration feedback: {feedback}" if feedback else ""
    return (
        f"Ticket {ticket.display_id}\nSubject: {ticket.subject}\n"
        f"Customer company context is synthetic demo data.\n\n{ticket.body}\n\n"
        f"Conversation:\n{history}{extra}"
    )


def _resolution_input(ticket_payload: str, triage: TriageResult, retrieved, review) -> str:
    chunks = []
    for item in retrieved:
        chunks.append(
            f"chunk_id={item.chunk_id} document={item.document_name} section={item.section} "
            f"score={item.retrieval_score}\n{item.body}"
        )
    marker = "retrieved_count=0\nNO_RELEVANT_KNOWLEDGE" if not retrieved else f"retrieved_count={len(retrieved)}"
    review_block = ""
    if review is not None:
        review_block = "\nReviewer feedback:\n" + json.dumps(review.model_dump())
    return (
        f"{ticket_payload}\n\nTriage:\n{triage.model_dump_json()}\n\n{marker}\n"
        + "\n---\n".join(chunks)
        + review_block
    )


def _review_input(ticket_payload: str, resolution: ResolutionDraft, retrieved) -> str:
    return (
        f"{ticket_payload}\n\nDraft:\n{resolution.model_dump_json()}\n\n"
        f"Sources:\n{json.dumps([item.model_dump() for item in retrieved])}"
    )


async def load_ticket(session: AsyncSession, ticket_id: UUID) -> Ticket | None:
    return await session.get(Ticket, ticket_id, options=[selectinload(Ticket.messages)])
