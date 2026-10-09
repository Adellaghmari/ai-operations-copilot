from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.assurance.engine import update_packet_human_decision
from app.ai.observability import get_tracer, set_safe_span_attributes
from app.models.entities import AiFeedback, AiRun, Ticket
from app.models.enums import AiRunStatus, FeedbackLabel, HumanDecision
from app.schemas.api import HumanReviewRequest


def _edit_ratio(original: str | None, edited: str | None) -> float | None:
    if not original or edited is None:
        return None
    if original == edited:
        return 0.0
    longer = max(len(original), len(edited))
    if longer == 0:
        return 0.0
    shared = sum(1 for left, right in zip(original, edited, strict=False) if left == right)
    return round(1.0 - (shared / longer), 4)


async def apply_human_review(
    session: AsyncSession,
    run: AiRun,
    ticket: Ticket,
    payload: HumanReviewRequest,
) -> AiRun:
    decision = HumanDecision(payload.decision)
    tracer = get_tracer()
    with tracer.start_as_current_span("ai.human_review") as span:
        set_safe_span_attributes(
            span,
            **{
                "ai.run_id": str(run.id),
                "ai.ticket_id": str(ticket.id),
                "ai.human_decision": decision.value,
                "ai.was_edited": False,
            },
        )
        run.human_decision = decision.value
        run.human_feedback = payload.feedback
        now = datetime.now(UTC)

        if decision == HumanDecision.APPROVE:
            run.final_customer_response = run.original_customer_response
            run.was_edited = False
            run.approved_at = now
            run.status = AiRunStatus.HUMAN_APPROVED.value
            ticket.status = "resolved"
            ticket.ai_review_status = run.status
        elif decision == HumanDecision.EDIT_AND_APPROVE:
            edited = payload.edited_response or run.original_customer_response
            run.final_customer_response = edited
            run.was_edited = edited != run.original_customer_response
            run.approved_at = now
            run.status = AiRunStatus.HUMAN_EDITED.value
            ticket.status = "resolved"
            ticket.ai_review_status = run.status
        elif decision == HumanDecision.REJECT:
            run.status = AiRunStatus.HUMAN_REJECTED.value
            ticket.status = "open"
            ticket.ai_review_status = run.status
        elif decision == HumanDecision.ESCALATE:
            run.status = AiRunStatus.HUMAN_ESCALATED.value
            ticket.status = "escalated"
            ticket.ai_review_status = run.status
        elif decision == HumanDecision.REGENERATE:
            ticket.ai_review_status = "regeneration_requested"
            ticket.status = "open"

        if run.assurance_report:
            labels = {
                HumanDecision.APPROVE: "approved",
                HumanDecision.EDIT_AND_APPROVE: "edited and approved",
                HumanDecision.REJECT: "rejected",
                HumanDecision.ESCALATE: "escalated",
                HumanDecision.REGENERATE: "regenerated",
            }
            run.assurance_report = update_packet_human_decision(
                run.assurance_report,
                decision.value,
                labels.get(decision),
            )

        if payload.label:
            label = FeedbackLabel(payload.label)
            session.add(
                AiFeedback(
                    ai_run_id=run.id,
                    ticket_id=ticket.id,
                    label=label.value,
                    comment=payload.feedback or "",
                    human_decision=decision.value,
                    edit_distance_ratio=_edit_ratio(
                        run.original_customer_response, run.final_customer_response
                    ),
                )
            )
        set_safe_span_attributes(
            span,
            **{
                "ai.human_review_state": run.status,
                "ai.was_edited": run.was_edited,
                "ai.success": True,
            },
        )
        await session.commit()
        await session.refresh(run)
        return run
