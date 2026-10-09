import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { KnowledgeDocument } from "../lib/api";
import { describeError } from "../lib/errors";
import type { Tone } from "../lib/presentation";
import { formatDate, formatModelLabel, humanize, pluralize } from "../lib/utils";
import { Dialog } from "../components/Dialog";
import { Disclosure } from "../components/Disclosure";
import { QueryState } from "../components/QueryState";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  TechnicalId,
} from "../components/ui";

const ACCEPTED_TYPES = ".md,.txt,.pdf";

function ingestionTone(status: string): Tone {
  if (status === "indexed") return "good";
  if (status === "failed") return "bad";
  return "info";
}

function visibilityLabel(value: string): string {
  return value === "evaluation_only" ? "Evaluation only" : "Standard";
}

function DocumentDetails({ document: doc }: { document: KnowledgeDocument }) {
  const chunks = useQuery({ queryKey: ["chunks", doc.id], queryFn: () => api.chunks(doc.id) });
  return (
    <div className="space-y-5">
      <dl className="m-0 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted">File</dt>
        <dd className="m-0 break-all">{doc.filename}</dd>
        <dt className="text-muted">Visibility</dt>
        <dd className="m-0">
          {visibilityLabel(doc.visibility)}
          {doc.visibility === "evaluation_only"
            ? ". Used by the evaluation lab. It is excluded from ticket retrieval and search."
            : ". Available to ticket retrieval and search."}
        </dd>
        <dt className="text-muted">Indexing status</dt>
        <dd className="m-0">
          <Badge tone={ingestionTone(doc.ingestion_status)}>{humanize(doc.ingestion_status)}</Badge>
        </dd>
        <dt className="text-muted">Chunks</dt>
        <dd className="m-0">{doc.chunk_count}</dd>
        <dt className="text-muted">Embedding model</dt>
        <dd className="m-0">{formatModelLabel(doc.embedding_model)}</dd>
        <dt className="text-muted">Last indexed</dt>
        <dd className="m-0">{formatDate(doc.last_indexed_at)}</dd>
      </dl>
      <div className="space-y-1">
        <TechnicalId label="document_id" value={doc.id} />
        <TechnicalId label="slug" value={doc.slug} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">Chunks</h3>
        <p className="mt-1 text-xs text-muted">
          Documents are split into chunks. Retrieval, citations, and the Evidence Ledger all refer to these chunks.
        </p>
        <div className="mt-3">
          <QueryState
            query={chunks}
            label="Chunks"
            errorTitle="Chunks could not be loaded"
            isEmpty={(items) => items.length === 0}
            empty={
              <p className="text-sm text-muted">
                This document has no chunks.
                {doc.ingestion_status !== "indexed" ? " Its indexing status is not indexed." : ""}
              </p>
            }
          >
            {(items) => (
              <ul className="m-0 list-none space-y-2 p-0">
                {items.map((chunk) => (
                  <li key={chunk.id}>
                    <Disclosure
                      headingLevel={4}
                      title={`Chunk ${chunk.chunk_index + 1}: ${chunk.section || "Section not recorded"}`}
                      summary={`${chunk.token_count} tokens`}
                    >
                      <p className="whitespace-pre-wrap text-ink">{chunk.body}</p>
                      <div className="mt-2">
                        <TechnicalId label="chunk_id" value={chunk.id} />
                      </div>
                    </Disclosure>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </div>
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const docs = useQuery({ queryKey: ["knowledge"], queryFn: api.knowledge });
  const [searchText, setSearchText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(params.get("document"));
  const [pendingDelete, setPendingDelete] = useState<KnowledgeDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function openDocument(id: string) {
    setDetailsId(id);
    const next = new URLSearchParams(params);
    next.set("document", id);
    setParams(next, { replace: true });
  }

  function closeDocument() {
    setDetailsId(null);
    const next = new URLSearchParams(params);
    next.delete("document");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(searchText.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const search = useQuery({
    queryKey: ["knowledge-search", debounced],
    queryFn: () => api.knowledgeSearch(debounced),
    enabled: debounced.length >= 2,
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
    onSuccess: async () => {
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: async (_result, id) => {
      setPendingDelete(null);
      if (detailsId === id) closeDocument();
      await queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const detailsDoc = docs.data?.find((item) => item.id === detailsId) ?? null;
  const totalChunks = docs.data?.reduce((sum, item) => sum + item.chunk_count, 0);
  const administrativeMutationsEnabled =
    health.data?.administrative_mutations_enabled !== false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge and AI"
        title="Knowledge base"
        description="The documents that retrieval can cite. Every claim in an AI draft is checked against chunks from here."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          {administrativeMutationsEnabled ? (
            <>
              <h2 className="font-semibold text-ink">Upload a document</h2>
              <p className="mt-1 text-xs text-muted">
                Markdown, text, or PDF. The file is split into chunks and embedded. Uploads are stored as synthetic
                demo records, so Reset synthetic demo removes them.
              </p>
              <div className="mt-3">
                <Field label="Choose a file">
                  {(control) => (
                    <input
                      {...control}
                      ref={fileInput}
                      type="file"
                      accept={ACCEPTED_TYPES}
                      disabled={upload.isPending}
                      className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload.mutate(file);
                      }}
                    />
                  )}
                </Field>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-ink">Public demo knowledge</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Upload and delete actions are disabled on the anonymous public demo. Search and chunk inspection remain
                available.
              </p>
            </>
          )}
          {administrativeMutationsEnabled && upload.isPending ? (
            <p role="status" className="mt-3 text-sm text-ink-soft">
              Uploading and indexing. This can take a moment.
            </p>
          ) : null}
          {administrativeMutationsEnabled && upload.isError ? (
            <div className="mt-3">
              <ErrorState compact title="The upload failed" message={describeError(upload.error).summary} />
            </div>
          ) : null}
          {administrativeMutationsEnabled && upload.isSuccess ? (
            <p role="status" className="mt-3 text-sm text-lime">
              {upload.data.title} was added with {pluralize(upload.data.chunk_count, "chunk")}. Indexing status:{" "}
              {humanize(upload.data.ingestion_status).toLowerCase()}.
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">Search the knowledge base</h2>
          <p className="mt-1 text-xs text-muted">
            This runs the same hybrid retrieval the AI workflow uses: vector search plus full text search, merged with
            Reciprocal Rank Fusion.
          </p>
          <div className="mt-3">
            <Field label="Search query" hint="Type at least two characters.">
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="For example: password reset"
                />
              )}
            </Field>
          </div>
        </Card>
      </div>

      {debounced.length >= 2 ? (
        <section aria-labelledby="search-results-heading" className="space-y-2">
          <h2 id="search-results-heading" className="text-lg font-semibold text-ink">
            Search results
          </h2>
          <QueryState
            query={search}
            label="Search results"
            errorTitle="The search failed"
            loading={<LoadingState label="Searching" rows={2} />}
            isEmpty={(items) => items.length === 0}
            empty={
              <EmptyState
                title="No chunks matched"
                body={`The search ran and returned nothing for "${debounced}". Try different words.`}
              />
            }
          >
            {(items) => (
              <ul className="m-0 list-none space-y-2 p-0 text-sm">
                {items.map((item) => (
                  <li key={item.chunk_id} className="rounded-lg border border-line bg-surface p-3">
                    <p className="font-medium text-ink">
                      {item.document_name}, {item.section || "section not recorded"}
                    </p>
                    <p className="mt-1 text-ink-soft">
                      {item.body.length > 280 ? `${item.body.slice(0, 280)}...` : item.body}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Fused score {item.retrieval_score.toFixed(3)}
                      {item.vector_rank ? `, vector rank ${item.vector_rank}` : ""}
                      {item.lexical_rank ? `, text rank ${item.lexical_rank}` : ""}
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => openDocument(item.document_id)}>
                      Open source document
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </section>
      ) : null}

      <section aria-labelledby="documents-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="documents-heading" className="text-lg font-semibold text-ink">
            Documents
          </h2>
          {docs.data ? (
            <p className="text-sm text-muted" data-testid="knowledge-count">
              {docs.data.length} {docs.data.length === 1 ? "document" : "documents"}, {pluralize(totalChunks ?? 0, "chunk")}
            </p>
          ) : null}
        </div>
        <QueryState
          query={docs}
          label="Documents"
          errorTitle="The knowledge base could not be loaded"
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              title="No documents are indexed"
              body={
                administrativeMutationsEnabled
                  ? "Retrieval has nothing to cite, so AI drafts cannot be supported by evidence. Upload a document, or reset the synthetic demo from the dashboard."
                  : "Retrieval has nothing to cite. Reset the synthetic demo from the dashboard to restore seeded knowledge."
              }
            />
          }
        >
          {(items) => (
            <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
              {items.map((doc) => (
                <li key={doc.id}>
                  <Card className="h-full" data-testid={`document-${doc.slug}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink">{doc.title}</h3>
                        <p className="text-xs text-muted">{doc.filename}</p>
                      </div>
                      <Badge tone={doc.visibility === "evaluation_only" ? "warn" : "neutral"}>
                        {visibilityLabel(doc.visibility)}
                      </Badge>
                    </div>
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <Badge tone={ingestionTone(doc.ingestion_status)}>{humanize(doc.ingestion_status)}</Badge>
                      <span>{pluralize(doc.chunk_count, "chunk")}</span>
                      <span>Last indexed {formatDate(doc.last_indexed_at)}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openDocument(doc.id)}>
                        View details and chunks
                      </Button>
                      {administrativeMutationsEnabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            remove.reset();
                            setPendingDelete(doc);
                          }}
                        >
                          Delete document
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>

      <Dialog
        open={detailsDoc !== null}
        onClose={closeDocument}
        title={detailsDoc?.title ?? "Document"}
        description="Document metadata and the chunks retrieval can cite."
        variant="drawer"
        testId="document-drawer"
      >
        {detailsDoc ? <DocumentDetails document={detailsDoc} /> : null}
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this document?"
        description={pendingDelete ? `${pendingDelete.title} and its ${pluralize(pendingDelete.chunk_count, "chunk")}.` : undefined}
        variant="modal"
        testId="delete-document-dialog"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? "Deleting" : "Delete document"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-ink-soft">
          <p>
            The document and all its chunks are removed from retrieval. Future AI runs can no longer cite it. Stored AI
            runs keep the excerpts they already copied.
          </p>
          <p>This cannot be undone from the app. Reset synthetic demo restores the seeded documents.</p>
          {remove.isError ? (
            <ErrorState compact title="The document was not deleted" message={describeError(remove.error).summary} />
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
