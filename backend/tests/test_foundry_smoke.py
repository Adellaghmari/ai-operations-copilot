"""Opt-in live Foundry smoke tests. Skipped unless RUN_FOUNDRY_SMOKE=1.

These tests call real Azure deployments. They must never use TEST_MODE fixtures.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.ai.providers.deterministic import DeterministicChatProvider, DeterministicEmbeddingProvider
from app.ai.providers.factory import get_chat_provider, get_embedding_provider
from app.ai.providers.foundry import FoundryChatProvider, FoundryEmbeddingProvider
from app.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[2]
REPO_ENV = REPO_ROOT / ".env"


def _live_requested() -> bool:
    return os.environ.get("RUN_FOUNDRY_SMOKE") == "1"


def _live_settings() -> Settings:
    loaded = Settings(_env_file=REPO_ENV if REPO_ENV.is_file() else None)
    settings = loaded.model_copy(update={"app_env": "development", "app_mode": "foundry"})
    if settings.app_mode != "foundry":
        pytest.fail("Live smoke tests require APP_MODE=foundry. TEST_MODE fallback is forbidden.")
    if not settings.foundry_project_endpoint or not settings.foundry_models_endpoint:
        pytest.fail("Live smoke tests require FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODELS_ENDPOINT.")
    return settings


@pytest.fixture
def live_settings() -> Settings:
    if not _live_requested():
        pytest.skip("Live Foundry smoke tests require RUN_FOUNDRY_SMOKE=1 after Azure CLI login.")
    return _live_settings()


class SmokeReply(BaseModel):
    reply: str


@pytest.mark.cloud
@pytest.mark.asyncio
async def test_real_foundry_chat_gpt5_mini(live_settings: Settings) -> None:
    provider = get_chat_provider(live_settings)
    assert isinstance(provider, FoundryChatProvider)
    assert not isinstance(provider, DeterministicChatProvider)
    assert provider.kind == "foundry"
    assert provider.model_name == "gpt-5-mini"
    assert live_settings.app_mode == "foundry"

    result = await provider.complete_structured(
        instructions="Reply with a short confirmation. Do not mention tests or fixtures.",
        user_input="Respond with reply set to the single word ready.",
        schema=SmokeReply,
    )
    assert isinstance(result, SmokeReply)
    assert result.reply.strip()
    assert "fixture" not in result.reply.lower()
    assert "test_mode" not in result.reply.lower()


@pytest.mark.cloud
@pytest.mark.asyncio
async def test_real_foundry_embeddings_text_embedding_3_small(live_settings: Settings) -> None:
    provider = get_embedding_provider(live_settings)
    assert isinstance(provider, FoundryEmbeddingProvider)
    assert not isinstance(provider, DeterministicEmbeddingProvider)
    assert provider.kind == "foundry"
    assert provider.model_name == "text-embedding-3-small"
    assert live_settings.app_mode == "foundry"

    vectors = await provider.embed(["Azure Foundry embedding smoke test"])
    assert len(vectors) == 1
    vector = vectors[0]
    assert isinstance(vector, list)
    assert len(vector) > 0
    assert all(isinstance(value, float) for value in vector)
    assert any(value != 0.0 for value in vector)
