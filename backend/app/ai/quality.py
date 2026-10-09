from app.schemas.ai import QualitySignalComponents, RetrievedChunk, ReviewResult


def clip(value: float) -> float:
    return max(0.0, min(1.0, value))


def compute_quality_signal(
    retrieved: list[RetrievedChunk],
    cited_chunk_ids: list[str],
    review: ReviewResult | None,
    missing_information: list[str],
    min_score: float,
) -> QualitySignalComponents:
    if retrieved:
        above = [item for item in retrieved if item.retrieval_score >= min_score]
        retrieval_coverage = len(above) / len(retrieved)
        mean_score = sum(item.retrieval_score for item in retrieved) / len(retrieved)
    else:
        retrieval_coverage = 0.0
        mean_score = 0.0

    if cited_chunk_ids:
        valid = {item.chunk_id for item in retrieved}
        citation_coverage = sum(1 for chunk_id in cited_chunk_ids if chunk_id in valid) / len(
            cited_chunk_ids
        )
    else:
        citation_coverage = 0.0 if retrieved else 0.0

    review_pass = 1.0 if review and review.status == "PASS" else 0.0
    information_completeness = 1.0 if not missing_information else clip(
        1.0 - (0.2 * len(missing_information))
    )
    score = clip(
        0.25 * retrieval_coverage
        + 0.20 * clip(mean_score)
        + 0.25 * citation_coverage
        + 0.20 * review_pass
        + 0.10 * information_completeness
    )
    return QualitySignalComponents(
        retrieval_coverage=round(retrieval_coverage, 4),
        mean_retrieval_score=round(mean_score, 4),
        citation_coverage=round(citation_coverage, 4),
        review_pass=review_pass,
        information_completeness=round(information_completeness, 4),
        score=round(score, 4),
    )
