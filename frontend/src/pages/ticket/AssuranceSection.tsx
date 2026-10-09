import type { ReactNode } from "react";
import type { AiRun, AssuranceGate, AssuranceReport } from "../../lib/api";
import { GATE_STATE_LEGEND, gateTone, supportTone } from "../../lib/presentation";
import { humanize } from "../../lib/utils";
import { Badge, Card } from "../../components/ui";
import { Disclosure } from "../../components/Disclosure";

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="m-0 list-disc space-y-0.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Derived facts for one gate. Everything here is read from the stored report, never recomputed by a model. */
function gateFacts(gate: AssuranceGate, report: AssuranceReport, run: AiRun | undefined): ReactNode {
  switch (gate.id) {
    case "evidence_support": {
      const states = ["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "CONFLICTED", "NOT_EVIDENCE_REQUIRED"];
      return (
        <div className="space-y-2">
          <p>Support state of each claim in the Evidence Ledger.</p>
          <div className="flex flex-wrap gap-2">
            {states.map((state) => {
              const count = report.ledger.filter((entry) => entry.support_state === state).length;
              return (
                <Badge key={state} tone={count > 0 ? supportTone(state) : "neutral"}>
                  {humanize(state)}: {count}
                </Badge>
              );
            })}
          </div>
          {report.ledger.length === 0 ? <p className="text-muted">The ledger holds no claims.</p> : null}
        </div>
      );
    }
    case "evidence_coverage":
      return (
        <div className="space-y-1">
          <p>
            {report.coverage.supported_claims} of {report.coverage.evidence_requiring_claims} evidence requiring claims
            have a supporting source.
          </p>
          <p className="text-muted">
            Reported as: {report.coverage.display}. Coverage describes the evidence. It is not the probability that the
            AI is right.
          </p>
        </div>
      );
    case "missing_information":
      return (
        <div className="space-y-2">
          <p className="font-medium">Evidence gaps</p>
          <Bullets
            items={report.gaps.map((gap) => `${gap.concept} (${humanize(gap.materiality).toLowerCase()}): ${gap.reason}`)}
            empty="No evidence gap was recorded."
          />
          {report.abstention.missing.length ? (
            <>
              <p className="font-medium">Missing from the case</p>
              <Bullets items={report.abstention.missing} empty="" />
            </>
          ) : null}
        </div>
      );
    case "conflicting_evidence":
      return (
        <Bullets
          items={report.conflicts.map((conflict) => conflict.summary)}
          empty="No potential conflict was validated against the retrieved chunks."
        />
      );
    case "unsupported_action": {
      const weak = report.ledger.filter(
        (entry) => entry.category === "action" && entry.support_state !== "SUPPORTED" && entry.requires_evidence,
      );
      return (
        <Bullets
          items={weak.map((entry) => `${entry.claim} (${humanize(entry.support_state).toLowerCase()})`)}
          empty="Every action claim that needs evidence has support."
        />
      );
    }
    case "independent_review": {
      const review = run?.review_result;
      if (!review) return <p className="text-muted">The review result is not available.</p>;
      return (
        <div className="space-y-1">
          <p>Verdict: {review.status ?? "Not recorded"}</p>
          {review.review_summary ? <p className="text-ink-soft">{review.review_summary}</p> : null}
        </div>
      );
    }
    case "human_control":
      return (
        <p>
          A person decides every case. The AI never sends a message to a customer, and passing every gate does not
          authorize sending a reply.
        </p>
      );
    default:
      return null;
  }
}

export function AssuranceSection({
  run,
  report,
}: {
  run: AiRun | undefined;
  report: AssuranceReport | undefined;
}) {
  if (!report) {
    return (
      <Card>
        <p className="text-sm text-muted">
          No assurance report yet. The Decision Assurance Engine runs after the Review agent, so it needs an AI run.
        </p>
      </Card>
    );
  }
  const gates = Object.values(report.gates);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold text-ink">What the Decision Assurance Engine is</h3>
        <p className="mt-1 text-sm text-ink-soft">
          The engine is application code, not a fourth agent and not a model. It reads the Resolution draft, the
          Review result, and the retrieved chunks, then applies deterministic gates. Each gate answers one question and
          shows its reason.
        </p>
        <div className="mt-3">
          <Disclosure title="How to read gate states" headingLevel={4}>
            <dl className="m-0 space-y-1">
              {GATE_STATE_LEGEND.map((item) => (
                <div key={item.state} className="flex flex-wrap items-center gap-2">
                  <dt>
                    <Badge tone={gateTone(item.state)}>{humanize(item.state)}</Badge>
                  </dt>
                  <dd className="m-0 text-ink-soft">{item.meaning}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2" data-testid="assurance-gates">
        {gates.map((gate) => (
          <Disclosure
            key={gate.id}
            testId={`gate-${gate.id}`}
            title={gate.label}
            summary={gate.question}
            trailing={<Badge tone={gateTone(gate.state)}>{humanize(gate.state)}</Badge>}
          >
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Reason</p>
                <p className="mt-1 text-ink">{gate.detail}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">What this is based on</p>
                <div className="mt-1 text-ink">{gateFacts(gate, report, run)}</div>
              </div>
            </div>
          </Disclosure>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="risk-flags">
          <h3 className="text-sm font-semibold text-ink">Risk flags</h3>
          <div className="mt-2 text-sm">
            <Bullets items={report.risk_flags} empty="No risk flag was raised." />
          </div>
        </Card>
        <Card data-testid="blocking-issues">
          <h3 className="text-sm font-semibold text-ink">Blocking issues</h3>
          <div className="mt-2 text-sm">
            <Bullets items={report.blocking_issues} empty="No blocking issue was recorded." />
          </div>
        </Card>
      </div>
    </div>
  );
}
