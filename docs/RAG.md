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

In `APP_MODE=foundry`, embeddings are produced by `FoundryEmbeddingProvider` against `FOUNDRY_MODELS_ENDPOINT`.

That setting must be the Azure OpenAI v1 endpoint, not the Foundry project endpoint. The installed `FoundryEmbeddingClient` requires an API key (`AzureKeyCredential`), so this project uses Microsoft Entra (`DefaultAzureCredential` + `get_bearer_token_provider`) and `OpenAI.embeddings.create` instead.

Current Microsoft documentation states that project endpoints do not route embedding traffic.

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

Default `k = 60`. Configurable `top_k` (default 6) and minimum score.

**Score semantics (important):**

| Use | Score |
|---|---|
| Candidate relevance | Pre-fusion vector cosine (`1 - distance`) or lexical `ts_rank` |
| RRF | Ordering only: `1/(k + rank)` summed across lists |
| Assurance / retrieval threshold | Pre-fusion `retrieval_score` compared to `retrieval_min_score` (default `0.22`) |

RRF must **not** overwrite the underlying relevance score. An earlier bug did that and caused every live case to abstain; it is fixed. Lexical-only candidates can pass fusion with a lexical `ts_rank` that is not a cosine similarity; the threshold still uses that stored pre-fusion score.

Azure Database for PostgreSQL Flexible Server (PostgreSQL 16, Sweden Central) is used by the public Container App: `vector` extension 0.8.2, `vector(1536)` cosine search, English FTS with GIN, and RRF fusion with `k=60` / `top_k=6`. Azure requires `vector` on `azure.extensions` before `CREATE EXTENSION vector`. Retrieval counts appear on OpenTelemetry spans; chunk bodies do not.

## Citations

Every resolution that uses retrieved text is rebound server-side to stored chunks. The persisted citation always includes `document_id`, `document_name`, `chunk_id`, `section`, and the exact stored snippet. Material claims may only cite retrieved chunk IDs; invented IDs are dropped before the Evidence Ledger is written. The UI opens that snippet from application data. Citations that do not map to retrieved chunks are dropped.

## Limitations

- Hybrid search can still miss the right passage.
- PDF extraction quality depends on the source document.
- Embedding drift occurs if the model changes and the index is not rebuilt.
- A malicious document can attempt indirect prompt injection. Retrieved text is untrusted content, not system instruction.
