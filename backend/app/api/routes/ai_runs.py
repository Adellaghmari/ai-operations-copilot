from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session
from app.models.entities import AiRun
from app.schemas.api import AiRunDetail, AiRunOut, PageResult

router = APIRouter(prefix="/ai-runs", tags=["ai-runs"])


@router.get("", response_model=PageResult[AiRunOut])
async def list_runs(
    session: AsyncSession = Depends(db_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PageResult[AiRunOut]:
    from sqlalchemy import func

    total = (await session.execute(select(func.count(AiRun.id)))).scalar_one()
    rows = (
        await session.execute(
            select(AiRun)
            .order_by(AiRun.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return PageResult(
        items=[AiRunOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{run_id}", response_model=AiRunDetail)
async def get_run(run_id: UUID, session: AsyncSession = Depends(db_session)) -> AiRunDetail:
    run = await session.get(AiRun, run_id, options=[selectinload(AiRun.steps)])
    if run is None:
        raise HTTPException(404, "AI run not found")
    return AiRunDetail.model_validate(run)
