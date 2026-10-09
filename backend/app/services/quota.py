from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.entities import DemoUsage


class QuotaExceededError(RuntimeError):
    pass


async def consume_demo_quota(session: AsyncSession, settings: Settings, guest_key: str) -> DemoUsage:
    today = datetime.now(UTC).date()
    statement = select(DemoUsage).where(
        DemoUsage.guest_key == guest_key, DemoUsage.usage_date == today
    )
    usage = (await session.execute(statement)).scalar_one_or_none()
    if usage is None:
        usage = DemoUsage(guest_key=guest_key, usage_date=today, ai_run_count=0)
        session.add(usage)
        await session.flush()
    if usage.ai_run_count >= settings.daily_demo_ai_run_limit:
        raise QuotaExceededError(
            "Daily demo AI run quota has been reached. Try again tomorrow or use a local test run."
        )
    usage.ai_run_count += 1
    await session.flush()
    return usage


def new_guest_key() -> str:
    return uuid4().hex
