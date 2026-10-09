import pytest

from app.ai.providers.deterministic import DeterministicChatProvider
from app.schemas.ai import ReviewResult


@pytest.mark.asyncio
async def test_review_can_request_one_revision() -> None:
    provider = DeterministicChatProvider()
    first = await provider.complete_structured(
        instructions="review",
        user_input="FORCE_REVISE unsupported claim",
        schema=ReviewResult,
    )
    assert first.status == "REVISE"
    second = await provider.complete_structured(
        instructions="review",
        user_input="Grounded draft after revision",
        schema=ReviewResult,
    )
    assert second.status == "PASS"
