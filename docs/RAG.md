# Retrieval Augmented Generation

The product does not paste knowledge into a system prompt. Documents are ingested, chunked, embedded, and retrieved at query time.

## Ingestion

1. Validate type and size (`md`, `txt`, `pdf`; default max 5 MB)
2. Sanitize the filename and reject path traversal
3. Extract text
4. Normalize whitespace and keep heading structure
5. Split into chunks
6. Generate embeddings
7. Store chunk text, metadata, embedding, and lexical `tsvector`

## Chunking

Markdown-aware recursive split:

- Target about 800 tokens
- About 15% overlap
- Prefer heading and paragraph boundaries
- Reject tiny fragments and oversized blobs

Why this size: support knowledge needs enough surrounding procedure to be useful, but must stay small enough for precise citations and bounded prompt context.

## Embeddings

In `APP_MODE=foundry`, embeddings are produced by `FoundryEmbeddingClient` against `FOUNDRY_MODELS_ENDPOINT`.

The Foundry **project** endpoint is not used for embeddings. Current Microsoft documentation states that project endpoints do not route embedding traffic.

Each chunk stores:

- embedding vector
- embedding model name
- embedding dimensions

Reindex is required when the model or dimension changes. Mixed dimensions in one index are rejected.

In `APP_MODE=test`, embeddings are deterministic fixture vectors used only for automated tests.

## Hybrid search

Two independent candidate lists:

1. Vector cosine similarity via pgvector
2. PostgreSQL full-text search (`tsvector` / `tsquery`)

They are fused with Reciprocal Rank Fusion:

```
RRF(d) = Σ 1 / (k + rank_i(d))
```

Default `k = 60`. Configurable `top_k` (default 6) and minimum score. Chunks below the threshold are dropped so the Resolution Agent does not receive clearly irrelevant context.

## Citations

Every resolution that uses retrieved text must cite chunk IDs. The UI opens the source document, section, and snippet. Citations that do not map to stored chunks are treated as a review failure.

## Limitations

- Hybrid search can still miss the right passage.
- PDF extraction quality depends on the source document.
- Embedding drift occurs if the model changes and the index is not rebuilt.
- A malicious document can attempt indirect prompt injection. Retrieved text is untrusted content, not system instruction.
