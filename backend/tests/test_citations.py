from app.ai.citations import bind_citations_to_retrieved
from app.schemas.ai import ResolutionClaim, ResolutionDraft, RetrievedChunk, SourceCitation


def test_citations_are_rewritten_from_stored_chunks() -> None:
    retrieved = [
        RetrievedChunk(
            chunk_id="11111111-1111-1111-1111-111111111111",
            document_id="22222222-2222-2222-2222-222222222222",
            document_name="Billing, invoices, and refunds",
            section="Refunds",
            body="Refunds require a human billing specialist.",
            retrieval_score=0.8,
        )
    ]
    draft = ResolutionDraft(
        internal_summary="Use billing source",
        recommended_actions=["Escalate refund"],
        customer_response_draft="A specialist will review.",
        source_citations=[
            SourceCitation(
                chunk_id="11111111-1111-1111-1111-111111111111",
                document_id="wrong",
                document_name="Hallucinated title",
                section="Wrong",
                snippet="Invented quote",
            )
        ],
        escalation_required=True,
    )
    bound = bind_citations_to_retrieved(draft, retrieved)
    citation = bound.source_citations[0]
    assert citation.document_id == retrieved[0].document_id
    assert citation.document_name == "Billing, invoices, and refunds"
    assert citation.chunk_id == retrieved[0].chunk_id
    assert citation.section == "Refunds"
    assert citation.snippet == "Refunds require a human billing specialist."


def test_unknown_chunk_ids_are_dropped() -> None:
    draft = ResolutionDraft(
        internal_summary="x",
        recommended_actions=[],
        customer_response_draft="x",
        source_citations=[
            SourceCitation(
                chunk_id="33333333-3333-3333-3333-333333333333",
                document_id="44444444-4444-4444-4444-444444444444",
                document_name="Missing",
                section="None",
                snippet="gone",
            )
        ],
        escalation_required=False,
        claims=[
            ResolutionClaim(
                claim_id="c1",
                text="Invented citation",
                cited_chunk_ids=["33333333-3333-3333-3333-333333333333"],
            )
        ],
    )
    bound = bind_citations_to_retrieved(draft, [])
    assert bound.source_citations == []
    assert bound.claims[0].cited_chunk_ids == []
