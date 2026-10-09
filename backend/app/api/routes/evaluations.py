from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session, settings_dep
from app.config import Settings
from app.models.entities import EvaluationResult, EvaluationRun
from app.schemas.api import EvaluationCaseOut, EvaluationRunOut
from app.services.evaluation import load_golden_cases, run_deterministic_evaluation

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


@router.get("/cases", response_model=list[EvaluationCaseOut])
async def list_cases() -> list[EvaluationCaseOut]:
    return [
        EvaluationCaseOut(case_key=item["case_key"], title=item["title"], expected=item["expected"])
        for item in load_golden_cases()
    ]


@router.get("", response_model=list[EvaluationRunOut])
async def list_runs(session: AsyncSession = Depends(db_session)) -> list[EvaluationRunOut]:
    rows = (
        await session.execute(select(EvaluationRun).order_by(EvaluationRun.started_at.desc()))
    ).scalars().all()
    return [EvaluationRunOut.model_validate(row) for row in rows]


@router.get("/{run_id}/results")
async def run_results(run_id: UUID, session: AsyncSession = Depends(db_session)) -> list[dict]:
    rows = (
        await session.execute(
            select(EvaluationResult).where(EvaluationResult.evaluation_run_id == run_id)
        )
    ).scalars().all()
    return [
        {
            "case_key": row.case_key,
            "passed": row.passed,
            "metrics": row.metrics,
            "failure_reason": row.failure_reason,
        }
        for row in rows
    ]


@router.post("/run", response_model=EvaluationRunOut)
async def run_eval(
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
) -> EvaluationRunOut:
    if settings.demo_disable_full_eval and settings.app_mode == "foundry":
        raise HTTPException(
            403,
            "Full Foundry evaluation runs are disabled in public demo mode.",
        )
    run = await run_deterministic_evaluation(session, settings)
    return EvaluationRunOut.model_validate(run)
