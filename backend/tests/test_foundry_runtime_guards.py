import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel, Field

from app.ai.providers.foundry import FoundryChatProvider, FoundryUnavailableError
from app.config import Settings


class _TinySchema(BaseModel):
    ok: bool = Field(description="Whether the structured reply succeeded")


class _FakeAgent:
    def __init__(self, *, delay_seconds: float = 0.0, payload: dict[str, Any] | None = None) -> None:
        self.delay_seconds = delay_seconds
        self.payload = payload or {"ok": True}
        self.last_options: dict[str, Any] | None = None

    async def run(self, _user_input: str, *, options: dict[str, Any] | None = None) -> SimpleNamespace:
        self.last_options = options
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
        return SimpleNamespace(value=self.payload, text=None)


@pytest.mark.asyncio
async def test_foundry_chat_passes_max_tokens_from_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        _env_file=None,
        foundry_project_endpoint="https://example.services.ai.azure.com",
        max_model_output_tokens=1234,
        ai_request_timeout_seconds=30,
    )
    provider = FoundryChatProvider(settings)
    fake = _FakeAgent()

    def _agent_type(**_kwargs: Any) -> _FakeAgent:
        return fake

    monkeypatch.setattr(provider, "_load", lambda: None)
    provider._agent_type = _agent_type
    provider._client = object()

    result = await provider.complete_structured(
        instructions="Return structured JSON.",
        user_input="ping",
        schema=_TinySchema,
    )
    assert result.ok is True
    assert fake.last_options is not None
    assert fake.last_options["max_tokens"] == 1234
    assert fake.last_options["response_format"] is _TinySchema


@pytest.mark.asyncio
async def test_foundry_chat_timeout_raises_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        _env_file=None,
        foundry_project_endpoint="https://example.services.ai.azure.com",
        max_model_output_tokens=16384,
        ai_request_timeout_seconds=1,
    )
    provider = FoundryChatProvider(settings)
    fake = _FakeAgent(delay_seconds=3.0)

    def _agent_type(**_kwargs: Any) -> _FakeAgent:
        return fake

    monkeypatch.setattr(provider, "_load", lambda: None)
    provider._agent_type = _agent_type
    provider._client = object()

    with pytest.raises(FoundryUnavailableError, match="exceeded 1s timeout"):
        await provider.complete_structured(
            instructions="Return structured JSON.",
            user_input="ping",
            schema=_TinySchema,
        )
