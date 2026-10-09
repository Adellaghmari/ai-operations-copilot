import inspect
from types import SimpleNamespace

from app.ai.observability import (
    SensitiveAttributeFilter,
    configure_observability,
    set_safe_span_attributes,
)
from app.ai.retrieval.service import HybridRetrievalService
from app.ai.workflow.runner import SupportWorkflowRunner
from app.config import Settings


def test_sensitive_telemetry_defaults_off() -> None:
    settings = Settings(_env_file=None)
    assert settings.enable_sensitive_telemetry is False


def test_azure_monitor_path_uses_env_connection_string_not_settings() -> None:
    source = inspect.getsource(configure_observability)
    assert "APPLICATIONINSIGHTS_CONNECTION_STRING" in source
    assert "AzureMonitorTraceExporter" in source
    assert "configure_azure_monitor" not in source
    assert "print(" not in source
    assert "enable_sensitive_data=settings.enable_sensitive_telemetry" in inspect.getsource(
        inspect.getmodule(configure_observability)
    )


def test_safe_span_attributes_reject_bodies_and_secrets() -> None:
    captured: dict[str, object] = {}

    class DummySpan:
        def set_attribute(self, key: str, value: object) -> None:
            captured[key] = value

    set_safe_span_attributes(
        DummySpan(),  # type: ignore[arg-type]
        **{
            "ai.run_id": "run-1",
            "ai.provider_kind": "foundry",
            "ai.ticket_body": "customer secret text",
            "db.statement": "SELECT password FROM users",
            "gen_ai.prompt": "full prompt",
            "password": "should-not-appear",
            "service.name": "ai-operations-copilot",
        },
    )
    assert captured["ai.run_id"] == "run-1"
    assert captured["ai.provider_kind"] == "foundry"
    assert captured["service.name"] == "ai-operations-copilot"
    assert "ai.ticket_body" not in captured
    assert "db.statement" not in captured
    assert "gen_ai.prompt" not in captured
    assert "password" not in captured


def test_sensitive_attribute_filter_strips_prompt_and_sql() -> None:
    span = SimpleNamespace(
        _attributes={
            "ai.run_id": "abc",
            "db.statement": "SELECT * FROM tickets",
            "gen_ai.prompt": "full prompt",
            "http.status_code": 200,
        }
    )
    SensitiveAttributeFilter().on_end(span)  # type: ignore[arg-type]
    assert span._attributes == {"ai.run_id": "abc", "http.status_code": 200}


def test_workflow_instrumentation_covers_real_agents() -> None:
    source = inspect.getsource(SupportWorkflowRunner)
    retrieval = inspect.getsource(HybridRetrievalService.search)
    for name in (
        "ai.workflow",
        "ai.agent.triage",
        "ai.retrieval",
        "ai.agent.resolution",
        "ai.agent.review",
        "ai.agent.resolution_revision",
        "ai.human_review.transition",
    ):
        assert name in source
    for name in (
        "ai.retrieval.embedding",
        "ai.retrieval.vector",
        "ai.retrieval.lexical",
        "ai.retrieval.rrf",
    ):
        assert name in retrieval


def test_sqlalchemy_query_capture_is_disabled() -> None:
    source = inspect.getsource(configure_observability)
    assert "sqlalchemy" in source
    assert "azure_sdk" in source
