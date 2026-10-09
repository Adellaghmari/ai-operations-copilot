import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AiRun, Ticket } from "../lib/api";
import { aiStateTone, describeProvider, gateTone, humanDecisionLabel } from "../lib/presentation";
import { formatDate, formatExactTime, formatOutcome } from "../lib/utils";
import { QueryState } from "../components/QueryState";
import { Badge, Card, EmptyState, PageHeader, buttonClasses } from "../components/ui";
import { ReplaySection } from "./ticket/ReplaySection";

function groupRuns(runs: AiRun[]): Map<string, AiRun[]> {
  const grouped = new Map<string, AiRun[]>();
  for (const run of runs) {
    const list = grouped.get(run.ticket_id) ?? [];
    list.push(run);
    grouped.set(run.ticket_id, list);
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }
  return grouped;
}

function ticketMeta(tickets: Ticket[] | undefined, id: string): { displayId: string; subject: string } {
  const found = tickets?.find((item) => item.id === id);
  return found
    ? { displayId: found.display_id, subject: found.subject }
    : { displayId: "Open ticket", subject: "Subject was not in the loaded ticket list." };
}

export function ReplayPage() {
  const [params, setParams] = useSearchParams();
  const selectedTicket = params.get("ticket") ?? "";
  const runs = useQuery({
    queryKey: ["runs-replay"],
    queryFn: () => api.aiRuns(undefined, { page: 1, page_size: 100 }),
  });
  const tickets = useQuery({
    queryKey: ["tickets-lookup"],
    queryFn: () => api.tickets(new URLSearchParams({ page_size: "100" })),
  });

  const grouped = useMemo(() => groupRuns(runs.data?.items ?? []), [runs.data]);
  const selectedRuns = selectedTicket ? grouped.get(selectedTicket) ?? [] : [];

  return (
    <div className="space-y-8">
      <div className="ambient-hero">
        <PageHeader
          eyebrow="Decision intelligence"
          title="Decision Replay"
          display
          description="A deterministic comparison of two stored runs of the same ticket. No model is involved. Pick a case with at least two runs, then choose which pair to inspect."
        />
      </div>

      <section aria-labelledby="replay-meaning-heading" className="grid gap-3 lg:grid-cols-3">
        <h2 id="replay-meaning-heading" className="sr-only">
          What Decision Replay does
        </h2>
        {[
          {
            title: "Compares stored runs",
            body: "Decision Replay reads two stored runs of the same ticket and shows the fields that differ.",
          },
          {
            title: "Does not call a model",
            body: "The comparison is deterministic application code over records that already exist.",
          },
          {
            title: "Shows what changed",
            body: "Use it to inspect triage, assurance, review, and the human outcome between decisions.",
          },
        ].map((item) => (
          <Card key={item.title} className="border-violet/25">
            <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
          </Card>
        ))}
      </section>

      <QueryState
        query={runs}
        label="Stored runs"
        errorTitle="AI runs could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="No stored runs to replay"
            body="Replay needs at least one stored analysis. Run AI analysis on a ticket, then return here."
            action={
              <Link to="/tickets" className={buttonClasses("primary")}>
                Open the ticket queue
              </Link>
            }
          />
        }
      >
        {(data) => {
          const groups = [...grouped.entries()];
          const comparable = groups.filter(([, list]) => list.length >= 2).length;
          const single = groups.filter(([, list]) => list.length < 2).length;
          const partial = data.total > data.items.length;
          const latest = data.items.reduce<string | null>((newest, run) => {
            if (!newest || run.created_at > newest) return run.created_at;
            return newest;
          }, null);
          const scope = partial ? "From the newest 100 stored runs." : "From every stored run returned here.";
          return (
          <div className="space-y-6">
            <section aria-labelledby="replay-summary-heading" className="space-y-3" data-testid="replay-summary">
              <h2 id="replay-summary-heading" className="text-lg font-semibold text-ink">
                What can be compared
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="border-violet/25">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Cases with stored runs</dt>
                  <dd className="m-0 mt-2 text-3xl font-semibold tabular-nums text-ink">{groups.length}</dd>
                  <p className="mt-1 text-xs text-muted">{scope}</p>
                </Card>
                <Card className="border-violet/25">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Ready to compare</dt>
                  <dd className="m-0 mt-2 text-3xl font-semibold tabular-nums text-ink">{comparable}</dd>
                  <p className="mt-1 text-xs text-muted">A case needs two stored runs before a pair can be chosen.</p>
                </Card>
                <Card className="border-violet/25">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">One stored run</dt>
                  <dd className="m-0 mt-2 text-3xl font-semibold tabular-nums text-ink">{single}</dd>
                  <p className="mt-1 text-xs text-muted">These cases need another real run before comparison.</p>
                </Card>
                <Card className="border-violet/25">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Stored runs</dt>
                  <dd className="m-0 mt-2 text-3xl font-semibold tabular-nums text-ink">{data.total}</dd>
                  <p className="mt-1 text-xs text-muted" title={latest ? formatExactTime(latest) : undefined}>
                    {latest ? `Latest activity ${formatDate(latest)}` : "No stored time was returned."}
                  </p>
                </Card>
              </dl>
            </section>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <section aria-labelledby="replay-cases-heading" className="space-y-3">
              <h2 id="replay-cases-heading" className="text-lg font-semibold text-ink">
                Cases with stored runs
              </h2>
              <ul className="m-0 list-none space-y-2 p-0">
                {[...grouped.entries()].map(([ticketId, list]) => {
                  const active = ticketId === selectedTicket;
                  const ticket = ticketMeta(tickets.data?.items, ticketId);
                  const latestRun = list[0];
                  return (
                    <li key={ticketId}>
                      <button
                        type="button"
                        aria-pressed={active}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${
                          active
                            ? "border-lime bg-lime/10 text-ink"
                            : "border-violet/25 bg-surface hover:border-violet/50"
                        }`}
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set("ticket", ticketId);
                          setParams(next, { replace: true });
                        }}
                      >
                        <span className="block font-semibold">{ticket.displayId}</span>
                        <span className="mt-1 block text-sm text-ink">{ticket.subject}</span>
                        <span className="mt-1 block text-xs text-muted" title={latestRun ? formatExactTime(latestRun.created_at) : undefined}>
                          {list.length} {list.length === 1 ? "stored run" : "stored runs"}
                          {latestRun ? ` · latest ${formatDate(latestRun.created_at)}` : ""}
                        </span>
                        {latestRun ? (
                          <span className="mt-2 flex flex-wrap gap-2">
                            <Badge tone={gateTone(latestRun.assurance_outcome ?? "")}>{formatOutcome(latestRun.assurance_outcome)}</Badge>
                            <Badge>{humanDecisionLabel(latestRun.human_decision)}</Badge>
                          </span>
                        ) : null}
                        <span className="mt-2 inline-flex rounded-full bg-violet/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet">
                          {list.length >= 2 ? "Ready to compare" : "Needs another run for comparison"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="replay-detail-heading" className="min-w-0 space-y-4">
              <h2 id="replay-detail-heading" className="text-lg font-semibold text-ink">
                Comparison
              </h2>
              {!selectedTicket ? (
                <Card className="space-y-3">
                  <h3 className="text-base font-semibold text-ink">Choose a case to prepare a comparison</h3>
                  <p className="text-sm leading-6 text-muted">
                    {comparable} {comparable === 1 ? "case is" : "cases are"} ready to compare. {single}{" "}
                    {single === 1 ? "case has" : "cases have"} one stored run. A comparison is two stored records of
                    the same ticket. This page does not invent a second run.
                  </p>
                  <p className="text-sm">
                    <Link className="underline underline-offset-2 hover:text-lime" to="/ai-runs">
                      Open AI runs
                    </Link>
                    <span className="text-muted"> · </span>
                    <Link className="underline underline-offset-2 hover:text-lime" to="/assurance">
                      Open Decision Assurance
                    </Link>
                  </p>
                </Card>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link className="underline underline-offset-2 hover:text-lime" to={`/tickets/${selectedTicket}`}>
                      Open the ticket
                    </Link>
                    <Link className="underline underline-offset-2 hover:text-lime" to="/assurance">
                      Open Assurance
                    </Link>
                    <Link className="underline underline-offset-2 hover:text-lime" to="/ai-runs">
                      Open AI runs
                    </Link>
                  </div>
                  <section aria-labelledby="replay-history-heading" className="space-y-2" data-testid="replay-history">
                    <h3 id="replay-history-heading" className="text-base font-semibold text-ink">
                      Stored run history
                    </h3>
                    <ol className="m-0 list-none space-y-2 p-0">
                      {selectedRuns.map((run, index) => (
                        <li key={run.id} className="rounded-lg border border-violet/25 bg-surface-2 px-3 py-2 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet">Run {index + 1}</p>
                          <Link className="font-semibold hover:text-lime" to={`/ai-runs/${run.id}`} title={formatExactTime(run.created_at)}>
                            {formatDate(run.created_at)}
                          </Link>
                          <span className="mt-1 flex flex-wrap gap-2">
                            <Badge tone={describeProvider(run.provider_kind).tone}>
                              {describeProvider(run.provider_kind).label}
                            </Badge>
                            <Badge tone={aiStateTone(run.status)}>{formatOutcome(run.status)}</Badge>
                            <Badge tone={gateTone(run.assurance_outcome ?? "")}>{formatOutcome(run.assurance_outcome)}</Badge>
                            <Badge>{humanDecisionLabel(run.human_decision)}</Badge>
                            <Badge>{run.revision_count > 0 ? "Revision used" : "No revision"}</Badge>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                  {selectedRuns.length < 2 ? (
                    <Card className="space-y-3 border-violet/25" data-testid="replay-readiness">
                      <h3 className="text-base font-semibold text-ink">Replay readiness</h3>
                      <p className="text-sm leading-6 text-muted">
                        This case has one stored run. A second stored run is required for deterministic comparison.
                        Run the analysis again from the ticket, then return to compare. This page will not invent a
                        second run.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link className={buttonClasses("primary")} to={`/tickets/${selectedTicket}`}>
                          Run workflow again
                        </Link>
                        {selectedRuns[0] ? (
                          <Link className={buttonClasses("secondary")} to={`/ai-runs/${selectedRuns[0].id}`}>
                            Open stored run
                          </Link>
                        ) : null}
                      </div>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted">
                        Two or more stored runs exist. Choose a pair below. The comparison reads those records only.
                      </p>
                      <ReplaySection runs={selectedRuns} />
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
          </div>
          );
        }}
      </QueryState>
    </div>
  );
}
