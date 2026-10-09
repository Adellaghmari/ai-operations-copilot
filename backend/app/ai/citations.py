from app.schemas.ai import ResolutionClaim, ResolutionDraft, RetrievedChunk, SourceCitation


def bind_citations_to_retrieved(
    resolution: ResolutionDraft, retrieved: list[RetrievedChunk]
) -> ResolutionDraft:
    """Replace model-emitted citation fields with stored retrieval metadata.

    The UI must inspect exact stored snippet text, not a paraphrased quote.
    Citations that do not map to a retrieved chunk are dropped.
    Claim cited_chunk_ids that do not exist in the retrieval set are dropped.
    """
    by_id = {item.chunk_id: item for item in retrieved}
    bound: list[SourceCitation] = []
    seen: set[str] = set()
    for citation in resolution.source_citations:
        source = by_id.get(citation.chunk_id)
        if source is None or source.chunk_id in seen:
            continue
        seen.add(source.chunk_id)
        bound.append(
            SourceCitation(
                chunk_id=source.chunk_id,
                document_id=source.document_id,
                document_name=source.document_name,
                section=source.section,
                snippet=source.body,
            )
        )
    claims: list[ResolutionClaim] = []
    for claim in resolution.claims:
        valid = [chunk_id for chunk_id in claim.cited_chunk_ids if chunk_id in by_id]
        claims.append(claim.model_copy(update={"cited_chunk_ids": valid}))
    return resolution.model_copy(update={"source_citations": bound, "claims": claims})
