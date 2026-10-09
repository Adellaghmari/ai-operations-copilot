from app.ai.retrieval.hybrid import reciprocal_rank_fusion
from app.schemas.ai import RetrievedChunk


def _chunk(chunk_id: str, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id="d",
        document_name="Doc",
        section="S",
        body="body",
        retrieval_score=score,
    )


def test_rrf_prefers_items_in_both_lists() -> None:
    vector = [_chunk("a", 0.9), _chunk("b", 0.8), _chunk("c", 0.1)]
    lexical = [_chunk("c", 0.9), _chunk("a", 0.7)]
    fused = reciprocal_rank_fusion(vector, lexical, k=60, top_k=3, min_score=0.0)
    assert fused[0].chunk_id == "a"
    assert {item.chunk_id for item in fused} <= {"a", "b", "c"}


def test_rrf_respects_top_k() -> None:
    vector = [_chunk(str(i), 0.5) for i in range(10)]
    fused = reciprocal_rank_fusion(vector, [], k=60, top_k=4, min_score=0.0)
    assert len(fused) == 4
