import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts.registry import prompt_versions_metadata
from app.ai.providers.deterministic import DeterministicChatProvider
from app.ai.quality import compute_quality_signal
from app.config import Settings
from app.models.entities import EvaluationResult, EvaluationRun
from app.schemas.ai import ResolutionDraft, ReviewResult, TriageResult

DATASET_VERSION = "golden-v1"


def golden_path() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "evals" / "golden_cases.jsonl"


def load_golden_cases() -> list[dict]:
    path = golden_path()
    if not path.exists():
        path = Path(__file__).resolve().parents[1].parent / "evals" / "golden_cases.jsonl"
    cases = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            cases.append(json.loads(line))
    return cases


def score_case(case: dict, triage: TriageResult, retrieved_ids: list[str], resolution: ResolutionDraft) -> dict:
    expected = case["expected"]
    classification = triage.category == expected.get("category")
    severity_range = expected.get("severity_range", [triage.severity])
    severity = triage.severity in severity_range
    expected_docs = set(expected.get("relevant_document_ids", []))
    recall = (
        1.0
        if not expected_docs
        else len(expected_docs.intersection(retrieved_ids)) / len(expected_docs)
    )
    cited = {item.chunk_id for item in resolution.source_citations}
    citation = 1.0 if not retrieved_ids else len(cited) / max(1, len(retrieved_ids))
    escalation = resolution.escalation_required == bool(expected.get("escalation"))
    validity = True
    passed = classification and severity and escalation and validity
    return {
        "classification_accuracy": 1.0 if classification else 0.0,
        "severity_accuracy": 1.0 if severity else 0.0,
        "retrieval_recall_at_k": recall,
        "citation_coverage": citation,
        "escalation_accuracy": 1.0 if escalation else 0.0,
        "structured_output_validity": 1.0,
        "passed": passed,
    }


async def run_deterministic_evaluation(session: AsyncSession, settings: Settings) -> EvaluationRun:
    chat = DeterministicChatProvider()
    cases = load_golden_cases()
    started = datetime.now(UTC)
    run = EvaluationRun(
        dataset_version=DATASET_VERSION,
        model_deployment="test-fixture",
        prompt_versions=prompt_versions_metadata(),
        provider_kind="test_fixture",
        status="running",
        case_count=len(cases),
        started_at=started,
    )
    session.add(run)
    await session.flush()

    totals = {
        "classification_accuracy": 0.0,
        "severity_accuracy": 0.0,
        "retrieval_recall_at_k": 0.0,
        "citation_coverage": 0.0,
        "escalation_accuracy": 0.0,
        "structured_output_validity": 0.0,
    }
    failed = 0
    for case in cases:
        triage = await chat.complete_structured(
            instructions="triage",
            user_input=case["ticket_body"],
            schema=TriageResult,
        )
        resolution = await chat.complete_structured(
            instructions="resolution",
            user_input=case["ticket_body"] + "\nretrieved_count=0\nNO_RELEVANT_KNOWLEDGE",
            schema=ResolutionDraft,
        )
        review = await chat.complete_structured(
            instructions="review",
            user_input=case["ticket_body"],
            schema=ReviewResult,
        )
        resolution.quality_signal_components = compute_quality_signal(
            [],
            [item.chunk_id for item in resolution.source_citations],
            review,
            triage.missing_information,
            settings.retrieval_min_score,
        )
        metrics = score_case(case, triage, [], resolution)
        if not metrics["passed"]:
            failed += 1
        for key in totals:
            totals[key] += metrics[key]
        session.add(
            EvaluationResult(
                evaluation_run_id=run.id,
                case_key=case["case_key"],
                passed=bool(metrics["passed"]),
                metrics=metrics,
                output={"triage": triage.model_dump(), "resolution": resolution.model_dump()},
                failure_reason=None if metrics["passed"] else "Deterministic expectation mismatch",
            )
        )

    count = max(len(cases), 1)
    run.metrics = {key: round(value / count, 4) for key, value in totals.items()}
    run.metrics["failed_cases"] = failed
    run.status = "completed"
    run.ended_at = datetime.now(UTC)
    run.last_evaluation_at = run.ended_at
    await session.commit()
    await session.refresh(run)
    return run
