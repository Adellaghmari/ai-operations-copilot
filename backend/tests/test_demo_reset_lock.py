import asyncio
import inspect
from types import SimpleNamespace

import pytest

from scripts import seed


def test_demo_reset_uses_postgres_advisory_lock() -> None:
    source = inspect.getsource(seed.seed_database)
    helper = inspect.getsource(seed._acquire_demo_reset_lock) + inspect.getsource(
        seed._release_demo_reset_lock
    )
    assert "pg_advisory_lock" in helper
    assert "pg_advisory_unlock" in helper
    assert "_acquire_demo_reset_lock" in source
    assert "_release_demo_reset_lock" in source
    assert "threading.Lock" not in inspect.getsource(seed)
    assert "asyncio.Lock" not in inspect.getsource(seed)


def test_synthetic_tickets_use_relative_demo_clock() -> None:
    source = inspect.getsource(seed._seed_database)
    assert "datetime.now(UTC)" in source
    assert 'timedelta(days=item["days_ago"]' in source
    assert "live AI runs" in source


def test_demo_reset_lock_survives_orm_commits() -> None:
    acquire = inspect.getsource(seed._acquire_demo_reset_lock)
    seed_source = inspect.getsource(seed.seed_database)
    assert "async_engine.connect" in acquire
    assert "finally" in seed_source


@pytest.mark.asyncio
async def test_concurrent_reset_locks_serialize(monkeypatch: pytest.MonkeyPatch) -> None:
    held = False
    max_held = 0
    current = 0
    wait = asyncio.Event()
    started = asyncio.Event()

    class FakeConnection:
        async def execute(self, statement, params=None):  # noqa: ANN001
            sql = str(statement)
            nonlocal held, max_held, current
            if "pg_advisory_lock" in sql:
                while held:
                    await asyncio.sleep(0.01)
                held = True
                current += 1
                max_held = max(max_held, current)
                started.set()
                await wait.wait()
            elif "pg_advisory_unlock" in sql:
                current -= 1
                held = False
            return SimpleNamespace()

        async def close(self) -> None:
            return None

    async def fake_acquire():
        connection = FakeConnection()
        await connection.execute("SELECT pg_advisory_lock(:key)")
        return connection

    monkeypatch.setattr(seed, "_acquire_demo_reset_lock", fake_acquire)

    async def holder() -> None:
        connection = await seed._acquire_demo_reset_lock()
        await asyncio.sleep(0.05)
        await seed._release_demo_reset_lock(connection)

    first = asyncio.create_task(holder())
    await started.wait()
    second = asyncio.create_task(holder())
    await asyncio.sleep(0.02)
    assert max_held == 1
    wait.set()
    await asyncio.gather(first, second)
    assert max_held == 1
    assert held is False
