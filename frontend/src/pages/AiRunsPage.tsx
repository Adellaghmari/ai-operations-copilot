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
  formatModelLabel,
  formatOutcome,
  humanize,
} from "../lib/utils";
import { QueryState } from "../components/QueryState";
import { Badge, Button, Card, EmptyState, PageHeader, TechnicalId, buttonClasses } from "../components/ui";

const PAGE_SIZE = 20;

const STEP_LABELS: Record<string, string> = {
  triage: "Triage agent",
  retrieval: "Hybrid retrieval",
  resolution: "Resolution agent",
  review: "Review agent",
  resolution_revision: "Resolution agent, revision",
  review_revision: "Review agent, after revision",
};

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
              <div className="h-1.5 rounded-full bg-lime" style={{ width: `${width}%` }} />
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
            <dd className="m-0 font-medium">{formatDate(run.created_at)}</dd>
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
        <p className="mt-4">
          <Link className={buttonClasses("secondary", "sm")} to={`/tickets/${run.ticket_id}`}>
            Open the ticket for full evidence
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
  const ticketLabel = (id: string): string => {
    const found = tickets.data?.items.find((item) => item.id === id);
    return found ? found.display_id : "Open ticket";
  };

  if (runId) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Knowledge and AI"
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
        eyebrow="Knowledge and AI"
        title="AI runs"
        description="Every stored workflow run, newest first. A fixture run is labelled as a fixture and is never presented as Microsoft Foundry."
      />
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
          const goTo = (target: number) => {
            const next = new URLSearchParams(params);
            if (target <= 1) next.delete("page");
            else next.set("page", String(target));
            setParams(next);
          };
          return (
            <div className="space-y-3">
              <p className="text-sm text-muted" role="status">
                {data.total} {data.total === 1 ? "run" : "runs"}, page {data.page} of {pageCount}
              </p>
              <Card className="hidden overflow-x-auto p-0 md:block">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Stored AI runs, newest first</caption>
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {["Created", "Ticket", "Provider", "Run status", "Assurance", "Human decision", "Duration"].map(
                        (heading) => (
                          <th key={heading} scope="col" className="px-4 py-3 font-medium">
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((run) => (
                      <tr
                        key={run.id}
                        className="cursor-pointer border-t border-line hover:bg-surface-2"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("a")) return;
                          navigate(`/ai-runs/${run.id}`);
                        }}
                      >
                        <td className="px-4 py-3">
                          <Link className="font-medium hover:underline" to={`/ai-runs/${run.id}`}>
                            {formatDate(run.created_at)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link className="hover:underline" to={`/tickets/${run.ticket_id}`}>
                            {ticketLabel(run.ticket_id)}
                          </Link>
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
                        <td className="px-4 py-3">{humanDecisionLabel(run.human_decision)}</td>
                        <td className="px-4 py-3 text-muted">{formatDuration(run.duration_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <ul className="m-0 list-none space-y-3 p-0 md:hidden">
                {data.items.map((run) => (
                  <li key={run.id}>
                    <Card>
                      <Link className="font-medium hover:underline" to={`/ai-runs/${run.id}`}>
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
                    </Card>
                  </li>
                ))}
              </ul>
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
