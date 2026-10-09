import re
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from uuid import UUID

from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers.factory import get_embedding_provider
from app.ai.retrieval.chunking import estimate_tokens, split_into_chunks
from app.ai.retrieval.service import refresh_chunk_lexical
from app.config import Settings
from app.models.entities import KnowledgeChunk, KnowledgeDocument
from app.models.enums import IngestionStatus

ALLOWED_SUFFIXES = {".md", ".txt", ".pdf"}


class DocumentParseError(ValueError):
    """Raised when a knowledge file cannot be turned into usable text."""


def sanitize_filename(name: str) -> str:
    base = Path(name).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("Invalid filename")
    return cleaned


def extract_text(filename: str, payload: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise DocumentParseError("Unsupported file type. Upload Markdown, TXT, or PDF.")
    if suffix == ".pdf":
        return _extract_pdf_text(payload)
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DocumentParseError("Text file is not valid UTF-8.") from exc
    if not text.strip():
        raise DocumentParseError("The uploaded text file is empty.")
    return text


def _extract_pdf_text(payload: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(payload))
    except PdfReadError as exc:
        raise DocumentParseError(f"PDF could not be parsed: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise DocumentParseError(f"PDF could not be opened: {exc}") from exc

    pages: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            pages.append(page.extract_text() or "")
        except Exception as exc:  # noqa: BLE001
            raise DocumentParseError(f"PDF page {index} could not be read: {exc}") from exc
    text = "\n\n".join(pages).strip()
    if not text:
        raise DocumentParseError(
            "PDF contained no extractable text. Scanned or image-only PDFs are not indexed."
        )
    return text


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
    await session.flush()

    if not raw_text or not raw_text.strip():
        document.ingestion_status = IngestionStatus.FAILED.value
        document.source_text = ""
        await session.commit()
        raise DocumentParseError("No extractable text. The document was not indexed.")

    document.source_text = raw_text
    await session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
    await session.flush()

    pieces = split_into_chunks(raw_text)
    if not pieces:
        document.ingestion_status = IngestionStatus.FAILED.value
        await session.commit()
        raise DocumentParseError("Text could not be split into usable chunks. The document was not indexed.")

    vectors = await embeddings.embed([body for _, body in pieces])
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
