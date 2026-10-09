from uuid import UUID

from sqlalchemy import Select, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.providers.factory import get_embedding_provider
from app.ai.retrieval.hybrid import reciprocal_rank_fusion
from app.config import Settings
from app.models.entities import KnowledgeChunk, KnowledgeDocument
from app.schemas.ai import RetrievedChunk


class HybridRetrievalService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self.settings = settings
        self.session = session
        self.embeddings = get_embedding_provider(settings)

    async def search(
        self,
        query: str,
        exclude_evaluation_only: bool = True,
    ) -> list[RetrievedChunk]:
        vector = (await self.embeddings.embed([query]))[0]
        vector_hits = await self._vector_search(vector, exclude_evaluation_only)
        lexical_hits = await self._lexical_search(query, exclude_evaluation_only)
        return reciprocal_rank_fusion(
            vector_hits,
            lexical_hits,
            k=self.settings.retrieval_rrf_k,
            top_k=self.settings.retrieval_top_k,
            min_score=self.settings.retrieval_min_score,
        )

    async def _vector_search(
        self, vector: list[float], exclude_evaluation_only: bool
    ) -> list[RetrievedChunk]:
        distance = KnowledgeChunk.embedding.cosine_distance(vector)
        statement: Select[tuple[KnowledgeChunk, KnowledgeDocument, float]] = (
            select(KnowledgeChunk, KnowledgeDocument, distance.label("distance"))
            .join(KnowledgeDocument)
            .where(KnowledgeChunk.embedding.is_not(None))
        )
        if exclude_evaluation_only:
            statement = statement.where(KnowledgeDocument.visibility == "standard")
        statement = statement.order_by(distance).limit(self.settings.retrieval_top_k * 3)
        rows = (await self.session.execute(statement)).all()
        results: list[RetrievedChunk] = []
        for chunk, document, distance_value in rows:
            score = 1.0 - float(distance_value or 1.0)
            results.append(_to_chunk(chunk, document, score))
        return results

    async def _lexical_search(
        self, query: str, exclude_evaluation_only: bool
    ) -> list[RetrievedChunk]:
        ts_query = func.plainto_tsquery("english", query)
        rank = func.ts_rank_cd(KnowledgeChunk.lexical, ts_query)
        statement = (
            select(KnowledgeChunk, KnowledgeDocument, rank.label("rank"))
            .join(KnowledgeDocument)
            .where(KnowledgeChunk.lexical.is_not(None))
            .where(KnowledgeChunk.lexical.op("@@")(ts_query))
        )
        if exclude_evaluation_only:
            statement = statement.where(KnowledgeDocument.visibility == "standard")
        statement = statement.order_by(rank.desc()).limit(self.settings.retrieval_top_k * 3)
        rows = (await self.session.execute(statement)).all()
        return [
            _to_chunk(chunk, document, float(rank_value or 0.0))
            for chunk, document, rank_value in rows
        ]

    async def get_chunk(self, chunk_id: UUID) -> KnowledgeChunk | None:
        return await self.session.get(
            KnowledgeChunk, chunk_id, options=[selectinload(KnowledgeChunk.document)]
        )


def _to_chunk(chunk: KnowledgeChunk, document: KnowledgeDocument, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=str(chunk.id),
        document_id=str(document.id),
        document_name=document.title,
        section=chunk.section,
        body=chunk.body,
        retrieval_score=round(score, 6),
    )


async def refresh_chunk_lexical(session: AsyncSession, chunk_id: UUID) -> None:
    await session.execute(
        text(
            "UPDATE knowledge_chunks SET lexical = to_tsvector('english', body) WHERE id = :id"
        ),
        {"id": str(chunk_id)},
    )
