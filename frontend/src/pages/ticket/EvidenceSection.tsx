import { useEffect, useRef, useState } from "react";
import type { AiRun, AssuranceReport, EvidenceLedgerEntry, RetrievedChunk } from "../../lib/api";
import { materialityTone, supportTone } from "../../lib/presentation";
import { humanize } from "../../lib/utils";
import { Badge, Button, Card, TechnicalId } from "../../components/ui";
import { Disclosure } from "../../components/Disclosure";

const SUPPORT_ORDER = ["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "CONFLICTED", "NOT_EVIDENCE_REQUIRED"];

function countBySupport(ledger: EvidenceLedgerEntry[]): { state: string; count: number }[] {
  return SUPPORT_ORDER.map((state) => ({
    state,
    count: ledger.filter((entry) => entry.support_state === state).length,
  })).filter((item) => item.count > 0);
}

/** Inline, non modal inspector for one retrieved chunk. It shows exactly what was stored. */
function SourceInspector({ chunk, onClose }: { chunk: RetrievedChunk; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, [chunk.chunk_id]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label={`Source: ${chunk.document_name}`}
      className="rounded-lg border border-line-strong bg-surface-2 p-4 text-sm outline-none"
      data-testid="citation-snippet"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{chunk.document_name}</p>
          <p className="text-xs text-muted">Section: {chunk.section || "Not recorded"}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close source
        </Button>
      </div>
      <div className="mt-2 space-y-1">
        <TechnicalId label="document_id" value={chunk.document_id} />
        <TechnicalId label="chunk_id" value={chunk.chunk_id} />
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-surface p-3 text-ink">{chunk.body}</p>
    </div>
  );
}

function RetrievedSources({
  chunks,
  onSelect,
}: {
  chunks: RetrievedChunk[];
  onSelect: (chunk: RetrievedChunk) => void;
}) {
  return (
    <ul className="m-0 list-none space-y-2 p-0 text-sm">
      {chunks.map((chunk, index) => (
        <li key={chunk.chunk_id}>
          <button
            type="button"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-left hover:bg-surface-2"
            data-testid={`retrieved-chunk-${chunk.chunk_id}`}
            onClick={() => onSelect(chunk)}
          >
            <span className="block font-medium text-ink">
              {index + 1}. {chunk.document_name}, {chunk.section || "section not recorded"}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Fused score {chunk.retrieval_score.toFixed(3)}
              {chunk.vector_rank ? `, vector rank ${chunk.vector_rank}` : ""}
              {chunk.lexical_rank ? `, text rank ${chunk.lexical_rank}` : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LedgerRow({
  entry,
  onSelect,
}: {
  entry: EvidenceLedgerEntry;
  onSelect: (chunk: RetrievedChunk) => void;
}) {
  return (
    <li
      className="rounded-lg border border-line bg-surface p-3 text-sm"
      data-testid={`ledger-${entry.claim_id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Claim, {humanize(entry.category)}
          {entry.requires_evidence ? "" : ", no evidence needed"}
        </p>
        <Badge tone={supportTone(entry.support_state)}>{humanize(entry.support_state)}</Badge>
      </div>
      <p className="mt-1 text-ink">{entry.claim}</p>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">Evidence</p>
      {entry.evidence.length ? (
        <ul className="m-0 mt-1 list-none space-y-1 p-0">
          {entry.evidence.map((item) => (
            <li key={item.chunk_id}>
              <button
                type="button"
                className="text-left text-ink underline underline-offset-2 hover:text-lime"
                data-testid={`ledger-chunk-${item.chunk_id}`}
                onClick={() =>
                  onSelect({
                    chunk_id: item.chunk_id,
                    document_id: item.document_id,
                    document_name: item.document_name,
                    section: item.section,
                    body: item.excerpt,
                    retrieval_score: 0,
                  })
                }
              >
                {item.document_name}, {item.section}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted">
          No retrieved chunk supports this claim.
          {entry.requires_evidence ? "" : " It does not need one."}
        </p>
      )}
      {entry.review_note ? <p className="mt-2 text-xs text-muted">Review note: {entry.review_note}</p> : null}
    </li>
  );
}

export function EvidenceSection({
  run,
  report,
}: {
  run: AiRun | undefined;
  report: AssuranceReport | undefined;
}) {
  const [selected, setSelected] = useState<RetrievedChunk | null>(null);
  const chunks = run?.retrieval_result?.chunks ?? [];
  const citations = run?.resolution_draft?.source_citations ?? [];
  const ledger = report?.ledger ?? [];
  const counts = countBySupport(ledger);

  function selectCitation(citation: (typeof citations)[number]) {
    setSelected({
      chunk_id: citation.chunk_id,
      document_id: citation.document_id,
      document_name: citation.document_name,
      section: citation.section,
      body: citation.snippet,
      retrieval_score: 0,
    });
  }

  return (
    <div className="space-y-4">
      <Card data-testid="citations-panel">
        <h3 className="text-sm font-semibold text-ink">Retrieved knowledge</h3>
        <p className="mt-1 text-xs text-muted">
          Hybrid retrieval combines vector search and full text search, then merges the two rankings with Reciprocal
          Rank Fusion. The score is a rank fusion value, not a measure of correctness.
        </p>
        <div className="mt-3">
          {!run ? (
            <p className="text-sm text-muted">No sources yet. Run an AI analysis to retrieve knowledge.</p>
          ) : chunks.length === 0 ? (
            <p className="text-sm text-muted">
              This run retrieved no knowledge chunks. Claims that need evidence cannot be supported, which is why the
              assurance gates may block or abstain.
            </p>
          ) : (
            <RetrievedSources chunks={chunks} onSelect={setSelected} />
          )}
        </div>
        {citations.length ? (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-ink">Citations bound to the draft</h4>
            <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm">
              {citations.map((citation) => (
                <li key={citation.chunk_id}>
                  <button
                    type="button"
                    className="text-left underline underline-offset-2 hover:text-lime"
                    data-testid={`citation-${citation.chunk_id}`}
                    onClick={() => selectCitation(citation)}
                  >
                    {citation.document_name}, {citation.section}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {selected ? (
          <div className="mt-4">
            <SourceInspector chunk={selected} onClose={() => setSelected(null)} />
          </div>
        ) : null}
      </Card>

      <Card data-testid="evidence-ledger">
        <h3 className="text-sm font-semibold text-ink">Evidence Ledger</h3>
        <p className="mt-1 text-sm text-muted">
          What exactly did the AI claim, and which retrieved evidence supports it?
        </p>
        {report ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Coverage: {report.coverage.display}</span>
              {counts.map((item) => (
                <Badge key={item.state} tone={supportTone(item.state)}>
                  {item.count} {humanize(item.state).toLowerCase()}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted">
              Coverage counts how many evidence requiring claims have a supporting retrieved chunk. It is not the
              probability that the AI is right.
            </p>
            {ledger.length ? (
              <ul className="m-0 list-none space-y-3 p-0">
                {ledger.map((entry) => (
                  <LedgerRow key={entry.claim_id} entry={entry} onSelect={setSelected} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                The ledger is empty because the system produced no claims to check. This is expected when it
                abstained.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Run an AI analysis to build the Evidence Ledger.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="evidence-gaps">
          <h3 className="text-sm font-semibold text-ink">Evidence gaps</h3>
          <p className="mt-1 text-xs text-muted">Facts the knowledge base could not supply for this case.</p>
          {report ? (
            <ul className="m-0 mt-3 list-none space-y-3 p-0 text-sm">
              {report.gaps.map((gap) => (
                <li key={`${gap.concept}-${gap.reason}`}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{gap.concept}</span>
                    <Badge tone={materialityTone(gap.materiality)}>{humanize(gap.materiality)}</Badge>
                  </p>
                  <p className="mt-0.5 text-muted">{gap.reason}</p>
                </li>
              ))}
              {report.gaps.length === 0 ? (
                <li className="text-muted">No evidence gap was recorded for this run.</li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Run an AI analysis to check for gaps.</p>
          )}
        </Card>

        <Card data-testid="conflicting-evidence">
          <h3 className="text-sm font-semibold text-ink">Conflicting evidence</h3>
          <p className="mt-1 text-xs text-muted">
            Sources that may disagree on this decision. A conflict is a signal to check, not proof.
          </p>
          {report ? (
            <ul className="m-0 mt-3 list-none space-y-3 p-0 text-sm">
              {report.conflicts.map((conflict) => (
                <li key={`${conflict.chunk_a}-${conflict.chunk_b}`}>
                  <Disclosure
                    headingLevel={4}
                    title="Sources may disagree"
                    summary={conflict.summary}
                    trailing={<Badge tone={materialityTone(conflict.materiality)}>{humanize(conflict.materiality)}</Badge>}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md bg-amber-400/10 p-3">
                        <p className="text-xs font-medium text-muted">
                          {conflict.document_a}, {conflict.section_a}
                        </p>
                        <p className="mt-1 text-ink">{conflict.excerpt_a}</p>
                      </div>
                      <div className="rounded-md bg-amber-400/10 p-3">
                        <p className="text-xs font-medium text-muted">
                          {conflict.document_b}, {conflict.section_b}
                        </p>
                        <p className="mt-1 text-ink">{conflict.excerpt_b}</p>
                      </div>
                    </div>
                    <p className="mt-3">{conflict.why_conflicts}</p>
                    <p className="mt-1 text-muted">Impact: {conflict.impact}</p>
                    <p className="mt-2 text-xs text-muted">
                      This is a potential conflict validated against the retrieved chunks, not a mathematical proof.
                    </p>
                  </Disclosure>
                </li>
              ))}
              {report.conflicts.length === 0 ? (
                <li className="text-muted">No potential conflict was validated against the retrieved chunks.</li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Run an AI analysis to check for conflicts.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
