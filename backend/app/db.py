"""Database engines.

Request handlers use SQLAlchemy 2 async sessions over asyncpg.
The sync engine exists only for Alembic and other offline schema work.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base

settings = get_settings()
async_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)
sync_engine = create_engine(settings.database_url_sync, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(sync_engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


def get_sync_session() -> Session:
    return SyncSessionLocal()


async def create_schema() -> None:
    async with async_engine.connect() as connection:
        autocommit_connection = await connection.execution_options(
            isolation_level="AUTOCOMMIT"
        )
        await autocommit_connection.exec_driver_sql(
            "CREATE EXTENSION IF NOT EXISTS vector"
        )
    async with async_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
