from app.ai.quality import compute_quality_signal
from app.schemas.ai import RetrievedChunk, ReviewResult


def test_quality_signal_is_not_a_probability_claim() -> None:
    retrieved = [
        RetrievedChunk(
            chunk_id="c1",
            document_id="d1",
            document_name="Billing",
            section="Refunds",
            body="Refunds require a human specialist.",
            retrieval_score=0.8,
        )
    ]
    review = ReviewResult(status="PASS", review_summary="Grounded")
    signal = compute_quality_signal(retrieved, ["c1"], review, [], 0.22)
    assert signal.label == "AI quality signal"
    assert 0 <= signal.score <= 1
    assert signal.review_pass == 1.0
    assert signal.citation_coverage == 1.0


def test_empty_retrieval_has_zero_coverage() -> None:
    review = ReviewResult(status="REVISE", review_summary="No sources")
    signal = compute_quality_signal([], [], review, ["workspace name"], 0.22)
    assert signal.retrieval_coverage == 0
    assert signal.review_pass == 0
