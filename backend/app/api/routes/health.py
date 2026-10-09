from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, settings_dep
from app.config import Settings
from app.schemas.api import HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(settings_dep)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        app_mode=settings.app_mode,
        foundry_configured=settings.foundry_configured,
        uses_foundry=settings.uses_foundry,
    )


@router.get("/ready", response_model=ReadyResponse)
async def ready(session: AsyncSession = Depends(db_session)) -> ReadyResponse:
    try:
        await session.execute(text("SELECT 1"))
        return ReadyResponse(status="ready", database=True)
    except Exception:
        return ReadyResponse(status="degraded", database=False)
