from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.retrieval.service import HybridRetrievalService
from app.api.deps import db_session, require_private_demo, settings_dep
from app.config import Settings
from app.models.entities import KnowledgeChunk, KnowledgeDocument
from app.models.enums import DocumentVisibility, IngestionStatus
from app.schemas.ai import RetrievedChunk
from app.schemas.api import KnowledgeChunkOut, KnowledgeDocumentOut
from app.services.ingestion import (
    DocumentParseError,
    extract_text,
    ingest_document,
    sanitize_filename,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=list[KnowledgeDocumentOut])
async def list_documents(session: AsyncSession = Depends(db_session)) -> list[KnowledgeDocumentOut]:
    rows = (
        await session.execute(select(KnowledgeDocument).order_by(KnowledgeDocument.title))
    ).scalars().all()
    return [KnowledgeDocumentOut.model_validate(row) for row in rows]


@router.get("/search", response_model=list[RetrievedChunk])
async def search_knowledge(
    q: str = Query(min_length=2),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
) -> list[RetrievedChunk]:
    service = HybridRetrievalService(settings, session)
    return await service.search(q, exclude_evaluation_only=True)


@router.get("/{document_id}", response_model=KnowledgeDocumentOut)
async def get_document(
    document_id: UUID, session: AsyncSession = Depends(db_session)
) -> KnowledgeDocumentOut:
    document = await session.get(KnowledgeDocument, document_id)
    if document is None:
        raise HTTPException(404, "Document not found")
    return KnowledgeDocumentOut.model_validate(document)


@router.get("/{document_id}/chunks", response_model=list[KnowledgeChunkOut])
async def list_chunks(
    document_id: UUID, session: AsyncSession = Depends(db_session)
) -> list[KnowledgeChunkOut]:
    rows = (
        await session.execute(
            select(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document_id)
            .order_by(KnowledgeChunk.chunk_index)
        )
    ).scalars().all()
    return [KnowledgeChunkOut.model_validate(row) for row in rows]


@router.get("/chunks/{chunk_id}", response_model=KnowledgeChunkOut)
async def get_chunk(chunk_id: UUID, session: AsyncSession = Depends(db_session)) -> KnowledgeChunkOut:
    chunk = await session.get(KnowledgeChunk, chunk_id)
    if chunk is None:
        raise HTTPException(404, "Chunk not found")
    return KnowledgeChunkOut.model_validate(chunk)


@router.post("/upload", response_model=KnowledgeDocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    _: None = Depends(require_private_demo),
    session: AsyncSession = Depends(db_session),
    settings: Settings = Depends(settings_dep),
) -> KnowledgeDocumentOut:
    filename = sanitize_filename(file.filename or "upload.txt")
    payload = await file.read()
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(400, "File exceeds the upload size limit")
    try:
        text = extract_text(filename, payload)
    except DocumentParseError as exc:
        raise HTTPException(400, str(exc)) from exc
    slug = filename.rsplit(".", 1)[0].lower()
    document = KnowledgeDocument(
        slug=f"{slug}-{UUID(int=0).hex[:6]}",
        title=title or filename,
        filename=filename,
        media_type=file.content_type or "text/plain",
        visibility=DocumentVisibility.STANDARD.value,
        ingestion_status=IngestionStatus.PENDING.value,
        is_synthetic=True,
    )
    # unique slug
    from uuid import uuid4

    document.slug = f"{slug}-{uuid4().hex[:8]}"
    session.add(document)
    await session.flush()
    try:
        document = await ingest_document(session, settings, document, text)
    except Exception as exc:  # noqa: BLE001
        document.ingestion_status = IngestionStatus.FAILED.value
        await session.commit()
        raise HTTPException(400, f"Document could not be parsed or indexed: {exc}") from exc
    return KnowledgeDocumentOut.model_validate(document)


@router.delete("/{document_id}")
async def delete_document(
    document_id: UUID,
    _: None = Depends(require_private_demo),
    session: AsyncSession = Depends(db_session),
) -> dict:
    document = await session.get(
        KnowledgeDocument, document_id, options=[selectinload(KnowledgeDocument.chunks)]
    )
    if document is None:
        raise HTTPException(404, "Document not found")
    await session.delete(document)
    await session.commit()
    return {"status": "deleted"}
