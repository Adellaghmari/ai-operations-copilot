from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

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
    await session.commit()
    await session.refresh(run)
    return run
