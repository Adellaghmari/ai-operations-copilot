from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, settings_dep
from app.config import Settings
from app.models.entities import AiFeedback, AiRun, EvaluationRun, KnowledgeDocument, Ticket
from app.models.enums import AiRunStatus, HumanDecision, IngestionStatus
from app.schemas.api import DashboardMetrics, FeedbackSummary

router = APIRouter(tags=["analytics"])


@router.get("/dashboard", response_model=DashboardMetrics)
async def dashboard(
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
) -> DashboardMetrics:
    open_tickets = (
        await session.execute(select(func.count(Ticket.id)).where(Ticket.status == "open"))
    ).scalar_one()
    ai_assisted = (
        await session.execute(select(func.count(Ticket.id)).where(Ticket.last_ai_analysis_at.is_not(None)))
    ).scalar_one()
    awaiting = (
        await session.execute(
            select(func.count(Ticket.id)).where(Ticket.status == "waiting_on_human")
        )
    ).scalar_one()
    decided = (
        await session.execute(
            select(AiRun.human_decision, func.count(AiRun.id)).where(
                AiRun.human_decision.is_not(None)
            ).group_by(AiRun.human_decision)
        )
    ).all()
    counts = {key: value for key, value in decided}
    total_decided = sum(counts.values()) or 0
    approved = counts.get(HumanDecision.APPROVE.value, 0) + counts.get(
        HumanDecision.EDIT_AND_APPROVE.value, 0
    )
    edited = counts.get(HumanDecision.EDIT_AND_APPROVE.value, 0)
    rejected = counts.get(HumanDecision.REJECT.value, 0)
    latency = (
        await session.execute(select(func.avg(AiRun.duration_ms)).where(AiRun.duration_ms.is_not(None)))
    ).scalar()
    latest_eval = (
        await session.execute(
            select(EvaluationRun).order_by(EvaluationRun.started_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    groundedness = None
    if latest_eval and latest_eval.metrics:
        groundedness = latest_eval.metrics.get("groundedness") or latest_eval.metrics.get(
            "citation_coverage"
        )
    indexed = (
        await session.execute(
            select(func.count(KnowledgeDocument.id)).where(
                KnowledgeDocument.ingestion_status == IngestionStatus.INDEXED.value
            )
        )
    ).scalar_one()
    return DashboardMetrics(
        open_tickets=open_tickets,
        ai_assisted_tickets=ai_assisted,
        awaiting_human_review=awaiting,
        approval_rate=_rate(approved, total_decided),
        edit_rate=_rate(edited, total_decided),
        rejection_rate=_rate(rejected, total_decided),
        average_workflow_latency_ms=float(latency) if latency is not None else None,
        latest_evaluation_groundedness=groundedness,
        knowledge_documents_indexed=indexed,
        provider_kind=settings.app_mode,
        foundry_live=settings.uses_foundry,
    )


@router.get("/feedback", response_model=FeedbackSummary)
async def feedback(session: AsyncSession = Depends(db_session)) -> FeedbackSummary:
    rows = (
        await session.execute(select(AiFeedback.label, func.count(AiFeedback.id)).group_by(AiFeedback.label))
    ).all()
    by_label = {key: value for key, value in rows}
    total = sum(by_label.values())
    decided = (
        await session.execute(
            select(AiRun.human_decision, func.count(AiRun.id))
            .where(AiRun.human_decision.is_not(None))
            .group_by(AiRun.human_decision)
        )
    ).all()
    counts = {key: value for key, value in decided}
    total_decided = sum(counts.values())
    avg_edit = (
        await session.execute(select(func.avg(AiFeedback.edit_distance_ratio)))
    ).scalar()
    return FeedbackSummary(
        total=total,
        by_label=by_label,
        approval_rate=_rate(
            counts.get(HumanDecision.APPROVE.value, 0)
            + counts.get(HumanDecision.EDIT_AND_APPROVE.value, 0),
            total_decided,
        ),
        edit_rate=_rate(counts.get(HumanDecision.EDIT_AND_APPROVE.value, 0), total_decided),
        rejection_rate=_rate(counts.get(HumanDecision.REJECT.value, 0), total_decided),
        average_edit_distance_ratio=float(avg_edit) if avg_edit is not None else None,
    )


def _rate(part: int, total: int) -> float | None:
    if not total:
        return None
    return round(part / total, 4)
