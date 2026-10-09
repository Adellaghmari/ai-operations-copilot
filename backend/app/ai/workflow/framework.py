"""Microsoft Agent Framework sequential workflow wiring.

The product uses SequentialBuilder when the Agent Framework runtime can be
constructed. Application-level persistence and the single-revision bound stay
in SupportWorkflowRunner so the business rules remain deterministic.
"""

from __future__ import annotations

from typing import Any

from app.ai.prompts.registry import prompt_body
from app.config import Settings
from app.schemas.ai import ResolutionDraft, ReviewResult, TriageResult


def build_sequential_workflow(settings: Settings, chat_client: Any) -> Any | None:
    if settings.app_mode != "foundry":
        return None
    try:
        from agent_framework import Agent
        from agent_framework.orchestrations import SequentialBuilder
    except ImportError:
        return None

    triage = Agent(
        client=chat_client,
        name="TriageAgent",
        instructions=prompt_body("triage"),
        default_options={"response_format": TriageResult},
    )
    resolution = Agent(
        client=chat_client,
        name="ResolutionAgent",
        instructions=prompt_body("resolution"),
        default_options={"response_format": ResolutionDraft},
    )
    review = Agent(
        client=chat_client,
        name="ReviewAgent",
        instructions=prompt_body("review"),
        default_options={"response_format": ReviewResult},
    )
    return SequentialBuilder(
        participants=[triage, resolution, review],
        intermediate_output_from=[triage, resolution],
    ).build()
