import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { EvalCase, EvalRun } from "../lib/api";
import { describeError } from "../lib/errors";
import { describeProvider } from "../lib/presentation";
import { NOT_AVAILABLE, formatDate, humanize } from "../lib/utils";
import { Disclosure } from "../components/Disclosure";
import { QueryState } from "../components/QueryState";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader } from "../components/ui";

type MetricKind = "measured" | "by_construction" | "not_measured";

type MetricDefinition = {
  key: string;
  label: string;
  description: string;
  kind: MetricKind;
  reason?: string;
};

/** What each stored metric truly means in this lab. Written from the evaluation service. */
const METRICS: MetricDefinition[] = [
  {
    key: "classification_accuracy",
    label: "Category matches the dataset",
    description: "The fixture triage category equals the expected category.",
    kind: "measured",
  },
  {
    key: "severity_accuracy",
    label: "Severity in the expected range",
    description: "The fixture triage severity falls inside the expected severity range.",
    kind: "measured",
  },
  {
    key: "escalation_accuracy",
    label: "Escalation flag matches",
    description: "The fixture draft escalation flag equals the expected escalation.",
    kind: "measured",
  },
  {
    key: "structured_output_validity",
    label: "Fixture output fits the schema",
    description: "The fixture output parsed into the Pydantic schemas.",
    kind: "by_construction",
    reason: "This check is recorded as passing for every case, so it cannot reveal a problem.",
  },
  {
    key: "retrieval_recall_at_k",
    label: "Retrieval recall",
    description: "Whether the expected documents were retrieved.",
    kind: "not_measured",
    reason: "The lab runs with empty retrieval, so there is nothing to recall.",
  },
  {
    key: "citation_coverage",
    label: "Citation coverage",
    description: "How much of the retrieved evidence the draft cites.",
    kind: "not_measured",
    reason: "No chunks are retrieved in the lab, so coverage is not meaningful.",
  },
];

const KIND_LABEL: Record<MetricKind, { text: string; tone: "good" | "info" | "neutral" }> = {
  measured: { text: "Computed from fixture output", tone: "good" },
  by_construction: { text: "Fixed by construction", tone: "info" },
  not_measured: { text: "Not measured", tone: "neutral" },
};

function countOf(value: number | undefined, total: number): string {
  if (value === undefined) return NOT_AVAILABLE;
  return `${Math.round(value * total)} of ${total} cases`;
}

function RunSummary({ run, cases }: { run: EvalRun; cases: EvalCase[] | undefined }) {
  const provider = describeProvider(run.provider_kind);
  const failed = run.metrics?.failed_cases;
  return (
    <div className="space-y-4">
      <dl className="m-0 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Dataset</dt>
          <dd className="m-0 font-medium">
            <code>{run.dataset_version}</code>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Cases in this run</dt>
          <dd className="m-0 font-medium">{run.case_count}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Provider</dt>
          <dd className="m-0">
            <Badge tone={provider.tone} title={provider.description}>
              {provider.label}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Run status</dt>
          <dd className="m-0 font-medium">{humanize(run.status)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Started</dt>
          <dd className="m-0 font-medium">{formatDate(run.started_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Failed cases</dt>
          <dd className="m-0 font-medium">{failed === undefined ? NOT_AVAILABLE : `${failed} of ${run.case_count}`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Golden cases available now</dt>
          <dd className="m-0 font-medium">{cases ? cases.length : NOT_AVAILABLE}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">What each stored metric means and how it was produced</caption>
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Check
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Result
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                How it was produced
              </th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <tr key={metric.key} className="border-t border-line align-top">
                <th scope="row" className="px-3 py-2 font-medium text-ink">
                  {metric.label}
                  <span className="mt-0.5 block text-xs font-normal text-muted">{metric.description}</span>
                </th>
                <td className="px-3 py-2">
                  {metric.kind === "not_measured"
                    ? "Not measured"
                    : countOf(run.metrics?.[metric.key], run.case_count)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={KIND_LABEL[metric.kind].tone}>{KIND_LABEL[metric.kind].text}</Badge>
                  {metric.reason ? <span className="mt-1 block text-xs text-muted">{metric.reason}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function expectedSummary(item: EvalCase | undefined): string[] {
  if (!item) return [];
  const expected = item.expected;
  const lines: string[] = [];
  if (typeof expected.category === "string") lines.push(`Category ${humanize(expected.category).toLowerCase()}`);
  if (Array.isArray(expected.severity_range)) lines.push(`Severity ${expected.severity_range.join(" or ")}`);
  if (typeof expected.escalation === "boolean") {
    lines.push(expected.escalation ? "Escalation expected" : "No escalation expected");
  }
  return lines;
}

function CaseResults({ runId, cases }: { runId: string; cases: EvalCase[] | undefined }) {
  const [failedOnly, setFailedOnly] = useState(false);
  const results = useQuery({ queryKey: ["eval-results", runId], queryFn: () => api.evalResults(runId) });
  return (
    <QueryState
      query={results}
      label="Case results"
      errorTitle="Case results could not be loaded"
      isEmpty={(items) => items.length === 0}
      empty={<EmptyState title="No case results" body="This run has no stored case results." />}
    >
      {(items) => {
        const failed = items.filter((item) => !item.passed).length;
        const shown = failedOnly ? items.filter((item) => !item.passed) : items;
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-soft" role="status">
                {items.length - failed} passed, {failed} failed, out of {items.length} cases.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={failedOnly}
                  onChange={(event) => setFailedOnly(event.target.checked)}
                />
                Show failed cases only
              </label>
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-muted">No failed cases in this run.</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {shown.map((item) => {
                  const definition = cases?.find((entry) => entry.case_key === item.case_key);
                  return (
                    <li key={item.case_key}>
                      <Disclosure
                        headingLevel={4}
                        title={definition?.title ?? item.case_key}
                        summary={item.failure_reason ? `Failure reason: ${item.failure_reason}` : item.case_key}
                        trailing={<Badge tone={item.passed ? "good" : "bad"}>{item.passed ? "Passed" : "Failed"}</Badge>}
                      >
                        <div className="space-y-2">
                          <p className="text-xs text-muted">
                            Case key: <code>{item.case_key}</code>
                          </p>
                          {expectedSummary(definition).length ? (
                            <p>Expected: {expectedSummary(definition).join(", ")}.</p>
                          ) : null}
                          <ul className="m-0 list-disc pl-5">
                            {["classification_accuracy", "severity_accuracy", "escalation_accuracy"].map((key) => (
                              <li key={key}>
                                {METRICS.find((metric) => metric.key === key)?.label}:{" "}
                                {item.metrics[key] === 1 ? "yes" : "no"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </Disclosure>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

export function EvaluationsPage() {
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const cases = useQuery({ queryKey: ["eval-cases"], queryFn: api.evalCases });
  const runs = useQuery({ queryKey: ["eval-runs"], queryFn: api.evalRuns });
  const [picked, setPicked] = useState<string | null>(null);
  const runEval = useMutation({
    mutationFn: api.runEval,
    onSuccess: async (run) => {
      setPicked(run.id);
      await queryClient.invalidateQueries({ queryKey: ["eval-runs"] });
    },
  });
  const foundryLive = health.data?.uses_foundry ?? false;
  const administrativeMutationsEnabled =
    health.data?.administrative_mutations_enabled !== false;
  const selectedRun = runs.data?.find((run) => run.id === (picked ?? runs.data?.[0]?.id));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge and AI"
        title="Evaluation lab"
        description="A regression check over a golden dataset. Read the scope notes before you read any number."
        actions={
          administrativeMutationsEnabled ? (
            <Button disabled={foundryLive || runEval.isPending} onClick={() => runEval.mutate()}>
              {runEval.isPending ? "Running evaluation" : "Run fixture evaluation"}
            </Button>
          ) : null
        }
      />
      {!administrativeMutationsEnabled ? (
        <p role="note" className="text-sm text-muted">
          Starting evaluation runs is disabled on the anonymous public demo. Stored results remain inspectable.
        </p>
      ) : null}
      {foundryLive ? (
        <p role="note" className="text-sm text-muted">
          Running the lab is disabled while the app is in Foundry mode in the public demo.
        </p>
      ) : null}
      {runEval.isError ? (
        <ErrorState compact title="The evaluation did not run" message={describeError(runEval.error).summary} />
      ) : null}
      {runEval.isSuccess ? (
        <p role="status" className="text-sm text-lime">
          Evaluation finished. The new run is selected below.
        </p>
      ) : null}

      <Card className="border-amber-300/30 bg-amber-400/10" data-testid="eval-scope">
        <h2 className="text-base font-semibold text-amber-100">What this lab does and does not measure</h2>
        <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
          <li>
            It runs the golden dataset through the deterministic test fixture. It does not call Microsoft Foundry, and
            it is not a measure of model quality.
          </li>
          <li>
            Retrieval is empty in this lab. Retrieval recall and citation coverage are therefore not measured, and the
            app does not show them as scores.
          </li>
          <li>
            What it does check: category, severity range, and escalation flag from the fixture output against the
            dataset expectations. It guards the dataset and the wiring against regressions.
          </li>
          <li>The numbers are counts of cases. There is no confidence or quality percentage.</li>
        </ul>
      </Card>

      <section aria-labelledby="dataset-heading" className="space-y-2">
        <h2 id="dataset-heading" className="text-lg font-semibold text-ink">
          Dataset
        </h2>
        <QueryState
          query={cases}
          label="Golden cases"
          errorTitle="The golden cases could not be loaded"
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState title="The golden dataset is empty" body="The API returned no golden cases." />}
        >
          {(items) => (
            <Card>
              <p className="text-sm text-ink-soft" data-testid="eval-case-count">
                {items.length} golden cases, dataset <code>golden-v2</code>. Every case is a synthetic ticket with an
                expected category, severity range, and escalation flag.
              </p>
              <div className="mt-3">
                <Disclosure title="Browse the cases" headingLevel={3}>
                  <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
                    {items.map((item) => (
                      <li key={item.case_key} className="text-sm">
                        <span className="font-medium">{item.title}</span>
                        <span className="block text-xs text-muted">{expectedSummary(item).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              </div>
            </Card>
          )}
        </QueryState>
      </section>

      <section aria-labelledby="runs-heading" className="space-y-2">
        <h2 id="runs-heading" className="text-lg font-semibold text-ink">
          Runs
        </h2>
        <QueryState
          query={runs}
          label="Evaluation runs"
          errorTitle="Evaluation runs could not be loaded"
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              title="No evaluation run is stored yet"
              body="Run the fixture evaluation to store the first result. Nothing is shown until a real run exists."
            />
          }
        >
          {(items) => (
            <div className="space-y-4">
              <div role="group" aria-label="Evaluation runs" className="flex flex-wrap gap-2">
                {items.map((run) => {
                  const active = run.id === selectedRun?.id;
                  return (
                    <Button
                      key={run.id}
                      variant={active ? "primary" : "secondary"}
                      size="sm"
                      aria-pressed={active}
                      onClick={() => setPicked(run.id)}
                    >
                      {formatDate(run.started_at)}
                    </Button>
                  );
                })}
              </div>
              {selectedRun ? (
                <Card data-testid="eval-run-detail">
                  <h3 className="text-base font-semibold text-ink">
                    Run from {formatDate(selectedRun.started_at)}
                  </h3>
                  <div className="mt-3">
                    <RunSummary run={selectedRun} cases={cases.data} />
                  </div>
                </Card>
              ) : null}
              {selectedRun ? (
                <section aria-labelledby="results-heading" className="space-y-2">
                  <h3 id="results-heading" className="text-base font-semibold text-ink">
                    Case outcomes
                  </h3>
                  <CaseResults runId={selectedRun.id} cases={cases.data} />
                </section>
              ) : null}
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}
