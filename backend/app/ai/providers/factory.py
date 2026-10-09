from app.config import Settings
from app.models.enums import ProviderKind
from app.ai.providers.deterministic import DeterministicChatProvider, DeterministicEmbeddingProvider
from app.ai.providers.foundry import FoundryChatProvider, FoundryEmbeddingProvider, FoundryUnavailableError


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
            "Microsoft Foundry embeddings are not configured. Use FOUNDRY_MODELS_ENDPOINT."
        )


def get_chat_provider(settings: Settings):
    if settings.app_mode == "test":
        return DeterministicChatProvider()
    if settings.app_mode == "foundry":
        return FoundryChatProvider(settings)
    if settings.foundry_configured:
        return FoundryChatProvider(settings)
    return UnavailableChatProvider()


def get_embedding_provider(settings: Settings):
    if settings.app_mode == "test":
        return DeterministicEmbeddingProvider()
    if settings.app_mode == "foundry":
        return FoundryEmbeddingProvider(settings)
    return DeterministicEmbeddingProvider()
