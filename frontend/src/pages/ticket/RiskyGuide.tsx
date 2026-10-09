import { useEffect, useId, useState } from "react";
import type { AiRun, AssuranceReport } from "../../lib/api";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui";
import { focusTicketTarget } from "./SectionNav";

const FAILURE_STATUSES = new Set(["failed", "foundry_unavailable", "quota_exceeded"]);

export type RecommendedAction = "run" | "evidence" | "assurance" | "decision" | "replay";

export type GuideStepStatus = "complete" | "current" | "waiting";

export type GuideStep = {
  id: string;
  title: string;
  detail: string;
  target: string;
  status: GuideStepStatus;
  progress: string;
};

export function analysisSucceeded(run: AiRun | undefined): boolean {
  return Boolean(run) && !FAILURE_STATUSES.has(run!.status);
}

export function nextRecommendedAction(input: {
  analysisSucceeded: boolean;
  evidenceAvailable: boolean;
  assuranceAvailable: boolean;
  humanDecisionRecorded: boolean;
  comparableRuns: number;
}): RecommendedAction {
  if (!input.analysisSucceeded) return "run";
  if (!input.evidenceAvailable) return "evidence";
  if (!input.assuranceAvailable) return "assurance";
  if (!input.humanDecisionRecorded) return "decision";
  if (input.comparableRuns < 2) return "run";
  return "replay";
}

function stepStatus(done: boolean, current: boolean): GuideStepStatus {
  if (done) return "complete";
  if (current) return "current";
  return "waiting";
}

export function buildGuideSteps(input: {
  analysisSucceeded: boolean;
  evidenceAvailable: boolean;
  assuranceAvailable: boolean;
  humanDecisionRecorded: boolean;
  comparableRuns: number;
}): GuideStep[] {
  const recommended = nextRecommendedAction(input);
  const steps: Omit<GuideStep, "status">[] = [
    {
      id: "understand",
      title: "Understand the case",
      detail: "Read the stored ticket, severity, and what the customer asked.",
      target: "overview",
      progress: "Case loaded",
    },
    {
      id: "run",
      title: "Run the AI analysis",
      detail: "Start the real Triage, Resolution, and Review workflow.",
      target: "run-ai-analysis",
      progress: input.analysisSucceeded ? "Analysis complete" : "Analysis not run yet",
    },
    {
      id: "evidence",
      title: "Inspect evidence",
      detail: "Open the Evidence Ledger and see what retrieval actually cited.",
      target: "evidence",
      progress: input.evidenceAvailable ? "Evidence available" : "Waiting for a stored run",
    },
    {
      id: "assurance",
      title: "Review Decision Assurance",
      detail: "Read the deterministic gates. They are not a fourth model.",
      target: "assurance",
      progress: input.assuranceAvailable ? "Assurance report stored" : "Waiting for a stored run",
    },
    {
      id: "decision",
      title: "Make the human decision",
      detail: "Approve, edit, reject, regenerate, or escalate. AI never sends the customer message.",
      target: "decision",
      progress: input.humanDecisionRecorded ? "Human decision recorded" : "Human decision pending",
    },
    {
      id: "replay",
      title: "Replay what happened",
      detail:
        input.comparableRuns < 2
          ? "Decision Replay needs two stored runs of this ticket. Run the analysis again after the first decision."
          : "Compare two stored runs of this ticket.",
      target: "replay",
      progress:
        input.comparableRuns >= 2
          ? "Replay available"
          : input.analysisSucceeded
            ? "Needs two stored runs"
            : "Waiting for stored runs",
    },
  ];

  const done = [
    true,
    input.analysisSucceeded,
    input.evidenceAvailable,
    input.assuranceAvailable,
    input.humanDecisionRecorded,
    input.comparableRuns >= 2,
  ];
  const currentIndex = done.findIndex((value) => !value);

  return steps.map((step, index) => ({
    ...step,
    status: stepStatus(done[index], index === currentIndex),
    progress:
      step.id === "run" && recommended === "run" && input.humanDecisionRecorded && input.comparableRuns < 2
        ? "Run again to enable replay"
        : step.progress,
  }));
}

const STORAGE_PREFIX = "copilot.risky-guide.collapsed.";

export function RiskyGuide({
  ticketId,
  run,
  report,
  comparableRuns,
  recommended,
}: {
  ticketId: string;
  run: AiRun | undefined;
  report: AssuranceReport | undefined;
  comparableRuns: number;
  recommended: RecommendedAction;
}) {
  const headingId = useId();
  const storageKey = `${STORAGE_PREFIX}${ticketId}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(sessionStorage.getItem(storageKey) === "1");
    } catch {
      setCollapsed(false);
    }
  }, [storageKey]);

  function persist(next: boolean) {
    setCollapsed(next);
    try {
      sessionStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      /* sessionStorage can be unavailable in private contexts */
    }
  }

  const evidenceAvailable = Boolean(report?.ledger?.length || run?.retrieval_result?.chunks?.length);
  const steps = buildGuideSteps({
    analysisSucceeded: analysisSucceeded(run),
    evidenceAvailable,
    assuranceAvailable: Boolean(report),
    humanDecisionRecorded: Boolean(run?.human_decision),
    comparableRuns,
  });
  const recommendedStep = steps.find((step) => step.status === "current") ?? steps[steps.length - 1];

  if (collapsed) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet/35 bg-violet/10 px-4 py-3"
        data-testid="risky-guide"
      >
        <p className="text-sm text-ink">
          Guided review is hidden. The ticket is unchanged. Open it again when you want the walkthrough.
        </p>
        <Button variant="secondary" size="sm" onClick={() => persist(false)} data-testid="show-risky-guide">
          Show guided review
        </Button>
      </div>
    );
  }

  return (
    <section
      className="rounded-2xl border border-violet/35 bg-[#0c0b14] p-4 shadow-[0_22px_60px_-32px_rgba(124,58,237,0.55)]"
      aria-labelledby={headingId}
      data-testid="risky-guide"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-violet">Guided review</p>
          <h2 id={headingId} className="mt-1 text-base font-semibold text-ink">
            What to do on this risky case
          </h2>
          <p className="mt-1 text-sm text-muted">
            A recruiter walkthrough of the stored case. Every step moves to a real control or section. Nothing here is
            a simulated AI action.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => persist(true)} data-testid="hide-risky-guide">
          Hide walkthrough
        </Button>
      </div>

      <ol className="m-0 mt-4 list-none space-y-2 p-0">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => focusTicketTarget(step.target)}
              aria-current={step.status === "current" ? "step" : undefined}
              aria-label={`${step.title}. ${step.progress}. ${step.status === "complete" ? "Complete" : step.status === "current" ? "Current step" : "Waiting"}`}
              data-testid={`guide-step-${step.id}`}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
                step.status === "current"
                  ? "border-lime/50 bg-lime/10"
                  : "border-line bg-surface-2/60 hover:border-violet/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.status === "complete"
                    ? "bg-lime text-lime-ink"
                    : step.status === "current"
                      ? "bg-violet text-ink"
                      : "bg-surface-3 text-muted",
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-medium text-ink">{step.title}</span>
                  <span className="text-xs text-muted">{step.progress}</span>
                </span>
                <span className="mt-0.5 block text-sm text-muted">{step.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-sm text-ink" data-testid="next-recommended-action">
        Next recommended action: {recommendedStep.title}.
        {recommended === "run" ? " Use the Run AI analysis control on this page." : null}
        {recommended === "decision" ? " Record a human decision. Nothing is sent to the customer." : null}
        {recommended === "replay" ? " Open Replay on this ticket." : null}
      </p>
    </section>
  );
}
