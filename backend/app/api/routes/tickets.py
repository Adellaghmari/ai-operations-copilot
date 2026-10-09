from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.workflow.runner import SupportWorkflowRunner
from app.api.deps import (
    db_session,
    enforce_public_ticket_capacity,
    guest_key,
    settings_dep,
)
from app.config import Settings
from app.models.entities import AiRun, Customer, Ticket, TicketMessage
from app.models.enums import HumanDecision
from app.schemas.api import (
    AiRunDetail,
    HumanReviewRequest,
    PageResult,
    TicketCreate,
    TicketDetail,
    TicketOut,
)
from app.services.quota import QuotaExceededError, consume_demo_quota
from app.services.review import apply_human_review

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("", response_model=PageResult[TicketOut])
async def list_tickets(
    session: AsyncSession = Depends(db_session),
    status: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    ai_review_status: str | None = None,
    demo_scenario: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = "updated_at",
) -> PageResult[TicketOut]:
    statement = select(Ticket).options(selectinload(Ticket.customer))
    count_statement = select(func.count(Ticket.id))
    if status:
        statement = statement.where(Ticket.status == status)
        count_statement = count_statement.where(Ticket.status == status)
    if category:
        statement = statement.where(Ticket.category == category)
        count_statement = count_statement.where(Ticket.category == category)
    if severity:
        statement = statement.where(Ticket.severity == severity)
        count_statement = count_statement.where(Ticket.severity == severity)
    if ai_review_status:
        statement = statement.where(Ticket.ai_review_status == ai_review_status)
        count_statement = count_statement.where(Ticket.ai_review_status == ai_review_status)
    if demo_scenario:
        statement = statement.where(Ticket.demo_scenario == demo_scenario)
        count_statement = count_statement.where(Ticket.demo_scenario == demo_scenario)
    if q:
        pattern = f"%{q}%"
        statement = statement.where(Ticket.subject.ilike(pattern) | Ticket.body.ilike(pattern))
        count_statement = count_statement.where(
            Ticket.subject.ilike(pattern) | Ticket.body.ilike(pattern)
        )
    order = Ticket.updated_at.desc() if sort.lstrip("-") == "updated_at" else Ticket.created_at.desc()
    if sort.startswith("-"):
        order = order.nulls_last()
    total = (await session.execute(count_statement)).scalar_one()
    rows = (
        await session.execute(
            statement.order_by(Ticket.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    return PageResult(
        items=[TicketOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TicketDetail)
async def create_ticket(
    payload: TicketCreate,
    settings: Settings = Depends(settings_dep),
    session: AsyncSession = Depends(db_session),
) -> TicketDetail:
    if len(payload.body) > settings.max_ticket_chars:
        raise HTTPException(400, "Ticket exceeds the maximum length")
    customer = None
    if payload.customer_id:
        customer = await session.get(Customer, payload.customer_id)
    if customer is None:
        customer = (
            await session.execute(select(Customer).order_by(Customer.created_at).limit(1))
        ).scalar_one_or_none()
    if customer is None:
        raise HTTPException(400, "No customer is available for this ticket")
    if settings.app_env == "production" and settings.demo_public:
        await session.execute(text("SELECT pg_advisory_xact_lock(1246542671)"))
    count = (await session.execute(select(func.count(Ticket.id)))).scalar_one()
    enforce_public_ticket_capacity(settings, count)
    ticket = Ticket(
        display_id=f"T-{count + 1:04d}",
        customer_id=customer.id,
        subject=payload.subject,
        body=payload.body,
        status="open",
        is_synthetic=True,
    )
    session.add(ticket)
    await session.flush()
    session.add(
        TicketMessage(
            ticket_id=ticket.id,
            author_type="customer",
            author_name=customer.name,
            body=payload.body,
        )
    )
    await session.commit()
    loaded = await session.get(
        Ticket, ticket.id, options=[selectinload(Ticket.messages), selectinload(Ticket.customer)]
    )
    return TicketDetail.model_validate(loaded)


@router.get("/{ticket_id}", response_model=TicketDetail)
async def get_ticket(ticket_id: UUID, session: AsyncSession = Depends(db_session)) -> TicketDetail:
    ticket = await session.get(
        Ticket, ticket_id, options=[selectinload(Ticket.messages), selectinload(Ticket.customer)]
    )
    if ticket is None:
        raise HTTPException(404, "Ticket not found")
    return TicketDetail.model_validate(ticket)


@router.post("/{ticket_id}/ai-runs", response_model=AiRunDetail)
async def run_ai(
    ticket_id: UUID,
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
    guest: str = Depends(guest_key),
    feedback: str | None = None,
) -> AiRunDetail:
    ticket = await session.get(
        Ticket, ticket_id, options=[selectinload(Ticket.messages), selectinload(Ticket.customer)]
    )
    if ticket is None:
        raise HTTPException(404, "Ticket not found")
    try:
        await consume_demo_quota(session, settings, guest)
    except QuotaExceededError as exc:
        raise HTTPException(429, str(exc)) from exc
    runner = SupportWorkflowRunner(settings, session)
    run = await runner.run(ticket, guest_feedback=feedback)
    loaded = await session.get(AiRun, run.id, options=[selectinload(AiRun.steps)])
    return AiRunDetail.model_validate(loaded)


@router.post("/{ticket_id}/ai-runs/{run_id}/review", response_model=AiRunDetail)
async def review_run(
    ticket_id: UUID,
    run_id: UUID,
    payload: HumanReviewRequest,
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
    guest: str = Depends(guest_key),
) -> AiRunDetail:
    ticket = await session.get(Ticket, ticket_id)
    run = await session.get(AiRun, run_id, options=[selectinload(AiRun.steps)])
    if ticket is None or run is None or run.ticket_id != ticket.id:
        raise HTTPException(404, "AI run not found")
    if run.human_decision is not None:
        raise HTTPException(409, "AI run already has a human decision")
    try:
        HumanDecision(payload.decision)
    except ValueError as exc:
        raise HTTPException(400, "Invalid reviewer decision") from exc
    if payload.decision == HumanDecision.REGENERATE.value:
        try:
            await consume_demo_quota(session, settings, guest)
        except QuotaExceededError as exc:
            raise HTTPException(429, str(exc)) from exc
        await apply_human_review(session, run, ticket, payload)
        runner = SupportWorkflowRunner(settings, session)
        regenerated = await runner.run(ticket, guest_feedback=payload.feedback)
        loaded = await session.get(AiRun, regenerated.id, options=[selectinload(AiRun.steps)])
        return AiRunDetail.model_validate(loaded)
    updated = await apply_human_review(session, run, ticket, payload)
    loaded = await session.get(AiRun, updated.id, options=[selectinload(AiRun.steps)])
    return AiRunDetail.model_validate(loaded)
