import type { AiRun, AssuranceReport, TicketDetail } from "../../lib/api";
import {
  buildDecisionTrail,
  describeProvider,
  explainOutcome,
  gateTone,
} from "../../lib/presentation";
import type { TrailStep } from "../../lib/presentation";
import { formatOutcome, humanize } from "../../lib/utils";
import { Badge, Card, Eyebrow } from "../../components/ui";

const TRAIL_STATE_LABEL: Record<TrailStep["state"], string> = {
  done: "Done",
  skipped: "Not needed",
  pending: "Pending",
  attention: "Needs attention",
};

export function RunProviderNotice({ run }: { run: AiRun }) {
  const provider = describeProvider(run.provider_kind);
  if (provider.isFoundry) return null;
  return (
    <div
      role="note"
      data-testid="fixture-notice"
      className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
    >
      <p className="font-semibold">{provider.label}</p>
      <p className="mt-0.5">{provider.description}</p>
    </div>
  );
}

export function OutcomeBanner({ report, run }: { report: AssuranceReport; run: AiRun }) {
  const abstained = Boolean(run.abstained || report.abstention?.abstained);
  const tone = gateTone(report.outcome);
  return (
    <Card data-testid="assurance-outcome" className="border-lime/40">
      <Eyebrow>Decision Assurance Engine</Eyebrow>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold text-ink">{formatOutcome(report.outcome)}</h3>
        <Badge tone={tone}>{humanize(report.outcome)}</Badge>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{explainOutcome(report.outcome)}</p>
      <p className="mt-2 text-xs text-muted">
        Gates measure inspectable evidence and process conditions. They are not a confidence percentage and do not
        guarantee correctness.
      </p>
      {abstained ? (
        <div className="mt-4 rounded-md bg-amber-400/10 p-3 text-sm text-amber-100" data-testid="abstention-banner">
          <p className="font-semibold">The AI abstained on purpose</p>
          <p className="mt-1">
            {report.abstention.reason ?? "The evidence did not support a safe recommendation."}
          </p>
          {report.abstention.missing.length ? (
            <div className="mt-2">
              <p className="font-medium">What is missing</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {report.abstention.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.abstention.recommended_next_step ? (
            <p className="mt-2">
              <span className="font-medium">Suggested next step: </span>
              {report.abstention.recommended_next_step}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-amber-200">
            Abstention is a product decision, not a failure. No customer draft was produced.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

export function DecisionTrail({ run }: { run: AiRun | undefined }) {
  const steps = buildDecisionTrail(run);
  return (
    <Card data-testid="decision-trail">
      <h3 className="text-sm font-semibold text-ink">Decision trail</h3>
      <p className="mt-1 text-xs text-muted">
        Each step is marked from what the stored run contains. Nothing here is estimated.
      </p>
      <ol className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-xs text-muted">Step {index + 1}</p>
            <p className="text-sm font-medium text-ink">{step.label}</p>
            <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
            <p className="mt-1">
              <Badge
                tone={
                  step.state === "done"
                    ? "good"
                    : step.state === "attention"
                      ? "warn"
                      : "neutral"
                }
              >
                {TRAIL_STATE_LABEL[step.state]}
              </Badge>
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{title}</dt>
      <dd className="m-0 mt-1">
        <ul className="m-0 list-disc space-y-0.5 pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

export function CaseCard({ ticket }: { ticket: TicketDetail }) {
  return (
    <Card data-testid="case-input">
      <h3 className="text-sm font-semibold text-ink">Case input</h3>
      <p className="mt-1 text-xs text-muted">
        The customer message is untrusted content. It is analysed as data and never followed as an instruction.
      </p>
      <p className="mt-3 text-sm text-muted">
        {ticket.customer
          ? `${ticket.customer.company}, ${ticket.customer.name}, ${humanize(ticket.customer.plan)} plan`
          : "Customer not recorded"}
      </p>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm text-ink">{ticket.body}</p>
    </Card>
  );
}

export function TriageCard({ run }: { run: AiRun | undefined }) {
  const triage = run?.triage_result ?? null;
  return (
    <Card data-testid="triage-panel">
      <h3 className="text-sm font-semibold text-ink">Triage</h3>
      {triage ? (
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div data-testid="triage-category">
              <dt className="inline text-muted">Category: </dt>
              <dd className="m-0 inline font-medium">{humanize(triage.category, "Not recorded")}</dd>
            </div>
            <div data-testid="triage-severity">
              <dt className="inline text-muted">Severity: </dt>
              <dd className="m-0 inline font-medium">{triage.severity ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Urgency: </dt>
              <dd className="m-0 inline font-medium">{humanize(triage.urgency, "Not recorded")}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Sentiment: </dt>
              <dd className="m-0 inline font-medium">{humanize(triage.sentiment, "Not recorded")}</dd>
            </div>
          </div>
          {triage.ticket_summary ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Summary</dt>
              <dd className="m-0 mt-1">{triage.ticket_summary}</dd>
            </div>
          ) : null}
          {triage.reasoning_summary ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Reasoning</dt>
              <dd className="m-0 mt-1">{triage.reasoning_summary}</dd>
            </div>
          ) : null}
          <ListBlock title="Missing information" items={triage.missing_information} />
          <ListBlock title="Risk flags" items={triage.risk_flags} />
          {triage.requires_human_attention ? (
            <p>
              <Badge tone="warn">Triage asks for human attention</Badge>
            </p>
          ) : null}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No triage yet. Run an AI analysis to produce structured triage.
        </p>
      )}
    </Card>
  );
}
