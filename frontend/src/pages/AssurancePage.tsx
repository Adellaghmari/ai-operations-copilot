import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AiRun } from "../lib/api";
import { describeProvider, explainOutcome, gateTone } from "../lib/presentation";
import { NOT_AVAILABLE, formatDate, formatExactTime, formatOutcome, humanize } from "../lib/utils";
import { QueryState } from "../components/QueryState";
import { Badge, Card, Chip, EmptyState, PageHeader, buttonClasses } from "../components/ui";

type Focus = "" | "conflicts" | "gaps" | "abstained";

function count(value: number | undefined): string {
  return value === undefined ? NOT_AVAILABLE : String(value);
}

function matchesFilter(run: AiRun, outcome: string, revised: boolean, focus: Focus): boolean {
  if (outcome && run.assurance_outcome !== outcome) return false;
  if (revised && run.revision_count < 1) return false;
  if (focus === "conflicts" && (run.conflict_count ?? 0) < 1) return false;
  if (focus === "gaps" && (run.missing_information_count ?? 0) < 1) return false;
  if (focus === "abstained" && !run.abstained) return false;
  return true;
}

export function AssurancePage() {
  const [params, setParams] = useSearchParams();
  const outcome = params.get("outcome") ?? "";
  const revised = params.get("revised") === "1";
  const focus = (params.get("focus") ?? "") as Focus;
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const runs = useQuery({
    queryKey: ["runs-assurance"],
    queryFn: () => api.aiRuns(undefined, { page: 1, page_size: 100 }),
  });

  function setFilter(next: { outcome?: string; revised?: boolean; focus?: Focus }) {
    const updated = new URLSearchParams(params);
    const nextOutcome = next.outcome === undefined ? outcome : next.outcome;
    const nextRevised = next.revised === undefined ? revised : next.revised;
    const nextFocus = next.focus === undefined ? focus : next.focus;
    if (nextOutcome) updated.set("outcome", nextOutcome);
    else updated.delete("outcome");
    if (nextRevised) updated.set("revised", "1");
    else updated.delete("revised");
    if (nextFocus) updated.set("focus", nextFocus);
    else updated.delete("focus");
    setParams(updated, { replace: true });
  }

  const filtered = useMemo(() => {
    const items = runs.data?.items ?? [];
    return items.filter((run) => matchesFilter(run, outcome, revised, focus));
  }, [runs.data, outcome, revised, focus]);

  return (
    <div className="space-y-8">
      <div className="ambient-hero">
        <PageHeader
          eyebrow="Decision intelligence"
          title="Decision Assurance"
          display
          description="Application code checks evidence, conflicts, missing facts, revision limits, and human control. Gates are reasons, not confidence. This page reads stored runs. It does not call a model."
        />
      </div>

      <section aria-labelledby="inspect-heading" className="grid gap-3 lg:grid-cols-3">
        <h2 id="inspect-heading" className="sr-only">
          How to inspect assurance
        </h2>
        {[
          {
            title: "Read the outcome",
            body: "Each stored run has a gate result. That result is a reason to proceed, revise, or stop. It is not a confidence score.",
          },
          {
            title: "Open the gate reasons",
            body: "Every gate asks one question and records the rule that fired. The detail under the badge is that rule.",
          },
          {
            title: "Follow the record",
            body: "From a run you can open the AI run, the ticket assurance section, or Decision Replay for the same ticket.",
          },
        ].map((item) => (
          <Card key={item.title}>
            <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
          </Card>
        ))}
      </section>

      <QueryState query={dashboard} label="Assurance counts" errorTitle="Dashboard metrics could not be loaded">
        {(data) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                {
                  label: "AI abstentions",
                  value: count(data.ai_abstentions),
                  hint: "Filter the list to runs that abstained.",
                  pressed: outcome === "ABSTAINED",
                  onClick: () => setFilter({ outcome: outcome === "ABSTAINED" ? "" : "ABSTAINED", revised: false, focus: "" }),
                },
                {
                  label: "Evidence gaps detected",
                  value: count(data.evidence_gaps_detected),
                  hint: "Filter the list to runs with missing information.",
                  pressed: focus === "gaps",
                  onClick: () => setFilter({ focus: focus === "gaps" ? "" : "gaps", outcome: "", revised: false }),
                },
                {
                  label: "Potential evidence conflicts",
                  value: count(data.potential_evidence_conflicts),
                  hint: "Filter the list to runs with a recorded conflict.",
                  pressed: focus === "conflicts",
                  onClick: () => setFilter({ focus: focus === "conflicts" ? "" : "conflicts", outcome: "", revised: false }),
                },
                {
                  label: "Recommendations revised",
                  value: count(data.recommendations_revised),
                  hint: "Filter the list to runs that used their one revision.",
                  pressed: revised,
                  onClick: () => setFilter({ revised: !revised, outcome: "", focus: "" }),
                },
                {
                  label: "Grounded recommendations",
                  value: count(data.grounded_recommendations),
                  hint: "Filter the list to runs ready for a human.",
                  pressed: outcome === "READY_FOR_HUMAN_REVIEW",
                  onClick: () =>
                    setFilter({
                      outcome: outcome === "READY_FOR_HUMAN_REVIEW" ? "" : "READY_FOR_HUMAN_REVIEW",
                      revised: false,
                      focus: "",
                    }),
                },
              ] as const
            ).map((card) => (
              <Card key={card.label} className={card.pressed ? "border-lime/50" : undefined}>
                <button type="button" className="w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime" aria-pressed={card.pressed} onClick={card.onClick}>
                  <p className="text-xs uppercase tracking-wide text-muted">{card.label}</p>
                  <p className="m-0 mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{card.hint}</p>
                </button>
              </Card>
            ))}
            <Card>
              <Link
                className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                to="/tickets?ai_review_status=awaiting_human"
              >
                <p className="text-xs uppercase tracking-wide text-muted">Cases awaiting human decision</p>
                <p className="m-0 mt-2 text-3xl font-semibold tabular-nums">
                  {count(data.cases_awaiting_human_decision ?? data.awaiting_human_review)}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">Open the ticket queue for cases with no recorded decision.</p>
              </Link>
            </Card>
          </div>
        )}
      </QueryState>
      <p className="text-xs text-muted">
        Counts above come from the dashboard API across stored runs. A missing count is shown as {NOT_AVAILABLE}.
        The list below is the runs the AI runs API returned on this page, then filtered in the browser. Selecting a
        count applies that filter.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter stored runs">
        <Chip active={!outcome && !revised && !focus} onClick={() => setFilter({ outcome: "", revised: false, focus: "" })}>
          All listed runs
        </Chip>
        <Chip active={outcome === "ABSTAINED"} onClick={() => setFilter({ outcome: outcome === "ABSTAINED" ? "" : "ABSTAINED" })}>
          Abstained
        </Chip>
        <Chip
          active={outcome === "READY_FOR_HUMAN_REVIEW"}
          onClick={() => setFilter({ outcome: outcome === "READY_FOR_HUMAN_REVIEW" ? "" : "READY_FOR_HUMAN_REVIEW" })}
        >
          Ready for human review
        </Chip>
        <Chip active={focus === "conflicts"} onClick={() => setFilter({ focus: focus === "conflicts" ? "" : "conflicts" })}>
          Potential conflicts
        </Chip>
        <Chip active={focus === "gaps"} onClick={() => setFilter({ focus: focus === "gaps" ? "" : "gaps" })}>
          Missing information
        </Chip>
        <Chip active={revised} onClick={() => setFilter({ revised: !revised })}>
          Used a revision
        </Chip>
      </div>

      <QueryState
        query={runs}
        label="Stored runs"
        errorTitle="AI runs could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="No stored runs yet"
            body="Run an AI analysis on a ticket. Assurance is computed when that run is stored."
            action={
              <Link to="/tickets" className={buttonClasses("primary")}>
                Open the ticket queue
              </Link>
            }
          />
        }
      >
        {() =>
          filtered.length === 0 ? (
            <EmptyState
              title="No listed runs match these filters"
              body="The AI runs API answered. None of the returned runs match the selected filters."
              action={
                <Chip active={false} onClick={() => setFilter({ outcome: "", revised: false, focus: "" })}>
                  Clear filters
                </Chip>
              }
            />
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {filtered.map((run) => {
                const provider = describeProvider(run.provider_kind);
                const report = run.assurance_report;
                const gates = report ? Object.values(report.gates) : [];
                return (
                  <li key={run.id}>
                    <Card className="space-y-3" data-testid={`assurance-run-${run.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink" title={formatExactTime(run.created_at)}>
                            {formatDate(run.created_at)}
                          </p>
                          <p className="mt-1 text-xs text-muted">{explainOutcome(run.assurance_outcome)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={provider.tone}>{provider.label}</Badge>
                          {run.assurance_outcome ? (
                            <Badge tone={gateTone(run.assurance_outcome)}>{formatOutcome(run.assurance_outcome)}</Badge>
                          ) : (
                            <Badge>No assurance report</Badge>
                          )}
                          {run.abstained ? <Badge tone="warn">Abstained</Badge> : null}
                          {run.revision_count > 0 ? <Badge>Revision used</Badge> : null}
                        </div>
                      </div>
                      {gates.length ? (
                        <ul className="m-0 list-none space-y-2 p-0">
                          {gates.map((gate) => (
                            <li key={gate.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                              <Badge tone={gateTone(gate.state)}>
                                {gate.label}: {humanize(gate.state)}
                              </Badge>
                              <p className="mt-1 text-xs text-ink-soft">{gate.question}</p>
                              {gate.detail ? <p className="mt-1 text-xs text-muted">{gate.detail}</p> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted">
                          Supported {run.supported_claim_count ?? 0}, unsupported {run.unsupported_claim_count ?? 0},
                          conflicts {run.conflict_count ?? 0}, missing information {run.missing_information_count ?? 0}.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3 text-sm">
                        <Link className="underline underline-offset-2 hover:text-lime" to={`/ai-runs/${run.id}`}>
                          Open AI run
                        </Link>
                        <Link className="underline underline-offset-2 hover:text-lime" to={`/tickets/${run.ticket_id}#assurance`}>
                          Open ticket assurance
                        </Link>
                        <Link className="underline underline-offset-2 hover:text-lime" to={`/replay?ticket=${run.ticket_id}`}>
                          Open Decision Replay
                        </Link>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}
