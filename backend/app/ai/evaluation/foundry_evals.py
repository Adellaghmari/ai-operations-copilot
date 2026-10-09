"""Optional Microsoft Foundry quality evaluations.

`FoundryEvals` in agent-framework-foundry is marked experimental.
Deterministic metrics in this repository remain the generally available path.
This module is only used when APP_MODE=foundry and credentials exist.
"""

from __future__ import annotations

from typing import Any


async def run_foundry_quality_eval(queries: list[str]) -> dict[str, Any] | None:
    try:
        from agent_framework.foundry import FoundryEvals
    except Exception:
        return None
    evals = FoundryEvals()
    return {
        "provider": "foundry_evals_experimental",
        "note": "FoundryEvals is experimental. Results are stored only after a real run.",
        "configured": evals is not None,
        "query_count": len(queries),
    }
