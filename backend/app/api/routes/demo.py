from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, require_private_demo, settings_dep
from app.config import Settings
from app.schemas.api import DemoResetResponse
from scripts.seed import seed_database

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=DemoResetResponse)
async def reset_demo(
    _: None = Depends(require_private_demo),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
) -> DemoResetResponse:
    counts = await seed_database(session, settings, reset_synthetic=True)
    return DemoResetResponse(status="refreshed", **counts)
