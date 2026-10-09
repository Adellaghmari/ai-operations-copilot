import asyncio
from typing import Any

from pydantic import BaseModel

from app.config import Settings
from app.models.enums import ProviderKind

_AZURE_AI_TOKEN_SCOPE = "https://ai.azure.com/.default"


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
        options = {
            "response_format": schema,
            "max_tokens": self._settings.max_model_output_tokens,
        }
        try:
            result = await asyncio.wait_for(
                agent.run(user_input, options=options),
                timeout=self._settings.ai_request_timeout_seconds,
            )
        except TimeoutError as exc:
            raise FoundryUnavailableError(
                f"Foundry chat request exceeded "
                f"{self._settings.ai_request_timeout_seconds}s timeout"
            ) from exc
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
            raise FoundryUnavailableError(
                "FOUNDRY_MODELS_ENDPOINT is not configured. "
                "Set it to the Azure OpenAI v1 endpoint, not the Foundry project endpoint."
            )
        if "/api/projects/" in settings.foundry_models_endpoint:
            raise FoundryUnavailableError(
                "FOUNDRY_MODELS_ENDPOINT must not be the Foundry project endpoint. "
                "Use the Azure OpenAI v1 embeddings endpoint."
            )
        self.model_name = settings.foundry_embedding_model
        self.dimensions = settings.foundry_embedding_dimensions
        self._settings = settings
        self._client: Any = None

    def _load(self) -> None:
        if self._client is not None:
            return
        from azure.identity import DefaultAzureCredential, get_bearer_token_provider
        from openai import OpenAI

        # The Foundry models embedding SDK client requires a key credential.
        # This project authenticates with Microsoft Entra only, so embeddings use the
        # Azure OpenAI v1 path with DefaultAzureCredential.
        # OpenAI() accepts the sync token provider; AsyncOpenAI tries to await it.
        token_provider = get_bearer_token_provider(
            DefaultAzureCredential(),
            _AZURE_AI_TOKEN_SCOPE,
        )
        self._client = OpenAI(
            base_url=self._settings.foundry_models_endpoint.rstrip("/"),
            api_key=token_provider,
            timeout=float(self._settings.ai_request_timeout_seconds),
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self._load()
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self._client.embeddings.create,
                    model=self.model_name,
                    input=texts,
                    dimensions=self.dimensions,
                ),
                timeout=self._settings.ai_request_timeout_seconds,
            )
        except TimeoutError as exc:
            raise FoundryUnavailableError(
                f"Foundry embedding request exceeded "
                f"{self._settings.ai_request_timeout_seconds}s timeout"
            ) from exc
        vectors: list[list[float]] = []
        for item in response.data:
            vector = [float(value) for value in item.embedding]
            if not vector:
                raise FoundryUnavailableError("Embedding response contained an empty vector")
            vectors.append(vector)
        if len(vectors) != len(texts):
            raise FoundryUnavailableError("Embedding response count did not match input count")
        return vectors
