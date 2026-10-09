from collections import defaultdict

from app.schemas.ai import RetrievedChunk


def reciprocal_rank_fusion(
    vector_hits: list[RetrievedChunk],
    lexical_hits: list[RetrievedChunk],
    k: int,
    top_k: int,
    min_score: float,
) -> list[RetrievedChunk]:
    scores: dict[str, float] = defaultdict(float)
    merged: dict[str, RetrievedChunk] = {}

    for rank, item in enumerate(vector_hits, start=1):
        scores[item.chunk_id] += 1.0 / (k + rank)
        copy = item.model_copy(update={"vector_rank": rank})
        merged[item.chunk_id] = copy

    for rank, item in enumerate(lexical_hits, start=1):
        scores[item.chunk_id] += 1.0 / (k + rank)
        existing = merged.get(item.chunk_id)
        if existing:
            merged[item.chunk_id] = existing.model_copy(update={"lexical_rank": rank})
        else:
            merged[item.chunk_id] = item.model_copy(update={"lexical_rank": rank})

    ranked = sorted(merged.values(), key=lambda item: scores[item.chunk_id], reverse=True)
    fused: list[RetrievedChunk] = []
    for item in ranked:
        # Filter with the pre-fusion relevance score (cosine or lexical rank).
        # RRF only determines order. Do not replace retrieval_score with the RRF
        # sum: that value is typically ~0.01–0.03 and breaks abstention / quality
        # thresholds calibrated on cosine similarity (for example 0.22).
        vector_ok = item.vector_rank is None or item.retrieval_score >= min_score
        lexical_ok = item.lexical_rank is not None
        if not vector_ok and not lexical_ok:
            continue
        fused.append(item)
        if len(fused) >= top_k:
            break
    return fused
