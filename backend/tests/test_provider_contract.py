import inspect

import pytest
from pydantic import ValidationError

from app.ai.providers.deterministic import DeterministicChatProvider, DeterministicEmbeddingProvider
from app.ai.providers.factory import (
    ProductionFixtureError,
    get_chat_provider,
    get_embedding_provider,
)
from app.ai.providers.foundry import (
    FoundryChatProvider,
    FoundryEmbeddingProvider,
    FoundryUnavailableError,
)
from app.config import Settings


def test_production_rejects_test_mode_settings() -> None:
    with pytest.raises(ValidationError, match="cannot use APP_MODE=test"):
        Settings(app_env="production", app_mode="test")


def test_foundry_chat_does_not_return_fixtures() -> None:
    settings = Settings(
        _env_file=None,
        app_env="production",
        app_mode="foundry",
        foundry_project_endpoint="https://example.services.ai.azure.com",
        foundry_models_endpoint="https://example.models.azure.com",
    )
    provider = get_chat_provider(settings)
    assert isinstance(provider, FoundryChatProvider)
    assert provider.kind == "foundry"
    assert not isinstance(provider, DeterministicChatProvider)


def test_foundry_embeddings_do_not_return_fixtures() -> None:
    settings = Settings(
        _env_file=None,
        app_env="production",
        app_mode="foundry",
        foundry_project_endpoint="https://example.services.ai.azure.com",
        foundry_models_endpoint="https://example.models.azure.com",
    )
    provider = get_embedding_provider(settings)
    assert isinstance(provider, FoundryEmbeddingProvider)
    assert provider.kind == "foundry"
    assert not isinstance(provider, DeterministicEmbeddingProvider)


def test_foundry_mode_without_endpoints_does_not_use_fixtures() -> None:
    settings = Settings(
        _env_file=None,
        app_mode="foundry",
        foundry_project_endpoint="",
        foundry_models_endpoint="",
    )
    with pytest.raises(FoundryUnavailableError):
        get_chat_provider(settings)
    with pytest.raises(FoundryUnavailableError):
        get_embedding_provider(settings)


def test_factory_source_has_no_foundry_fixture_fallback() -> None:
    from app.ai.providers import factory

    chat_source = inspect.getsource(factory.get_chat_provider)
    embed_source = inspect.getsource(factory.get_embedding_provider)
    chat_foundry = chat_source.split('if settings.app_mode == "foundry":', 1)[1].split(
        'if settings.app_mode == "test":', 1
    )[0]
    embed_foundry = embed_source.split('if settings.app_mode == "foundry":', 1)[1].split(
        'if settings.app_mode == "test":', 1
    )[0]
    assert "FoundryChatProvider" in chat_foundry
    assert "DeterministicChatProvider" not in chat_foundry
    assert "FoundryEmbeddingProvider" in embed_foundry
    assert "DeterministicEmbeddingProvider" not in embed_foundry


def test_foundry_chat_provider_uses_entra_foundry_client() -> None:
    source = inspect.getsource(FoundryChatProvider)
    assert "FoundryChatClient" in source
    assert "DefaultAzureCredential" in source
    assert "FOUNDRY_API_KEY" not in source
    assert "api_key" not in source


def test_foundry_chat_provider_enforces_timeout_and_max_tokens() -> None:
    source = inspect.getsource(FoundryChatProvider.complete_structured)
    assert "max_tokens" in source
    assert "max_model_output_tokens" in source
    assert "asyncio.wait_for" in source
    assert "ai_request_timeout_seconds" in source
    assert "TimeoutError" in source


def test_foundry_embedding_provider_enforces_timeout() -> None:
    source = inspect.getsource(FoundryEmbeddingProvider)
    assert "asyncio.wait_for" in source
    assert "ai_request_timeout_seconds" in source
    assert "timeout=float(self._settings.ai_request_timeout_seconds)" in source


def test_foundry_embedding_provider_uses_entra_openai_v1() -> None:
    source = inspect.getsource(FoundryEmbeddingProvider)
    assert "FoundryEmbeddingClient" not in source
    assert "DefaultAzureCredential" in source
    assert "get_bearer_token_provider" in source
    assert "embeddings.create" in source
    assert "from azure.core.credentials import AzureKeyCredential" not in source
    assert "foundry_models_api_key" not in source


def test_foundry_embeddings_reject_project_endpoint() -> None:
    with pytest.raises(FoundryUnavailableError, match="must not be the Foundry project endpoint"):
        FoundryEmbeddingProvider(
            Settings(
                _env_file=None,
                foundry_models_endpoint=(
                    "https://example.services.ai.azure.com/api/projects/ai-operations-copilot"
                ),
            )
        )


def test_foundry_embeddings_do_not_require_api_key() -> None:
    provider = FoundryEmbeddingProvider(
        Settings(
            _env_file=None,
            foundry_models_endpoint="https://example.services.ai.azure.com/openai/v1",
            foundry_models_api_key="",
        )
    )
    assert provider.kind == "foundry"
    assert provider.model_name == "text-embedding-3-small"


def test_production_factory_guard() -> None:
    settings = Settings(_env_file=None, app_env="development", app_mode="test")
    assert isinstance(get_chat_provider(settings), DeterministicChatProvider)
    with pytest.raises(ProductionFixtureError):
        get_chat_provider(Settings.model_construct(app_env="production", app_mode="test"))
