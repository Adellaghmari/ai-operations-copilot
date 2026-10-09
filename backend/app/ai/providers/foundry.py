from typing import Any

from pydantic import BaseModel

from app.config import Settings
from app.models.enums import ProviderKind


class FoundryUnavailableError(RuntimeError):
    pass


class FoundryChatProvider:
    kind = ProviderKind.FOUNDRY.value

    def __init__(self, settings: Settings) -> None:
        if not settings.foundry_project_endpoint:
            raise FoundryUnavailableError("FOUNDRY_PROJECT_ENDPOINT is not configured")
        self.model_name = settings.foundry_model
        self._settings = settings
        self._client: Any = None
        self._agent_type: Any = None

    def _load(self) -> None:
        if self._client is not None:
            return
        from agent_framework import Agent
        from agent_framework.foundry import FoundryChatClient
        from azure.identity import DefaultAzureCredential

        self._client = FoundryChatClient(
            project_endpoint=self._settings.foundry_project_endpoint,
            model=self._settings.foundry_model,
            credential=DefaultAzureCredential(),
        )
        self._agent_type = Agent

    async def complete_structured[T: BaseModel](
        self,
        *,
        instructions: str,
        user_input: str,
        schema: type[T],
    ) -> T:
        self._load()
        agent = self._agent_type(
            client=self._client,
            name="structured-agent",
            instructions=instructions,
        )
        result = await agent.run(
            user_input,
            options={"response_format": schema},
        )
        value = getattr(result, "value", None)
        if isinstance(value, schema):
            return value
        if isinstance(value, dict):
            return schema.model_validate(value)
        text = getattr(result, "text", None) or str(result)
        return schema.model_validate_json(text)


class FoundryEmbeddingProvider:
    kind = ProviderKind.FOUNDRY.value

    def __init__(self, settings: Settings) -> None:
        if not settings.foundry_models_endpoint:
            raise FoundryUnavailableError("FOUNDRY_MODELS_ENDPOINT is not configured")
        self.model_name = settings.foundry_embedding_model
        self.dimensions = settings.foundry_embedding_dimensions
        self._settings = settings
        self._client: Any = None

    def _load(self) -> None:
        if self._client is not None:
            return
        from agent_framework.foundry import FoundryEmbeddingClient

        kwargs: dict[str, Any] = {
            "endpoint": self._settings.foundry_models_endpoint,
            "model": self._settings.foundry_embedding_model,
        }
        if self._settings.foundry_models_api_key:
            kwargs["api_key"] = self._settings.foundry_models_api_key
        self._client = FoundryEmbeddingClient(**kwargs)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self._load()
        result = await self._client.get_embeddings(texts)
        return [list(item) for item in result]
