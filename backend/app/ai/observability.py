import os
from collections.abc import Sequence

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.trace import Span, Tracer

from app.config import Settings

_configured = False
_use_azure_monitor = False

SAFE_SPAN_PREFIXES = (
    "service.",
    "deployment.",
    "app.",
    "ai.",
    "http.",
    "db.system",
    "db.operation",
    "db.name",
    "otel.",
)

_UNSAFE_ATTRIBUTE_KEYS = {
    "db.statement",
    "db.url",
    "db.connection_string",
    "db.user",
    "gen_ai.prompt",
    "gen_ai.completion",
    "gen_ai.content",
    "llm.prompts",
    "llm.completions",
    "http.request.body",
    "http.response.body",
    "http.request.header.authorization",
}

_UNSAFE_KEY_FRAGMENTS = (
    "password",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "prompt",
    "completion",
    "chunk_body",
    "ticket_body",
    "customer_response",
    "connection_string",
)


def _is_unsafe_attribute(key: str) -> bool:
    lowered = key.lower()
    if lowered in _UNSAFE_ATTRIBUTE_KEYS:
        return True
    return any(fragment in lowered for fragment in _UNSAFE_KEY_FRAGMENTS)


def _otel_primitive(value: object) -> object | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        items = [item for item in value if isinstance(item, (bool, int, float, str))]
        return items or None
    return None


class SensitiveAttributeFilter(SpanProcessor):
    """Drop prompt, body, SQL, and secret attributes before export."""

    def on_start(self, span: Span, parent_context=None) -> None:  # noqa: ANN001
        return None

    def on_end(self, span: ReadableSpan) -> None:
        attributes = getattr(span, "_attributes", None)
        if not attributes:
            return
        for key in list(attributes):
            if _is_unsafe_attribute(key):
                attributes.pop(key, None)

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


class _SafeSpan:
    def __init__(self, span: Span) -> None:
        self._span = span

    def set_attribute(self, key: str, value: object) -> None:
        if _is_unsafe_attribute(key):
            return
        primitive = _otel_primitive(value)
        if primitive is None:
            return
        self._span.set_attribute(key, primitive)

    def set_attributes(self, attributes: dict[str, object]) -> None:
        cleaned: dict[str, object] = {}
        for key, value in attributes.items():
            if _is_unsafe_attribute(str(key)):
                continue
            primitive = _otel_primitive(value)
            if primitive is None:
                continue
            cleaned[str(key)] = primitive
        if cleaned:
            self._span.set_attributes(cleaned)

    def __getattr__(self, name: str) -> object:
        return getattr(self._span, name)

    def __enter__(self):
        entered = self._span.__enter__()
        return _SafeSpan(entered) if entered is not self._span else self

    def __exit__(self, exc_type, exc, tb) -> object:  # noqa: ANN001
        return self._span.__exit__(exc_type, exc, tb)


class _SafeTracer:
    def __init__(self, tracer: Tracer) -> None:
        self._tracer = tracer

    def start_span(self, *args: object, **kwargs: object):
        return _SafeSpan(self._tracer.start_span(*args, **kwargs))

    def start_as_current_span(self, *args: object, **kwargs: object):
        manager = self._tracer.start_as_current_span(*args, **kwargs)

        class _SafeContext:
            def __enter__(inner_self):
                return _SafeSpan(manager.__enter__())

            def __exit__(inner_self, exc_type, exc, tb):  # noqa: ANN001
                return manager.__exit__(exc_type, exc, tb)

        return _SafeContext()

    def __getattr__(self, name: str) -> object:
        return getattr(self._tracer, name)


class SafeTracerProvider(TracerProvider):
    def get_tracer(self, *args: object, **kwargs: object) -> _SafeTracer:  # type: ignore[override]
        return _SafeTracer(super().get_tracer(*args, **kwargs))


def configure_observability(settings: Settings) -> None:
    global _configured, _use_azure_monitor
    if _configured:
        return
    os.environ.setdefault("OTEL_SERVICE_NAME", settings.otel_service_name)
    os.environ.setdefault(
        "OTEL_PYTHON_DISABLED_INSTRUMENTATIONS",
        "sqlalchemy,psycopg,psycopg2,asyncpg,logging,azure_sdk",
    )
    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment": settings.app_env,
        }
    )
    provider = SafeTracerProvider(resource=resource)
    provider.add_span_processor(SensitiveAttributeFilter())
    connection_string = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING", "").strip()
    if connection_string:
        from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter

        provider.add_span_processor(
            BatchSpanProcessor(AzureMonitorTraceExporter(connection_string=connection_string))
        )
        _use_azure_monitor = True
    elif settings.otel_exporter_otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint))
        )
    elif settings.app_env != "production":
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    try:
        from agent_framework.observability import configure_otel_providers

        configure_otel_providers(enable_sensitive_data=settings.enable_sensitive_telemetry)
    except Exception:
        pass
    _configured = True


def instrument_fastapi_app(application) -> None:  # noqa: ANN001
    if not _use_azure_monitor and os.environ.get("APP_ENV", "") == "production":
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(application)
    except Exception:
        pass


def get_tracer():
    return trace.get_tracer("ai-operations-copilot")


def set_safe_span_attributes(span: Span, **attributes: object) -> None:
    """Attach metadata only. Never set ticket text, prompts, chunks, secrets, or tokens."""
    for key, value in attributes.items():
        if value is None:
            continue
        if _is_unsafe_attribute(key):
            continue
        if not key.startswith(SAFE_SPAN_PREFIXES):
            continue
        primitive = _otel_primitive(value)
        if primitive is None:
            continue
        span.set_attribute(key, primitive)
