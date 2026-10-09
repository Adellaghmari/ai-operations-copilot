import inspect

import pytest
from fastapi import HTTPException, Response

from app.api.deps import enforce_public_ticket_capacity, require_private_demo
from app.api.routes import demo, evaluations, knowledge
from app.api.routes.health import ready
from app.api.routes.tickets import review_run
from app.config import Settings
from app.security import add_browser_security_headers


class HealthySession:
    async def execute(self, _statement: object) -> None:
        return None


class UnavailableSession:
    async def execute(self, _statement: object) -> None:
        raise ConnectionError("database unavailable")


@pytest.mark.asyncio
async def test_readiness_is_success_when_database_responds() -> None:
    response = Response()

    result = await ready(response=response, session=HealthySession())  # type: ignore[arg-type]

    assert response.status_code == 200
    assert result.status == "ready"
    assert result.database is True


@pytest.mark.asyncio
async def test_readiness_is_503_when_database_is_unavailable() -> None:
    response = Response()

    result = await ready(response=response, session=UnavailableSession())  # type: ignore[arg-type]

    assert response.status_code == 503
    assert result.status == "degraded"
    assert result.database is False


def test_public_production_demo_blocks_administrative_mutations() -> None:
    settings = Settings(app_env="production", app_mode="local", demo_public=True)

    with pytest.raises(HTTPException) as raised:
        require_private_demo(settings)

    assert raised.value.status_code == 403


def test_private_or_local_runtime_allows_administrative_mutations() -> None:
    require_private_demo(Settings(app_env="development", app_mode="test", demo_public=True))
    require_private_demo(Settings(app_env="production", app_mode="local", demo_public=False))


def test_public_ticket_capacity_bounds_persistent_demo_growth() -> None:
    settings = Settings(
        app_env="production",
        app_mode="local",
        demo_public=True,
        demo_max_tickets=40,
    )

    enforce_public_ticket_capacity(settings, 39)
    with pytest.raises(HTTPException) as raised:
        enforce_public_ticket_capacity(settings, 40)

    assert raised.value.status_code == 429


def test_admin_guard_is_wired_to_administrative_mutations() -> None:
    for endpoint in (
        knowledge.upload_document,
        knowledge.delete_document,
        evaluations.run_eval,
        demo.reset_demo,
    ):
        assert "require_private_demo" in inspect.getsource(endpoint)


def test_regeneration_consumes_the_same_demo_quota_as_an_initial_run() -> None:
    source = inspect.getsource(review_run)
    regenerate_branch = source.split("HumanDecision.REGENERATE.value", 1)[1]

    assert regenerate_branch.index("consume_demo_quota") < regenerate_branch.index("runner.run")


def test_completed_human_decisions_cannot_be_replayed() -> None:
    source = inspect.getsource(review_run)

    assert "run.human_decision is not None" in source
    assert 'HTTPException(409, "AI run already has a human decision")' in source


def test_api_responses_include_basic_browser_security_headers() -> None:
    response = add_browser_security_headers(Response())

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "camera=()" in response.headers["permissions-policy"]
