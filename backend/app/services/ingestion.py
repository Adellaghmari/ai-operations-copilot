import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers.factory import get_embedding_provider
from app.ai.retrieval.chunking import estimate_tokens, split_into_chunks
from app.ai.retrieval.service import refresh_chunk_lexical
from app.config import Settings
from app.models.entities import KnowledgeChunk, KnowledgeDocument
from app.models.enums import IngestionStatus


ALLOWED_SUFFIXES = {".md", ".txt", ".pdf"}


def sanitize_filename(name: str) -> str:
    base = Path(name).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("Invalid filename")
    return cleaned


def extract_text(filename: str, payload: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError("Unsupported file type. Upload Markdown, TXT, or PDF.")
    if suffix == ".pdf":
        from io import BytesIO

        reader = PdfReader(BytesIO(payload))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    return payload.decode("utf-8")


async def ingest_document(
    session: AsyncSession,
    settings: Settings,
    document: KnowledgeDocument,
    raw_text: str,
) -> KnowledgeDocument:
    embeddings = get_embedding_provider(settings)
    if (
        document.embedding_dimensions
        and document.embedding_dimensions != embeddings.dimensions
    ):
        raise ValueError("Embedding dimensions do not match the configured model. Reindex required.")
    document.ingestion_status = IngestionStatus.PROCESSING.value
    document.source_text = raw_text
    await session.flush()

    document.chunks.clear()
    await session.flush()

    pieces = split_into_chunks(raw_text)
    vectors = await embeddings.embed([body for _, body in pieces]) if pieces else []
    for index, ((section, body), vector) in enumerate(zip(pieces, vectors, strict=True)):
        chunk = KnowledgeChunk(
            document_id=document.id,
            chunk_index=index,
            section=section,
            body=body,
            embedding=vector,
            embedding_model=embeddings.model_name,
            embedding_dimensions=embeddings.dimensions,
            token_count=estimate_tokens(body),
        )
        session.add(chunk)
        await session.flush()
        await refresh_chunk_lexical(session, chunk.id)

    document.chunk_count = len(pieces)
    document.embedding_model = embeddings.model_name
    document.embedding_dimensions = embeddings.dimensions
    document.last_indexed_at = datetime.now(UTC)
    document.ingestion_status = IngestionStatus.INDEXED.value
    await session.commit()
    await session.refresh(document)
    return document


async def reindex_document(session: AsyncSession, settings: Settings, document_id: UUID) -> None:
    document = await session.get(KnowledgeDocument, document_id)
    if document is None:
        raise ValueError("Document not found")
    await ingest_document(session, settings, document, document.source_text)
