import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { AiRun, AiRunStep } from "../lib/api";
import {
  aiStateTone,
  describeProvider,
  explainOutcome,
  gateTone,
  humanDecisionLabel,
} from "../lib/presentation";
import {
  NOT_RECORDED,
  formatDate,
  formatDuration,
  formatExactTime,
  formatModelLabel,
  formatOutcome,
  humanize,
} from "../lib/utils";
import { QueryState } from "../components/QueryState";
import { Badge, Button, Card, Chip, EmptyState, PageHeader, TechnicalId, buttonClasses } from "../components/ui";

const PAGE_SIZE = 100;

type RunView = "all" | "awaiting" | "decided" | "escalated" | "revised" | "fixture" | "foundry";

function runView(value: string | null): RunView {
  if (
    value === "awaiting" ||
    value === "decided" ||
    value === "escalated" ||
    value === "revised" ||
    value === "fixture" ||
    value === "foundry"
  ) {
    return value;
  }
  return "all";
}

function matchesView(run: AiRun, view: RunView): boolean {
  const provider = describeProvider(run.provider_kind);
  if (view === "awaiting") return !run.human_decision && run.status === "awaiting_human";
  if (view === "decided") return Boolean(run.human_decision);
  if (view === "escalated") return run.assurance_outcome === "ESCALATION_REQUIRED";
  if (view === "revised") return run.revision_count > 0;
  if (view === "fixture") return provider.isFixture;
  if (view === "foundry") return provider.isFoundry;
  return true;
}

function summarizeRuns(items: AiRun[], total: number) {
  const durations = items.map((run) => run.duration_ms).filter((value): value is number => typeof value === "number");
  return {
    total,
    sampled: items.length,
    complete: total <= items.length,
    awaiting: items.filter((run) => !run.human_decision && run.status === "awaiting_human").length,
    revised: items.filter((run) => run.revision_count > 0).length,
    escalated: items.filter((run) => run.assurance_outcome === "ESCALATION_REQUIRED").length,
    decided: items.filter((run) => Boolean(run.human_decision)).length,
    fixture: items.filter((run) => describeProvider(run.provider_kind).isFixture).length,
    foundry: items.filter((run) => describeProvider(run.provider_kind).isFoundry).length,
    averageDuration: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
  };
}

function pipelineStages(run: AiRun): { label: string; detail: string }[] {
  const chunks = run.retrieved_chunk_count ?? run.retrieval_result?.chunks?.length;
  return [
    { label: "Triage", detail: run.triage_result ? "Stored" : "Not stored" },
    {
      label: "Retrieval",
      detail: chunks === undefined ? "Not stored" : `${chunks} ${chunks === 1 ? "chunk" : "chunks"}`,
    },
    { label: "Resolution", detail: run.resolution_draft ? "Stored" : "Not stored" },
    { label: "Review", detail: run.review_result ? "Stored" : "Not stored" },
    { label: "Revision", detail: run.revision_count > 0 ? "Used" : "Not used" },
    { label: "Assurance", detail: run.assurance_outcome ? formatOutcome(run.assurance_outcome) : "Not stored" },
    { label: "Human decision", detail: humanDecisionLabel(run.human_decision) },
  ];
}

const STEP_LABELS: Record<string, string> = {
  triage: "Triage agent",
  retrieval: "Hybrid retrieval",
  resolution: "Resolution agent",
  review: "Review agent",
  resolution_revision: "Resolution agent, revision",
  review_revision: "Review agent, after revision",
};

function RunSummaryStrip({ items, total }: { items: AiRun[]; total: number }) {
  const summary = summarizeRuns(items, total);
  const scope = summary.complete
    ? "Counted from every stored run loaded here."
    : `Counted from the newest ${summary.sampled} of ${summary.total} stored runs.`;
  const cards = [
    { label: "Stored runs", value: String(summary.total), hint: "Returned by the AI runs API." },
    { label: "Awaiting human decision", value: String(summary.awaiting), hint: scope },
    { label: "Escalated", value: String(summary.escalated), hint: scope },
    { label: "Revised", value: String(summary.revised), hint: scope },
    { label: "Human decided", value: String(summary.decided), hint: scope },
    { label: "Test fixture runs", value: String(summary.fixture), hint: scope },
    ...(summary.foundry > 0
      ? [{ label: "Foundry runs", value: String(summary.foundry), hint: scope }]
      : []),
    ...(summary.averageDuration === null
      ? []
      : [
          {
            label: "Average stored duration",
            value: formatDuration(summary.averageDuration),
            hint: "Mean of the loaded runs that recorded a duration.",
          },
        ]),
  ];
  return (
    <section aria-labelledby="run-summary-heading" className="space-y-2" data-testid="run-summary">
      <h2 id="run-summary-heading" className="text-lg font-semibold text-ink">
        Stored run summary
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-violet/25">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{card.label}</dt>
            <dd className="m-0 mt-2 text-3xl font-semibold tabular-nums text-ink">{card.value}</dd>
            <p className="mt-1 text-xs leading-5 text-muted">{card.hint}</p>
          </Card>
        ))}
      </dl>
    </section>
  );
}

function PipelinePreview({ run }: { run: AiRun }) {
  return (
    <section aria-labelledby="pipeline-heading" data-testid="run-pipeline">
      <Card className="border-violet/25">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pipeline-heading" className="text-base font-semibold text-ink">
            Stored workflow
          </h2>
          <p className="text-xs text-muted" title={formatExactTime(run.created_at)}>
            {formatDate(run.created_at)}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted">
          States below are read from this stored run. A missing stage stays marked as not stored.
        </p>
        <ol className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {pipelineStages(run).map((stage) => (
            <li key={stage.label} className="rounded-lg border border-violet/20 bg-violet/[0.06] px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet">{stage.label}</p>
              <p className="mt-1 text-sm font-medium text-ink">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

function ProviderBadge({ kind }: { kind: string }) {
  const provider = describeProvider(kind);
  return (
    <Badge tone={provider.tone} title={provider.description}>
      {provider.label}
    </Badge>
  );
}

function RunTimeline({ steps }: { steps: AiRunStep[] }) {
  const longest = Math.max(1, ...steps.map((step) => step.duration_ms ?? 0));
  return (
    <ol className="m-0 list-none space-y-3 p-0" data-testid="run-timeline">
      {steps.map((step, index) => {
        const width = step.duration_ms ? Math.max(4, Math.round((step.duration_ms / longest) * 100)) : 0;
        return (
          <li key={step.id} className="text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink">
                {index + 1}. {STEP_LABELS[step.name] ?? humanize(step.name)}
              </p>
              <p className="text-xs text-muted">
                {humanize(step.status)}, {formatDuration(step.duration_ms)}
              </p>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-1.5 rounded-full bg-violet" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RunDetail({ run }: { run: AiRun }) {
  const provider = describeProvider(run.provider_kind);
  const steps = run.steps ?? [];
  const report = run.assurance_report ?? null;
  return (
    <div className="space-y-4" data-testid="ai-run-detail">
      {!provider.isFoundry ? (
        <div role="note" className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">{provider.label}</p>
          <p className="mt-0.5">{provider.description}</p>
        </div>
      ) : null}

      <Card>
        <h2 className="text-base font-semibold text-ink">Run summary</h2>
        <dl className="m-0 mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Provider</dt>
            <dd className="m-0 font-medium">{provider.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Run status</dt>
            <dd className="m-0">
              <Badge tone={aiStateTone(run.status)}>{humanize(run.status)}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Duration</dt>
            <dd className="m-0 font-medium">{formatDuration(run.duration_ms)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Chat model</dt>
            <dd className="m-0 font-medium">{formatModelLabel(run.model_deployment)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Embedding model</dt>
            <dd className="m-0 font-medium">{formatModelLabel(run.embedding_model)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Created</dt>
            <dd className="m-0 font-medium" title={formatExactTime(run.created_at)}>
              {formatDate(run.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Revisions used</dt>
            <dd className="m-0 font-medium">{run.revision_count} of 1</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Retrieved chunks</dt>
            <dd className="m-0 font-medium">
              {run.retrieved_chunk_count ?? run.retrieval_result?.chunks?.length ?? NOT_RECORDED}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Prompt versions</dt>
            <dd className="m-0 font-medium">
              {Object.entries(run.prompt_versions)
                .map(([name, version]) => `${name} v${version}`)
                .join(", ") || NOT_RECORDED}
            </dd>
          </div>
        </dl>
        {run.error_message ? (
          <p role="alert" className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-100">
            {run.error_message}
          </p>
        ) : null}
        <div className="mt-4 space-y-1">
          <TechnicalId label="run_id" value={run.id} />
          <TechnicalId label="ticket_id" value={run.ticket_id} />
        </div>
        <p className="mt-4 flex flex-wrap gap-2">
          <Link className={buttonClasses("secondary", "sm")} to={`/tickets/${run.ticket_id}`}>
            Open the ticket for full evidence
          </Link>
          <Link className={buttonClasses("secondary", "sm")} to={`/tickets/${run.ticket_id}#assurance`}>
            Ticket assurance
          </Link>
          <Link className={buttonClasses("secondary", "sm")} to={`/replay?ticket=${run.ticket_id}`}>
            Decision Replay
          </Link>
          <Link className={buttonClasses("ghost", "sm")} to="/assurance">
            Decision Assurance
          </Link>
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-ink">Pipeline</h2>
        <p className="mt-1 text-xs text-muted">
          Durations are measured per step. The Decision Assurance Engine runs as application code after the Review
          step, so it has no model step of its own.
        </p>
        <div className="mt-3">
          {steps.length ? (
            <RunTimeline steps={steps} />
          ) : (
            <p className="text-sm text-muted">No step timings were stored for this run.</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-ink">Review and assurance</h2>
        <dl className="m-0 mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Review verdict</dt>
            <dd className="m-0 font-medium">{run.review_result?.status ?? "Review did not complete"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Assurance outcome</dt>
            <dd className="m-0">
              {run.assurance_outcome ? (
                <Badge tone={gateTone(run.assurance_outcome)}>{formatOutcome(run.assurance_outcome)}</Badge>
              ) : (
                <span className="font-medium">No assurance report</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Abstention</dt>
            <dd className="m-0 font-medium">
              {run.abstained ? "The AI abstained on purpose" : "The AI produced a draft"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Human decision</dt>
            <dd className="m-0 font-medium">
              {humanDecisionLabel(run.human_decision)}
              {run.was_edited ? ", edited" : ""}
            </dd>
          </div>
        </dl>
        {report ? (
          <>
            <p className="mt-3 text-sm text-ink-soft">{explainOutcome(run.assurance_outcome)}</p>
            <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0 text-sm">
              <li>
                <Badge tone="good">Supported claims: {run.supported_claim_count ?? 0}</Badge>
              </li>
              <li>
                <Badge tone={(run.unsupported_claim_count ?? 0) > 0 ? "bad" : "neutral"}>
                  Unsupported claims: {run.unsupported_claim_count ?? 0}
                </Badge>
              </li>
              <li>
                <Badge tone={(run.conflict_count ?? 0) > 0 ? "warn" : "neutral"}>
                  Potential conflicts: {run.conflict_count ?? 0}
                </Badge>
              </li>
              <li>
                <Badge tone={(run.missing_information_count ?? 0) > 0 ? "warn" : "neutral"}>
                  Missing information: {run.missing_information_count ?? 0}
                </Badge>
              </li>
            </ul>
          </>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-ink">Responses</h2>
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Original AI draft</h3>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm" data-testid="run-original-response">
              {run.abstained
                ? "None. The system abstained and did not fabricate a customer response."
                : (run.original_customer_response ?? "No draft was produced for this run.")}
            </p>
          </div>
          {run.final_customer_response ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">Human reviewed response</h3>
              <p
                className="mt-1 whitespace-pre-wrap rounded-md bg-lime/10 p-3 text-sm"
                data-testid="run-final-response"
              >
                {run.final_customer_response}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No human reviewed response exists. The AI draft is never sent to a customer by this system.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export function AiRunsPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const list = useQuery({
    queryKey: ["runs", page],
    queryFn: () => api.aiRuns(undefined, { page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    enabled: !runId,
  });
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.aiRun(runId!),
    enabled: Boolean(runId),
  });
  // Used only to show ticket numbers next to runs. The list still works without it.
  const tickets = useQuery({
    queryKey: ["tickets-lookup"],
    queryFn: () => api.tickets(new URLSearchParams({ page_size: "100" })),
    enabled: !runId,
  });
  const view = runView(params.get("view"));
  const ticketLabel = (id: string): string => {
    const found = tickets.data?.items.find((item) => item.id === id);
    return found ? found.display_id : "Open ticket";
  };

  if (runId) {
    return (
      <div className="space-y-5">
        <PageHeader
        eyebrow="Decision intelligence"
        title="AI run"
          description="What one stored workflow run did, how long each step took, and what a human decided."
          actions={
            <Link className={buttonClasses("secondary")} to="/ai-runs">
              All AI runs
            </Link>
          }
        />
        <QueryState query={detail} label="AI run" errorTitle="This AI run could not be loaded">
          {(run) => <RunDetail run={run} />}
        </QueryState>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Decision intelligence"
        title="AI runs"
        description="Every stored workflow run, newest first. A fixture run is labelled as a fixture and is never presented as Microsoft Foundry."
      />
      <Card className="border-violet/25">
        <h2 className="text-base font-semibold text-ink">What a stored run is</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          A run is the stored decision workflow for one case. It keeps triage, retrieval, resolution, review, a
          revision when one was used, assurance, and the human outcome. The time on each row is the stored created
          time, labelled from today. Hover a time to read the exact 24 hour clock.
        </p>
      </Card>
      <QueryState
        query={list}
        label="AI runs"
        errorTitle="AI runs could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="No AI runs yet"
            body="A run is created when you run an AI analysis on a ticket."
            action={
              <Link to="/tickets" className={buttonClasses("primary")}>
                Open the ticket queue
              </Link>
            }
          />
        }
      >
        {(data) => {
          const pageCount = Math.max(1, Math.ceil(data.total / data.page_size));
          const filtered = data.items.filter((run) => matchesView(run, view));
          const foundryPresent = data.items.some((run) => describeProvider(run.provider_kind).isFoundry);
          const inspected = filtered.find((run) => run.id === params.get("inspect")) ?? filtered[0];
          const goTo = (target: number) => {
            const next = new URLSearchParams(params);
            if (target <= 1) next.delete("page");
            else next.set("page", String(target));
            setParams(next);
          };
          const setView = (nextView: RunView) => {
            const next = new URLSearchParams(params);
            if (nextView === "all") next.delete("view");
            else next.set("view", nextView);
            next.delete("inspect");
            setParams(next, { replace: true });
          };
          const inspect = (id: string) => {
            const next = new URLSearchParams(params);
            next.set("inspect", id);
            setParams(next, { replace: true });
          };
          const filters: { id: RunView; label: string }[] = [
            { id: "all", label: "All runs" },
            { id: "awaiting", label: "Awaiting human" },
            { id: "decided", label: "Human decided" },
            { id: "escalated", label: "Escalated" },
            { id: "revised", label: "Revised" },
            { id: "fixture", label: "Fixture" },
            ...(foundryPresent ? [{ id: "foundry" as const, label: "Foundry" }] : []),
          ];
          return (
            <div className="space-y-4">
              <RunSummaryStrip items={data.items} total={data.total} />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter stored runs">
                {filters.map((filter) => (
                  <Chip key={filter.id} active={view === filter.id} onClick={() => setView(filter.id)}>
                    {filter.label}
                  </Chip>
                ))}
              </div>
              <p className="text-sm text-muted" role="status">
                {data.total} stored {data.total === 1 ? "run" : "runs"}
                {data.total > data.items.length ? `, newest ${data.items.length} loaded` : ""}. Showing {filtered.length}{" "}
                {filtered.length === 1 ? "run" : "runs"}
                {view === "all" ? "" : " for this filter"}.
              </p>
              {inspected ? <PipelinePreview run={inspected} /> : null}
              {filtered.length === 0 ? (
                <EmptyState
                  title="No stored runs match this filter"
                  body="The AI runs API answered. None of the loaded runs match the selected filter."
                  action={
                    <Chip active={false} onClick={() => setView("all")}>
                      All runs
                    </Chip>
                  }
                />
              ) : (
                <>
              <Card className="hidden overflow-x-auto p-0 md:block">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Stored AI runs, newest first</caption>
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {["Created", "Ticket", "Provider", "Run status", "Assurance", "Revision", "Human decision", "Duration"].map(
                        (heading) => (
                          <th key={heading} scope="col" className="px-4 py-3 font-medium">
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((run) => (
                      <tr
                        key={run.id}
                        data-testid={`run-row-${run.id}`}
                        tabIndex={0}
                        className="cursor-pointer border-t border-line transition-colors hover:bg-violet/[0.07] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lime"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("a, button")) return;
                          navigate(`/ai-runs/${run.id}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && event.target === event.currentTarget) {
                            navigate(`/ai-runs/${run.id}`);
                          }
                        }}
                      >
                        <td className="px-4 py-3">
                          <Link
                            className="font-semibold hover:underline"
                            to={`/ai-runs/${run.id}`}
                            title={formatExactTime(run.created_at)}
                          >
                            {formatDate(run.created_at)}
                          </Link>
                          <p className="mt-1 text-xs">
                            <Link className="underline underline-offset-2 hover:text-lime" to={`/ai-runs/${run.id}`}>
                              Open run
                            </Link>
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Link className="font-semibold hover:underline" to={`/tickets/${run.ticket_id}`}>
                            {ticketLabel(run.ticket_id)}
                          </Link>
                          <p className="mt-1 text-xs">
                            <button
                              type="button"
                              className="underline underline-offset-2 hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                              aria-pressed={inspected?.id === run.id}
                              onClick={() => inspect(run.id)}
                            >
                              Inspect
                            </button>
                            <span className="text-muted"> · </span>
                            <Link className="underline underline-offset-2 hover:text-lime" to={`/replay?ticket=${run.ticket_id}`}>
                              Replay
                            </Link>
                            <span className="text-muted"> · </span>
                            <Link className="underline underline-offset-2 hover:text-lime" to="/assurance">
                              Assurance
                            </Link>
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <ProviderBadge kind={run.provider_kind} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={aiStateTone(run.status)}>{humanize(run.status)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {run.assurance_outcome ? (
                            <Badge tone={gateTone(run.assurance_outcome)}>{formatOutcome(run.assurance_outcome)}</Badge>
                          ) : (
                            <span className="text-muted">No assurance report</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{run.revision_count > 0 ? "Revision used" : "No revision"}</td>
                        <td className="px-4 py-3">{humanDecisionLabel(run.human_decision)}</td>
                        <td className="px-4 py-3 text-muted">{formatDuration(run.duration_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <ul className="m-0 list-none space-y-3 p-0 md:hidden">
                {filtered.map((run) => (
                  <li key={run.id}>
                    <Card className="border-violet/20">
                      <Link
                        className="font-semibold hover:underline"
                        to={`/ai-runs/${run.id}`}
                        title={formatExactTime(run.created_at)}
                      >
                        {formatDate(run.created_at)}
                      </Link>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ProviderBadge kind={run.provider_kind} />
                        <Badge tone={aiStateTone(run.status)}>{humanize(run.status)}</Badge>
                        {run.assurance_outcome ? (
                          <Badge tone={gateTone(run.assurance_outcome)}>{formatOutcome(run.assurance_outcome)}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {humanDecisionLabel(run.human_decision)}, {formatDuration(run.duration_ms)}
                      </p>
                      <p className="mt-2 text-xs">
                        <Link className="underline underline-offset-2 hover:text-lime" to={`/ai-runs/${run.id}`}>
                          Open run
                        </Link>
                        <span className="text-muted"> · </span>
                        <Link className="underline underline-offset-2 hover:text-lime" to={`/tickets/${run.ticket_id}`}>
                          {ticketLabel(run.ticket_id)}
                        </Link>
                        <span className="text-muted"> · </span>
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                          aria-pressed={inspected?.id === run.id}
                          onClick={() => inspect(run.id)}
                        >
                          Inspect
                        </button>
                        <span className="text-muted"> · </span>
                        <Link className="underline underline-offset-2 hover:text-lime" to={`/replay?ticket=${run.ticket_id}`}>
                          Replay
                        </Link>
                        <span className="text-muted"> · </span>
                        <Link className="underline underline-offset-2 hover:text-lime" to="/assurance">
                          Assurance
                        </Link>
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
                </>
              )}
              {pageCount > 1 ? (
                <nav aria-label="AI run pages" className="flex items-center justify-between gap-3">
                  <Button variant="secondary" disabled={data.page <= 1} onClick={() => goTo(data.page - 1)}>
                    Previous page
                  </Button>
                  <span className="text-sm text-muted">
                    Page {data.page} of {pageCount}
                  </span>
                  <Button variant="secondary" disabled={data.page >= pageCount} onClick={() => goTo(data.page + 1)}>
                    Next page
                  </Button>
                </nav>
              ) : null}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
