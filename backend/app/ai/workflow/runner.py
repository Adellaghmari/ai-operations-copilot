import json
from datetime import UTC, datetime
from time import perf_counter
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.assurance.engine import DecisionAssuranceEngine
from app.ai.citations import bind_citations_to_retrieved
from app.ai.observability import get_tracer, set_safe_span_attributes
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
            agent_versions={
                "triage": "1",
                "resolution": "2",
                "review": "2",
                "retrieval": "1",
                "assurance": "1",
            },
            prompt_versions=prompt_versions_metadata(),
        )
        self.session.add(run)
        await self.session.flush()

        tracer = get_tracer()
        with tracer.start_as_current_span("ai.workflow") as span:
            set_safe_span_attributes(
                span,
                **{
                    "ai.run_id": str(run.id),
                    "ai.ticket_id": str(ticket.id),
                    "ai.provider_kind": run.provider_kind,
                    "ai.model_deployment": run.model_deployment,
                    "ai.embedding_model": run.embedding_model,
                    "app.environment": self.settings.app_env,
                    "app.mode": self.settings.app_mode,
                    "service.name": self.settings.otel_service_name,
                },
            )
            try:
                output = await self._execute(ticket, run, guest_feedback)
            except FoundryUnavailableError as exc:
                span.set_attribute("ai.success", False)
                span.set_attribute("ai.human_review_state", AiRunStatus.FOUNDRY_UNAVAILABLE.value)
                run.status = AiRunStatus.FOUNDRY_UNAVAILABLE.value
                run.error_message = str(exc)
                await self.session.commit()
                return run
            except Exception as exc:  # noqa: BLE001
                span.set_attribute("ai.success", False)
                run.status = AiRunStatus.FAILED.value
                run.error_message = str(exc)
                await self.session.commit()
                raise

            run.triage_result = output.triage.model_dump()
            run.retrieval_result = {"chunks": [item.model_dump() for item in output.retrieved]}
            run.resolution_draft = output.resolution.model_dump()
            run.review_result = output.review.model_dump()
            if output.original_resolution is not None:
                run.original_resolution_draft = output.original_resolution.model_dump()
            run.assurance_report = output.assurance_report
            run.assurance_outcome = (output.assurance_report or {}).get("outcome")
            run.abstained = output.abstained
            ledger = (output.assurance_report or {}).get("ledger") or []
            run.supported_claim_count = sum(
                1 for item in ledger if item.get("support_state") == "SUPPORTED"
            )
            run.unsupported_claim_count = sum(
                1 for item in ledger if item.get("support_state") == "UNSUPPORTED"
            )
            run.conflict_count = len((output.assurance_report or {}).get("conflicts") or [])
            run.missing_information_count = len((output.assurance_report or {}).get("gaps") or [])
            run.original_customer_response = (
                None if output.abstained else output.resolution.customer_response_draft
            )
            run.revision_count = output.revision_count
            run.retrieved_chunk_count = len(output.retrieved)
            run.quality_signal = output.resolution.quality_signal_components.model_dump()
            run.status = AiRunStatus.AWAITING_HUMAN.value
            if output.forced_human_escalation:
                run.error_message = (
                    "Review failed after one revision. Human escalation is required."
                )
            if output.abstained:
                run.error_message = None
            run.duration_ms = int((perf_counter() - started) * 1000)
            ticket.last_ai_analysis_at = datetime.now(UTC)
            ticket.category = output.triage.category
            ticket.severity = output.triage.severity
            ticket.ai_review_status = run.status
            if output.forced_human_escalation and not output.abstained:
                ticket.status = "escalated"
            else:
                ticket.status = "waiting_on_human"
            set_safe_span_attributes(
                span,
                **{
                    "ai.success": True,
                    "ai.retrieved_chunk_count": run.retrieved_chunk_count,
                    "ai.revision_count": run.revision_count,
                    "ai.human_review_state": run.status,
                    "ai.forced_human_escalation": output.forced_human_escalation,
                    "ai.duration_ms": run.duration_ms,
                    "ai.assurance.outcome": run.assurance_outcome,
                    "ai.assurance.abstained": run.abstained,
                    "ai.assurance.conflict_count": run.conflict_count,
                    "ai.assurance.missing_information_count": run.missing_information_count,
                },
            )
            with tracer.start_as_current_span("ai.human_review.transition") as hitl:
                set_safe_span_attributes(
                    hitl,
                    **{
                        "ai.run_id": str(run.id),
                        "ai.human_review_state": run.status,
                        "ai.revision_count": run.revision_count,
                    },
                )
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
        resolution = bind_citations_to_retrieved(resolution, retrieved)
        run.status = AiRunStatus.RESOLUTION_GENERATED.value
        original_resolution = resolution

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
                    user_input=_resolution_input(ticket_payload, triage, retrieved, review),
                    schema=ResolutionDraft,
                ),
            )
            resolution = bind_citations_to_retrieved(resolution, retrieved)
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
        engine = DecisionAssuranceEngine()
        report, resolution = engine.evaluate(
            ticket_subject=ticket.subject,
            ticket_body=ticket.body,
            triage=triage,
            retrieved=retrieved,
            resolution=resolution,
            review=review,
            original_resolution=original_resolution if revision_count else None,
            revision_count=revision_count,
            forced_human_escalation=forced,
            min_retrieval_score=self.settings.retrieval_min_score,
            prompt_versions=prompt_versions_metadata(),
            provider_kind=getattr(self.chat, "kind", "unknown"),
            model_deployment=getattr(self.chat, "model_name", None),
            embedding_model=run.embedding_model,
            run_id=str(run.id),
        )
        return WorkflowOutput(
            triage=triage,
            retrieved=retrieved,
            resolution=resolution,
            review=review,
            revision_count=revision_count,
            forced_human_escalation=forced,
            provider_kind=getattr(self.chat, "kind", "unknown"),
            original_resolution=original_resolution if revision_count else None,
            abstained=report.abstention.abstained,
            assurance_report=report.model_dump(),
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
        span_names = {
            "triage": "ai.agent.triage",
            "retrieval": "ai.retrieval",
            "resolution": "ai.agent.resolution",
            "review": "ai.agent.review",
            "resolution_revision": "ai.agent.resolution_revision",
            "review_revision": "ai.agent.review_revision",
        }
        tracer = get_tracer()
        with tracer.start_as_current_span(span_names.get(name, f"ai.step.{name}")) as span:
            set_safe_span_attributes(
                span,
                **{
                    "ai.run_id": str(run.id),
                    "ai.agent_name": name,
                    "ai.provider_kind": run.provider_kind,
                    "ai.model_deployment": run.model_deployment,
                },
            )
            try:
                result = await factory()
            except Exception:
                span.set_attribute("ai.success", False)
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
                span.set_attribute("ai.retrieved_chunk_count", len(result))
            span.set_attribute("ai.success", True)
            span.set_attribute("ai.duration_ms", step.duration_ms or 0)
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
            f"chunk_id={item.chunk_id} document_id={item.document_id} "
            f"document={item.document_name} section={item.section} "
            f"score={item.retrieval_score}\n{item.body}"
        )
    marker = (
        "retrieved_count=0\nNO_RELEVANT_KNOWLEDGE"
        if not retrieved
        else f"retrieved_count={len(retrieved)}"
    )
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
