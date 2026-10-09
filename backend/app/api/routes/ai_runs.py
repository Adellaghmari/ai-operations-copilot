from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.assurance.replay import compare_runs
from app.api.deps import db_session
from app.models.entities import AiRun
from app.schemas.api import AiRunDetail, AiRunOut, PageResult
from app.schemas.assurance import RunComparison

router = APIRouter(prefix="/ai-runs", tags=["ai-runs"])


@router.get("", response_model=PageResult[AiRunOut])
async def list_runs(
    session: AsyncSession = Depends(db_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ticket_id: UUID | None = None,
) -> PageResult[AiRunOut]:
    from sqlalchemy import func

    count_statement = select(func.count(AiRun.id))
    statement = select(AiRun)
    if ticket_id:
        count_statement = count_statement.where(AiRun.ticket_id == ticket_id)
        statement = statement.where(AiRun.ticket_id == ticket_id)
    total = (await session.execute(count_statement)).scalar_one()
    rows = (
        (
            await session.execute(
                statement.order_by(AiRun.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    return PageResult(
        items=[AiRunOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{run_id}/compare/{other_id}", response_model=RunComparison)
async def compare_run_pair(
    run_id: UUID,
    other_id: UUID,
    session: AsyncSession = Depends(db_session),
) -> RunComparison:
    left = await session.get(AiRun, run_id)
    right = await session.get(AiRun, other_id)
    if left is None or right is None:
        raise HTTPException(404, "AI run not found")
    if left.ticket_id != right.ticket_id:
        raise HTTPException(400, "Runs must belong to the same case")
    return compare_runs(
        AiRunOut.model_validate(left).model_dump(mode="json"),
        AiRunOut.model_validate(right).model_dump(mode="json"),
    )


@router.get("/{run_id}", response_model=AiRunDetail)
async def get_run(run_id: UUID, session: AsyncSession = Depends(db_session)) -> AiRunDetail:
    run = await session.get(AiRun, run_id, options=[selectinload(AiRun.steps)])
    if run is None:
        raise HTTPException(404, "AI run not found")
    return AiRunDetail.model_validate(run)
