from app.ai.providers.deterministic import (
    DeterministicChatProvider,
    DeterministicEmbeddingProvider,
    LocalHashEmbeddingProvider,
)
from app.ai.providers.foundry import (
    FoundryChatProvider,
    FoundryEmbeddingProvider,
    FoundryUnavailableError,
)
from app.config import Settings
from app.models.enums import ProviderKind


class ProductionFixtureError(RuntimeError):
    """Raised when production or Foundry mode would use TEST_MODE fixtures."""


class UnavailableChatProvider:
    kind = ProviderKind.UNAVAILABLE.value
    model_name = "unavailable"

    async def complete_structured(self, **kwargs):  # type: ignore[no-untyped-def]
        raise FoundryUnavailableError(
            "Microsoft Foundry is not configured. Set APP_MODE=foundry and the Foundry environment variables."
        )


class UnavailableEmbeddingProvider:
    kind = ProviderKind.UNAVAILABLE.value
    model_name = "unavailable"
    dimensions = 1536

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise FoundryUnavailableError(
            "Microsoft Foundry embeddings are not configured. "
            "Set FOUNDRY_MODELS_ENDPOINT to the Azure OpenAI v1 endpoint."
        )


def _forbid_production_fixtures(settings: Settings) -> None:
    if settings.app_env == "production" and settings.app_mode == "test":
        raise ProductionFixtureError(
            "Production cannot use TEST_MODE fixtures. Set APP_MODE=foundry."
        )


def _forbid_foundry_fixture(settings: Settings, provider: object) -> None:
    kind = getattr(provider, "kind", "")
    if settings.app_mode == "foundry" and kind == ProviderKind.TEST_FIXTURE.value:
        raise ProductionFixtureError(
            "APP_MODE=foundry cannot fall back to deterministic TEST_MODE fixtures."
        )
    if settings.app_env == "production" and kind == ProviderKind.TEST_FIXTURE.value:
        raise ProductionFixtureError(
            "Production cannot use deterministic TEST_MODE fixtures."
        )


def get_chat_provider(settings: Settings):
    _forbid_production_fixtures(settings)
    if settings.app_mode == "foundry":
        provider = FoundryChatProvider(settings)
        _forbid_foundry_fixture(settings, provider)
        return provider
    if settings.app_mode == "test":
        return DeterministicChatProvider()
    if settings.foundry_configured:
        return FoundryChatProvider(settings)
    return UnavailableChatProvider()


def get_embedding_provider(settings: Settings):
    _forbid_production_fixtures(settings)
    if settings.app_mode == "foundry":
        provider = FoundryEmbeddingProvider(settings)
        _forbid_foundry_fixture(settings, provider)
        return provider
    if settings.app_mode == "test":
        return DeterministicEmbeddingProvider()
    if settings.foundry_configured:
        return FoundryEmbeddingProvider(settings)
    return LocalHashEmbeddingProvider()
