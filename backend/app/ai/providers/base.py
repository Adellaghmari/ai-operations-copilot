from typing import Protocol

from pydantic import BaseModel


class ChatProvider(Protocol):
    kind: str
    model_name: str

    async def complete_structured[T: BaseModel](
        self,
        *,
        instructions: str,
        user_input: str,
        schema: type[T],
    ) -> T: ...


class EmbeddingProvider(Protocol):
    kind: str
    model_name: str
    dimensions: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...
