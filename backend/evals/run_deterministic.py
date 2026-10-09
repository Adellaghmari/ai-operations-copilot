import asyncio

from app.config import get_settings
from app.db import AsyncSessionLocal, create_schema
from app.services.evaluation import run_deterministic_evaluation


async def main() -> None:
    settings = get_settings()
    await create_schema()
    async with AsyncSessionLocal() as session:
        run = await run_deterministic_evaluation(session, settings)
        print(run.metrics)


if __name__ == "__main__":
    asyncio.run(main())
