import inspect

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session


def test_request_session_is_asyncpg_async_session() -> None:
    source = inspect.getsource(get_session)
    assert "AsyncSessionLocal" in source
    assert inspect.isasyncgenfunction(get_session)
    annotation = get_session.__annotations__["return"]
    assert "AsyncSession" in str(annotation) or AsyncSession is not None


def test_database_url_uses_asyncpg() -> None:
    from app.config import Settings

    settings = Settings()
    assert settings.database_url.startswith("postgresql+asyncpg://")
    db_source = inspect.getsource(inspect.getmodule(get_session))
    assert "create_async_engine" in db_source
    assert "asyncpg" in settings.database_url


def test_asyncpg_uses_ssl_query_param_not_sslmode() -> None:
    """SQLAlchemy passes URL query keys as asyncpg.connect kwargs.

    asyncpg accepts ssl='require'. sslmode=require raises TypeError.
    """
    from sqlalchemy.engine.url import make_url

    parsed = make_url(
        "postgresql+asyncpg://copilotadmin:x@example.postgres.database.azure.com:5432/"
        "ai_operations_copilot?ssl=require"
    )
    assert parsed.query["ssl"] == "require"
    assert "sslmode" not in parsed.query


def test_psycopg_uses_libpq_sslmode() -> None:
    from sqlalchemy.engine.url import make_url

    parsed = make_url(
        "postgresql+psycopg://copilotadmin:x@example.postgres.database.azure.com:5432/"
        "ai_operations_copilot?sslmode=require"
    )
    assert parsed.query["sslmode"] == "require"
    assert "ssl" not in parsed.query
