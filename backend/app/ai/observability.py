from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

from app.config import Settings

_configured = False


def configure_observability(settings: Settings) -> None:
    global _configured
    if _configured:
        return
    resource = Resource.create({"service.name": settings.otel_service_name})
    provider = TracerProvider(resource=resource)
    if settings.otel_exporter_otlp_endpoint:
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


def get_tracer():
    return trace.get_tracer("ai-operations-copilot")
