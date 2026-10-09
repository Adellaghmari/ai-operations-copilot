import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { AiRun, ComparisonChange } from "../../lib/api";
import { describeProvider } from "../../lib/presentation";
import { formatDate, formatOutcome, humanize } from "../../lib/utils";
import { Badge, Card, ErrorState, Field, LoadingState, Select } from "../../components/ui";

function prettyValue(value: string): string {
  if (/^[A-Z][A-Z_]+$/.test(value)) return humanize(value);
  if (value === "awaiting human") return "Awaiting human decision";
  return value;
}

function ChangeRow({ change }: { change: ComparisonChange }) {
  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{change.label}</p>
      <div className="mt-2 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-md bg-surface-2 p-2 text-sm">
          <p className="text-xs text-muted">Run A</p>
          <p className="break-words text-ink">{prettyValue(change.before)}</p>
        </div>
        <p aria-hidden="true" className="flex items-center justify-center text-faint">
          {"\u2192"}
        </p>
        <div className="rounded-md bg-lime/10 p-2 text-sm">
          <p className="text-xs text-muted">Run B</p>
          <p className="break-words text-ink">{prettyValue(change.after)}</p>
        </div>
      </div>
    </li>
  );
}

function StringList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h4>
      <ul className="m-0 mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function runLabel(run: AiRun): string {
  return `${formatDate(run.created_at)}, ${formatOutcome(run.assurance_outcome)}, ${describeProvider(run.provider_kind).label}`;
}

/**
 * Decision Replay. The comparison is computed deterministically by the API from two stored runs.
 * A before and after view is only drawn for fields the API reports as changed.
 */
export function ReplaySection({ runs }: { runs: AiRun[] }) {
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const ready = Boolean(runA && runB && runA !== runB);
  const comparison = useQuery({
    queryKey: ["compare", runA, runB],
    queryFn: () => api.compareRuns(runA, runB),
    enabled: ready,
  });

  if (runs.length < 2) {
    return (
      <Card data-testid="decision-replay-empty">
        <p className="text-sm text-ink-soft">
          Decision Replay compares two stored runs of the same ticket. This ticket has {runs.length}{" "}
          {runs.length === 1 ? "run" : "runs"}. Run the AI analysis again, or use Regenerate, to create a second run
          and compare them.
        </p>
      </Card>
    );
  }

  const data = comparison.data;
  const changes: ComparisonChange[] = data
    ? [
        data.triage,
        data.recommendation,
        data.assurance,
        data.review,
        data.revision_occurrence,
        data.human_decision,
        data.prompt_version,
        ...data.gate_changes,
      ]
    : [];
  const changed = changes.filter((change) => change.changed);
  const unchanged = changes.filter((change) => !change.changed);

  return (
    <Card data-testid="decision-replay">
      <p className="text-sm text-muted">
        Compare two persisted runs for this case. The comparison is deterministic and does not call a model.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Select run A">
          {(control) => (
            <Select
              {...control}
              value={runA}
              onChange={(event) => setRunA(event.target.value)}
              data-testid="compare-run-a"
            >
              <option value="">Choose run A</option>
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  {runLabel(item)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Select run B">
          {(control) => (
            <Select
              {...control}
              value={runB}
              onChange={(event) => setRunB(event.target.value)}
              data-testid="compare-run-b"
            >
              <option value="">Choose run B</option>
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  {runLabel(item)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {runA && runB && runA === runB ? (
        <p role="status" className="mt-3 text-sm text-amber-200">
          Choose two different runs to compare.
        </p>
      ) : null}
      {!ready && !(runA && runB && runA === runB) ? (
        <p className="mt-3 text-sm text-muted">Choose a run A and a run B to see what changed.</p>
      ) : null}

      {ready && comparison.isPending ? (
        <div className="mt-4">
          <LoadingState label="Comparing runs" rows={2} />
        </div>
      ) : null}
      {ready && comparison.isError ? (
        <div className="mt-4">
          <ErrorState
            compact
            title="The runs could not be compared"
            error={comparison.error}
            onRetry={() => void comparison.refetch()}
            retrying={comparison.isFetching}
          />
        </div>
      ) : null}

      {data ? (
        <div className="mt-4 space-y-4" data-testid="run-comparison">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={data.identical ? "neutral" : "info"}>
              {data.identical ? "No inspectable difference" : `${changed.length} fields changed`}
            </Badge>
            <span className="text-ink">{data.summary}</span>
          </p>
          {changed.length ? (
            <ul className="m-0 list-none space-y-3 p-0">
              {changed.map((change) => (
                <ChangeRow key={`${change.field}-${change.label}`} change={change} />
              ))}
            </ul>
          ) : null}
          <StringList title="Evidence added in run B" items={data.evidence_added} />
          <StringList title="Evidence removed in run B" items={data.evidence_removed} />
          <StringList title="Claim support changes" items={data.claim_support_changes} />
          <StringList title="Conflicts introduced" items={data.conflicts_introduced} />
          <StringList title="Conflicts resolved" items={data.conflicts_resolved} />
          <StringList title="Missing information changes" items={data.missing_information_changes} />
          <StringList title="Why the runs differ" items={data.why} />
          {unchanged.length ? (
            <p className="text-xs text-muted">Unchanged: {unchanged.map((item) => item.label).join(", ")}.</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
