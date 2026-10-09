from fastapi import APIRouter, Depends, Response, status
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
        public_demo=settings.demo_public,
        administrative_mutations_enabled=not (
            settings.app_env == "production" and settings.demo_public
        ),
    )


@router.get(
    "/ready",
    response_model=ReadyResponse,
    responses={503: {"description": "A required dependency is unavailable"}},
)
async def ready(
    response: Response,
    session: AsyncSession = Depends(db_session),
) -> ReadyResponse:
    try:
        await session.execute(text("SELECT 1"))
        return ReadyResponse(status="ready", database=True)
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadyResponse(status="degraded", database=False)
