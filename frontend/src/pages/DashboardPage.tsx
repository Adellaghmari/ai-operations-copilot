import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Dashboard, DemoCase } from "../lib/api";
import { describeError } from "../lib/errors";
import { aiStateTone, describeProvider, SCENARIOS } from "../lib/presentation";
import {
  NOT_AVAILABLE,
  formatDate,
  formatDuration,
  formatExactTime,
  humanize,
  percent,
} from "../lib/utils";
import { Dialog } from "../components/Dialog";
import { QueryState } from "../components/QueryState";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  PageHeader,
  buttonClasses,
} from "../components/ui";

function count(value: number | undefined): string {
  return value === undefined ? NOT_AVAILABLE : String(value);
}

type Metric = { label: string; value: string; hint: string; to?: string };

function buildMetrics(data: Dashboard): { queue: Metric[]; assurance: Metric[] } {
  return {
    queue: [
      {
        label: "Open tickets",
        value: String(data.open_tickets),
        hint: "Tickets that are not resolved or closed.",
        to: "/tickets?status=open",
      },
      {
        label: "Cases awaiting human decision",
        value: count(data.cases_awaiting_human_decision ?? data.awaiting_human_review),
        hint: "Analysed cases with no recorded human decision.",
        to: "/tickets?ai_review_status=awaiting_human",
      },
      {
        label: "Knowledge indexed",
        value: String(data.knowledge_documents_indexed),
        hint: "Documents available to retrieval.",
        to: "/knowledge",
      },
    ],
    assurance: [
      {
        label: "AI abstentions",
        value: count(data.ai_abstentions),
        hint: "Runs where the system declined to recommend.",
        to: "/assurance?outcome=ABSTAINED",
      },
      {
        label: "Evidence gaps detected",
        value: count(data.evidence_gaps_detected),
        hint: "Facts the knowledge base could not supply.",
        to: "/assurance?focus=gaps",
      },
      {
        label: "Potential evidence conflicts",
        value: count(data.potential_evidence_conflicts),
        hint: "Sources that may disagree.",
        to: "/assurance?focus=conflicts",
      },
      {
        label: "Recommendations revised",
        value: count(data.recommendations_revised),
        hint: "Runs that used their one revision.",
        to: "/assurance?revised=1",
      },
      {
        label: "Grounded recommendations",
        value: count(data.grounded_recommendations),
        hint: "Runs whose evidence gates passed.",
        to: "/assurance?outcome=READY_FOR_HUMAN_REVIEW",
      },
    ],
  };
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => {
        const body = (
          <>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{metric.label}</dt>
            <dd className="m-0 mt-2 text-3xl font-semibold tabular-nums tracking-tight text-ink">{metric.value}</dd>
            <p className="mt-1 text-xs leading-5 text-muted">{metric.hint}</p>
          </>
        );
        return (
          <Card
            key={metric.label}
            data-testid={`metric-${metric.label.toLowerCase().replaceAll(" ", "-")}`}
            className={metric.to ? "transition-colors hover:border-violet/45 hover:bg-surface-2" : undefined}
          >
            {metric.to ? (
              <Link to={metric.to} className="block focus-visible:outline-lime">
                {body}
              </Link>
            ) : (
              body
            )}
          </Card>
        );
      })}
    </dl>
  );
}

function ScenarioEntryPoints({ risky }: { risky: DemoCase[] }) {
  return (
    <section aria-labelledby="scenarios-heading" className="space-y-3">
      <div>
        <h2 id="scenarios-heading" className="text-lg font-semibold text-ink">
          Start with a synthetic scenario
        </h2>
        <p className="mt-1 text-sm text-muted">
          These four tickets are synthetic seed data. Each is designed to show one behaviour. Running an analysis
          shows what actually happens.
        </p>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {SCENARIOS.map((scenario) => {
          const found = risky.find((item) => item.demo_scenario === scenario.key);
          return (
            <li key={scenario.key}>
              <Card className="h-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{scenario.label}</h3>
                  <Badge tone="info">Synthetic</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{scenario.designedToShow}</p>
                <p className="mt-1 text-xs text-muted">Look for: {scenario.watchFor}</p>
                <div className="mt-3">
                  {found ? (
                    <Link
                      className="text-sm font-medium text-ink underline underline-offset-2 hover:text-lime"
                      data-testid={`risky-case-${scenario.key}`}
                      to={`/tickets/${found.id}`}
                    >
                      Open {found.display_id}
                    </Link>
                  ) : (
                    <p className="text-xs text-muted">Not seeded in this database yet.</p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NarrativeStep({
  step,
  title,
  body,
  to,
  linkLabel,
}: {
  step: string;
  title: string;
  body: string;
  to: string | null;
  linkLabel: string;
}) {
  return (
    <li>
      <Card className="h-full">
        <Eyebrow tone={step.startsWith("3.") ? "lime" : "violet"}>{step}</Eyebrow>
        <h3 className="mt-1 text-base font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
        {to ? (
          <Link
            className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-lime"
            to={to}
          >
            {linkLabel}
          </Link>
        ) : null}
      </Card>
    </li>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const metrics = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const tickets = useQuery({
    queryKey: ["tickets-recent"],
    queryFn: () => api.tickets(new URLSearchParams({ page_size: "6" })),
  });
  const waiting = useQuery({
    queryKey: ["tickets-waiting"],
    queryFn: () => api.tickets(new URLSearchParams({ page_size: "5", ai_review_status: "awaiting_human" })),
  });
  const runs = useQuery({ queryKey: ["runs-recent"], queryFn: () => api.aiRuns() });
  const resetDemo = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: async () => {
      setConfirmOpen(false);
      await queryClient.invalidateQueries();
    },
  });

  const risky = metrics.data?.risky_cases ?? [];
  const featured =
    risky.find((item) => item.demo_scenario === "security_bypass") ??
    risky.find((item) => item.demo_scenario === "policy_conflict") ??
    risky[0];
  const challengeLink = featured ? `/tickets/${featured.id}` : null;
  const administrativeMutationsEnabled =
    health.isSuccess && health.data.administrative_mutations_enabled !== false;

  return (
    <div className="space-y-10">
      <div className="ambient-hero">
      <PageHeader
        eyebrow="AI decision intelligence"
        title="Evidence. Challenge. Human Decision."
        titleTestId="dashboard-heading"
        display
        roomy
        description={
          <p data-testid="product-tagline" className="max-w-2xl">
            The model proposes. The system challenges. The human decides. AI can generate an answer. This workspace
            asks whether you should trust it before anyone acts.
          </p>
        }
        actions={
          <>
            {featured ? (
              <Link
                to={`/tickets/${featured.id}?guide=risky`}
                data-testid="try-risky-case"
                className={buttonClasses("primary")}
              >
                Try a risky case
              </Link>
            ) : null}
            {administrativeMutationsEnabled ? (
              <Button
                data-testid="reset-demo"
                variant="secondary"
                disabled={resetDemo.isPending}
                onClick={() => {
                  resetDemo.reset();
                  setConfirmOpen(true);
                }}
              >
                Reset synthetic demo
              </Button>
            ) : null}
          </>
        }
      />
      </div>

      {resetDemo.isSuccess ? (
        <p role="status" className="text-sm text-lime" data-testid="reset-demo-status">
          Synthetic demo data refreshed. Timestamps are generated at reset time.
        </p>
      ) : null}

      <section aria-labelledby="narrative-heading" className="space-y-3">
        <h2 id="narrative-heading" className="text-lg font-semibold text-ink">
          The model proposes. The system challenges. The human decides.
        </h2>
        <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
          <NarrativeStep
            step="1. Evidence"
            title="Every claim needs a source"
            body="Hybrid retrieval finds knowledge chunks. A ledger maps each claim in the draft to the chunk that supports it, or marks it unsupported."
            to="/knowledge"
            linkLabel="Browse the knowledge base"
          />
          <NarrativeStep
            step="2. Challenge"
            title="A reviewer and deterministic gates push back"
            body="A Review agent challenges the draft once. Then application code checks evidence, conflicts, and unsupported actions, and may abstain."
            to={challengeLink ?? "/about"}
            linkLabel={challengeLink ? "Open a risky case" : "Read how it works"}
          />
          <NarrativeStep
            step="3. Human Decision"
            title="A person approves, edits, rejects, or escalates"
            body="The AI never sends a customer message. Every decision is recorded and feeds the feedback summary."
            to="/feedback"
            linkLabel="See recorded decisions"
          />
        </ol>
      </section>

      <section aria-labelledby="surfaces-heading" className="space-y-3">
        <h2 id="surfaces-heading" className="text-lg font-semibold text-ink">
          Inspect a product surface
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { to: "/ai-runs", title: "AI runs", body: "Stored workflows, newest first, with the real created time." },
            { to: "/replay", title: "Decision Replay", body: "Compare two stored runs of the same ticket. No model is called." },
            { to: "/assurance", title: "Decision Assurance", body: "Open the deterministic gates, gaps, and reasons to stop." },
            { to: "/knowledge", title: "Knowledge base", body: "Documents retrieval is allowed to cite." },
            { to: "/evaluations", title: "Evaluation lab", body: "Golden cases and any stored evaluation result." },
            { to: "/feedback", title: "Feedback", body: "Approvals, edits, and rejections a human recorded." },
          ].map((item) => (
            <li key={item.to}>
              <Card className="h-full transition-colors hover:border-violet/45 hover:bg-surface-2">
                <Link to={item.to} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime">
                  <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{item.body}</p>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <QueryState query={metrics} label="Dashboard metrics" errorTitle="Dashboard metrics could not be loaded">
        {(data) => {
          const grouped = buildMetrics(data);
          const provider = describeProvider(data.provider_kind);
          return (
            <div className="space-y-8">
              <section aria-labelledby="queue-heading" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="queue-heading" className="text-lg font-semibold text-ink">
                    Queue
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Analysis provider</span>
                    <Badge tone={provider.tone} title={provider.description}>
                      {provider.label}
                    </Badge>
                    {data.foundry_live ? null : <Badge>Foundry not live</Badge>}
                  </div>
                </div>
                <MetricGrid metrics={grouped.queue} />
              </section>
              <section aria-labelledby="assurance-heading" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 id="assurance-heading" className="text-lg font-semibold text-ink">
                      Assurance signals
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Counted from stored runs. A zero means the API reported zero. A value that could not be read is
                      shown as {NOT_AVAILABLE}. Each card opens Decision Assurance with that filter.
                    </p>
                  </div>
                  <Link className="text-sm font-medium underline underline-offset-2 hover:text-lime" to="/assurance">
                    Open Decision Assurance
                  </Link>
                </div>
                <MetricGrid metrics={grouped.assurance} />
              </section>
              <ScenarioEntryPoints risky={data.risky_cases ?? []} />
              <section aria-labelledby="decisions-heading" className="space-y-3">
                <h2 id="decisions-heading" className="text-lg font-semibold text-ink">
                  Recorded human decisions
                </h2>
                <Card>
                  <dl className="grid gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted">Approval rate</dt>
                      <dd className="m-0 text-lg font-semibold">{percent(data.approval_rate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Edit rate</dt>
                      <dd className="m-0 text-lg font-semibold">{percent(data.edit_rate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Rejection rate</dt>
                      <dd className="m-0 text-lg font-semibold">{percent(data.rejection_rate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Average workflow time</dt>
                      <dd className="m-0 text-lg font-semibold">
                        {formatDuration(data.average_workflow_latency_ms)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-muted">
                    These rates describe decisions humans recorded. They are not model certainty. {NOT_AVAILABLE}
                    means no decision has been recorded yet.
                  </p>
                  <p className="mt-3 text-sm">
                    <Link className="underline underline-offset-2 hover:text-lime" to="/feedback">
                      Open the feedback summary
                    </Link>
                    <span className="text-muted"> · </span>
                    <Link className="underline underline-offset-2 hover:text-lime" to="/tickets?ai_review_status=awaiting_human">
                      Cases awaiting a human
                    </Link>
                  </p>
                </Card>
              </section>
            </div>
          );
        }}
      </QueryState>

      <div className="space-y-3">
        <h2 id="activity-heading" className="text-lg font-semibold text-ink">
          Recent activity
        </h2>
        <p className="text-sm text-muted">
          Times come from stored timestamps. Today, Yesterday, and a count of days stay current as the clock moves.
          The exact time stays available on hover.
        </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="recent-cases-heading">
          <Card className="h-full">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-cases-heading" className="font-semibold">
                Recent cases
              </h2>
              <Link className="text-xs font-medium underline underline-offset-2 hover:text-lime" to="/tickets">
                All tickets
              </Link>
            </div>
            <div className="mt-3">
              <QueryState
                query={tickets}
                label="Recent cases"
                isEmpty={(data) => data.items.length === 0}
                empty={<p className="text-sm text-muted">No tickets yet.</p>}
              >
                {(data) => (
                  <ul className="m-0 list-none space-y-2 p-0 text-sm">
                    {data.items.map((ticket) => (
                      <li key={ticket.id}>
                        <Link className="hover:underline" to={`/tickets/${ticket.id}`}>
                          {ticket.display_id}: {ticket.subject}
                        </Link>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-muted">
                          <span title={formatExactTime(ticket.updated_at)}>{formatDate(ticket.updated_at)}</span>
                          <Badge tone={aiStateTone(ticket.ai_review_status)}>{humanize(ticket.ai_review_status ?? ticket.status)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryState>
            </div>
          </Card>
        </section>
        <section aria-labelledby="waiting-heading">
          <Card className="h-full">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="waiting-heading" className="font-semibold">
                Waiting for a human
              </h2>
              <Link className="text-xs font-medium underline underline-offset-2 hover:text-lime" to="/tickets?ai_review_status=awaiting_human">
                Queue
              </Link>
            </div>
            <div className="mt-3">
              <QueryState
                query={waiting}
                label="Cases waiting for a human"
                isEmpty={(data) => data.items.length === 0}
                empty={<p className="text-sm text-muted">No analysed case is waiting for a human decision.</p>}
              >
                {(data) => (
                  <ul className="m-0 list-none space-y-2 p-0 text-sm">
                    {data.items.map((ticket) => (
                      <li key={ticket.id}>
                        <Link className="hover:underline" to={`/tickets/${ticket.id}`}>
                          {ticket.display_id}: {ticket.subject}
                        </Link>
                        <span className="mt-1 block text-muted" title={formatExactTime(ticket.updated_at)}>
                          {formatDate(ticket.updated_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryState>
            </div>
          </Card>
        </section>
        <section aria-labelledby="recent-runs-heading">
          <Card className="h-full">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-runs-heading" className="font-semibold">
                Recent AI runs
              </h2>
              <Link className="text-xs font-medium underline underline-offset-2 hover:text-lime" to="/ai-runs">
                All AI runs
              </Link>
            </div>
            <div className="mt-3">
              <QueryState
                query={runs}
                label="Recent AI runs"
                isEmpty={(data) => data.items.length === 0}
                empty={<p className="text-sm text-muted">No AI runs yet. Open a ticket and run an analysis.</p>}
              >
                {(data) => (
                  <ul className="m-0 list-none space-y-2 p-0 text-sm">
                    {data.items.slice(0, 5).map((run) => {
                      const provider = describeProvider(run.provider_kind);
                      return (
                        <li key={run.id}>
                          <Link className="hover:underline" to={`/ai-runs/${run.id}`}>
                            <span title={formatExactTime(run.created_at)}>{formatDate(run.created_at)}</span>
                            : {humanize(run.assurance_outcome ?? run.status)}
                          </Link>
                          <span className="mt-1 block text-xs">
                            <Link className="underline underline-offset-2 hover:text-lime" to={`/replay?ticket=${run.ticket_id}`}>
                              Replay
                            </Link>
                            <span className="text-muted"> · </span>
                            <Link className="underline underline-offset-2 hover:text-lime" to="/assurance">
                              Assurance
                            </Link>
                          </span>
                          <span className="mt-0.5 block">
                            <Badge tone={provider.tone} title={provider.description}>
                              {provider.label}
                            </Badge>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </QueryState>
            </div>
          </Card>
        </section>
      </div>
      </div>

      {!metrics.isPending && !metrics.isError && risky.length === 0 ? (
        <EmptyState
          title="No synthetic scenarios seeded"
          body={
            administrativeMutationsEnabled
              ? "Use Reset synthetic demo to seed the four curated cases. This only affects demo tickets and demo knowledge."
              : "The public demo does not currently contain the curated scenarios."
          }
        />
      ) : null}

      {administrativeMutationsEnabled ? (
        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Reset synthetic demo data"
          description="Deletes synthetic tickets with their AI runs and feedback, synthetic knowledge documents, and synthetic customers, then seeds them again."
          variant="modal"
          testId="reset-demo-dialog"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                data-testid="confirm-reset-demo"
                disabled={resetDemo.isPending}
                onClick={() => resetDemo.mutate()}
              >
                {resetDemo.isPending ? "Resetting" : "Reset synthetic demo"}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-ink-soft">
            <p>
              Tickets you created and documents you uploaded are also stored as synthetic demo records, so this
              removes them too. Demo usage counters are cleared. It does not change Azure credentials, cloud
              resources, or the application configuration.
            </p>
            {resetDemo.isError ? (
              <ErrorState
                compact
                title="Reset failed"
                message={describeError(resetDemo.error).summary}
              />
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
