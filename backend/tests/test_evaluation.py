from app.schemas.ai import ResolutionDraft, TriageResult
from app.services.evaluation import load_golden_cases, score_case


def test_golden_dataset_has_at_least_40_cases() -> None:
    cases = load_golden_cases()
    assert len(cases) >= 40
    for case in cases:
        assert "case_key" in case
        assert "expected" in case
        assert "category" in case["expected"]


def test_score_case_classification() -> None:
    case = {
        "expected": {
            "category": "billing",
            "severity_range": ["P2", "P3"],
            "escalation": True,
            "relevant_document_ids": [],
        }
    }
    triage = TriageResult(
        ticket_summary="Refund",
        category="billing",
        severity="P2",
        urgency="high",
        sentiment="negative",
        retrieval_query="billing refund",
        requires_human_attention=True,
        reasoning_summary="Billing refund needs a specialist.",
    )
    resolution = ResolutionDraft(
        internal_summary="Need billing specialist",
        recommended_actions=["Escalate"],
        customer_response_draft="A specialist will review the refund.",
        escalation_required=True,
    )
    metrics = score_case(case, triage, [], resolution)
    assert metrics["classification_accuracy"] == 1.0
    assert metrics["escalation_accuracy"] == 1.0
    assert metrics["passed"] is True
