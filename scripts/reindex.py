"""Reindex knowledge embeddings after an embedding model change."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import select

from app.config import get_settings
from app.db import AsyncSessionLocal, create_schema
from app.models.entities import KnowledgeDocument
from app.services.ingestion import reindex_document


async def main() -> None:
    settings = get_settings()
    await create_schema()
    async with AsyncSessionLocal() as session:
        documents = (await session.execute(select(KnowledgeDocument))).scalars().all()
        for document in documents:
            if (
                document.embedding_dimensions
                and document.embedding_dimensions != settings.foundry_embedding_dimensions
            ):
                print(f"Reindexing {document.slug} to {settings.foundry_embedding_dimensions} dimensions")
            await reindex_document(session, settings, document.id)
        print(f"Reindexed {len(documents)} documents")


if __name__ == "__main__":
    asyncio.run(main())
