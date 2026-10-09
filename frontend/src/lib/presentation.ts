import type { AiRun, Health } from "./api";
import { humanize, pluralize } from "./utils";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

/** Tone for an assurance gate state or an assurance outcome. State is also always written as text. */
export function gateTone(state: string): Tone {
  if (state === "PASS" || state === "READY_FOR_HUMAN_REVIEW") return "good";
  if (state === "WARNING" || state === "REVISE" || state === "NEEDS_ATTENTION") return "warn";
  if (
    state === "BLOCKED" ||
    state === "ESCALATE" ||
    state === "HUMAN_REQUIRED" ||
    state === "ABSTAINED" ||
    state === "BLOCKED_BY_EVIDENCE" ||
    state === "ESCALATION_REQUIRED"
  ) {
    return "bad";
  }
  return "neutral";
}

export function supportTone(state: string): Tone {
  if (state === "SUPPORTED" || state === "NOT_EVIDENCE_REQUIRED") return "good";
  if (state === "PARTIALLY_SUPPORTED") return "warn";
  if (state === "UNSUPPORTED" || state === "CONFLICTED") return "bad";
  return "neutral";
}

export function materialityTone(value: string): Tone {
  if (value === "BLOCKING") return "bad";
  if (value === "MATERIAL") return "warn";
  return "neutral";
}

/** What each gate state means. These describe the vocabulary, not a probability. */
export const GATE_STATE_LEGEND: { state: string; meaning: string }[] = [
  { state: "PASS", meaning: "The condition was met." },
  { state: "WARNING", meaning: "Something deserves a closer look." },
  { state: "BLOCKED", meaning: "This condition blocks a confident recommendation." },
  { state: "HUMAN_REQUIRED", meaning: "A person must decide." },
  { state: "REVISE", meaning: "The reviewer asked for one revision." },
  { state: "ESCALATE", meaning: "The case should go to human escalation." },
];

export const OUTCOME_EXPLANATION: Record<string, string> = {
  READY_FOR_HUMAN_REVIEW:
    "No gate flagged a problem. The recommendation is ready for a human to review. Passing gates does not mean the answer is correct.",
  NEEDS_ATTENTION:
    "At least one gate raised a warning. A human should inspect the flagged items before acting.",
  BLOCKED_BY_EVIDENCE:
    "The evidence does not support a confident recommendation, or a blocking condition was found.",
  ABSTAINED:
    "The system declined to recommend an action and withheld a customer draft. This is an intended safe outcome.",
  ESCALATION_REQUIRED:
    "The review or the revision limit requires this case to go to human escalation.",
};

export function explainOutcome(outcome: string | null | undefined): string {
  if (!outcome) return "Run an AI analysis to see what the Decision Assurance Engine concludes.";
  return OUTCOME_EXPLANATION[outcome] ?? humanize(outcome);
}

export type ProviderPresentation = {
  label: string;
  description: string;
  tone: Tone;
  isFoundry: boolean;
  isFixture: boolean;
};

/**
 * Honest provider labelling. Only `foundry` may be described as Microsoft Foundry.
 * A fixture run is always labelled as a fixture.
 */
export function describeProvider(kind: string | null | undefined): ProviderPresentation {
  switch (kind) {
    case "foundry":
      return {
        label: "Microsoft Foundry",
        description: "Model output came from Microsoft Foundry.",
        tone: "good",
        isFoundry: true,
        isFixture: false,
      };
    case "test_fixture":
      return {
        label: "Test fixture",
        description: "Deterministic fixture output. This is not a Microsoft Foundry response.",
        tone: "warn",
        isFoundry: false,
        isFixture: true,
      };
    case "local_hash":
      return {
        label: "Local hash embeddings",
        description: "Local development provider. This is not a Microsoft Foundry response.",
        tone: "neutral",
        isFoundry: false,
        isFixture: false,
      };
    case "unavailable":
      return {
        label: "Provider unavailable",
        description: "No model provider was available for this run.",
        tone: "neutral",
        isFoundry: false,
        isFixture: false,
      };
    default:
      return {
        label: kind ? humanize(kind) : "Provider not recorded",
        description: "The provider for this run was not recognised.",
        tone: "neutral",
        isFoundry: false,
        isFixture: false,
      };
  }
}

export type ModeBadge = { label: string; tone: Tone; detail: string };

/** Header badges derived from the health endpoint. Never advertises Foundry unless the API says so. */
export function describeAppMode(health: Health): ModeBadge {
  if (health.uses_foundry) {
    return { label: "Foundry live", tone: "good", detail: "APP_MODE is foundry and endpoints are configured." };
  }
  if (health.app_mode === "test") {
    return {
      label: "Test fixture mode",
      tone: "warn",
      detail: "Deterministic fixtures. Output is not Microsoft Foundry.",
    };
  }
  if (health.app_mode === "foundry") {
    return {
      label: "Foundry not configured",
      tone: "warn",
      detail: "APP_MODE is foundry but the Foundry endpoints are not configured.",
    };
  }
  return {
    label: "Local mode",
    tone: "neutral",
    detail: "Foundry is not advertised in local mode.",
  };
}

export type ScenarioKey =
  | "well_grounded"
  | "policy_conflict"
  | "security_bypass"
  | "insufficient_evidence";

export type ScenarioInfo = {
  key: ScenarioKey;
  label: string;
  designedToShow: string;
  watchFor: string;
};

/** Describes what each synthetic scenario is designed to demonstrate. It does not promise a result. */
export const SCENARIOS: ScenarioInfo[] = [
  {
    key: "well_grounded",
    label: "Well grounded",
    designedToShow: "A how to question that the knowledge base covers directly.",
    watchFor: "Evidence Ledger rows with supported claims and a draft kept for human review.",
  },
  {
    key: "policy_conflict",
    label: "Conflicting policy",
    designedToShow: "A refund request where retrieved sources may disagree.",
    watchFor: "A potential conflict card and its effect on the conflicting evidence gate.",
  },
  {
    key: "security_bypass",
    label: "Security risk",
    designedToShow: "A request to skip identity verification.",
    watchFor: "The unsupported action gate and a safe abstention instead of a draft.",
  },
  {
    key: "insufficient_evidence",
    label: "Insufficient evidence",
    designedToShow: "An ownership change the knowledge base cannot justify.",
    watchFor: "Evidence gaps, missing information, and an empty customer draft.",
  },
];

export function scenarioInfo(value: string | null | undefined): ScenarioInfo | null {
  return SCENARIOS.find((item) => item.key === value) ?? null;
}

export const TICKET_STATUSES = [
  "open",
  "waiting_on_customer",
  "waiting_on_human",
  "resolved",
  "escalated",
  "closed",
] as const;

export const TICKET_CATEGORIES = [
  "account_access",
  "billing",
  "bug",
  "integration",
  "onboarding",
  "performance",
  "security",
  "feature_request",
  "how_to",
  "service_incident",
  "other",
] as const;

export const TICKET_SEVERITIES = ["P1", "P2", "P3", "P4"] as const;

/** Values stored on `ticket.ai_review_status`. They mirror the latest AI run status. */
export const AI_REVIEW_STATUSES = [
  "awaiting_human",
  "human_approved",
  "human_edited",
  "human_rejected",
  "human_escalated",
  "regeneration_requested",
  "failed",
  "foundry_unavailable",
  "quota_exceeded",
] as const;

export function aiStateTone(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  if (status === "human_approved" || status === "human_edited") return "good";
  if (status === "awaiting_human" || status === "regeneration_requested") return "info";
  if (status === "human_escalated") return "warn";
  if (status === "failed" || status === "foundry_unavailable" || status === "quota_exceeded" || status === "human_rejected") {
    return "bad";
  }
  return "neutral";
}

export function ticketStatusTone(status: string): Tone {
  if (status === "resolved" || status === "closed") return "good";
  if (status === "escalated") return "warn";
  if (status === "waiting_on_human" || status === "waiting_on_customer") return "info";
  return "neutral";
}

export const FEEDBACK_LABELS = [
  "fully_useful",
  "minor_edits",
  "major_edits",
  "wrong_knowledge",
  "hallucinated_detail",
  "wrong_severity",
  "bad_tone",
  "missing_information",
  "should_have_escalated",
] as const;

export type DecisionKind = "approve" | "edit_and_approve" | "reject" | "regenerate" | "escalate";

export function humanDecisionLabel(decision: string | null | undefined): string {
  if (!decision) return "Awaiting human decision";
  if (decision === "edit_and_approve") return "Edited and approved";
  if (decision === "approve") return "Approved";
  if (decision === "reject") return "Rejected";
  if (decision === "regenerate") return "Regeneration requested";
  if (decision === "escalate") return "Escalated";
  return humanize(decision);
}

/** True when the run produced a customer draft that a human could approve. */
export function hasDraft(run: AiRun | undefined | null): boolean {
  if (!run) return false;
  const abstained = Boolean(run.abstained || run.assurance_report?.abstention?.abstained);
  if (abstained) return false;
  return Boolean(run.original_customer_response && run.original_customer_response.trim());
}

export type TrailStepState = "done" | "skipped" | "pending" | "attention";

export type TrailStep = {
  id: string;
  label: string;
  detail: string;
  state: TrailStepState;
  anchor: string;
};

/**
 * Derive the decision trail from the persisted run. A step is only "done" when the run holds
 * its output. Nothing is inferred beyond what the API returned.
 */
export function buildDecisionTrail(run: AiRun | undefined | null): TrailStep[] {
  const hasRun = Boolean(run);
  const stepNames = new Set((run?.steps ?? []).map((step) => step.name));
  const revised = (run?.revision_count ?? 0) > 0 || stepNames.has("resolution_revision");
  const report = run?.assurance_report ?? null;
  const reviewStatus = run?.review_result?.status;
  const abstained = Boolean(run?.abstained || report?.abstention?.abstained);

  return [
    { id: "case", label: "Case", detail: "Ticket text is untrusted input", state: "done", anchor: "case" },
    {
      id: "triage",
      label: "Triage",
      detail: run?.triage_result ? `Severity ${run.triage_result.severity ?? "unknown"}` : "Not run yet",
      state: run?.triage_result ? "done" : "pending",
      anchor: "case",
    },
    {
      id: "retrieval",
      label: "Hybrid retrieval",
      detail: hasRun
        ? `${pluralize(run?.retrieval_result?.chunks?.length ?? run?.retrieved_chunk_count ?? 0, "chunk")} retrieved`
        : "Not run yet",
      state: run?.retrieval_result ? "done" : "pending",
      anchor: "evidence",
    },
    {
      id: "resolution",
      label: "Resolution",
      detail: abstained ? "Draft withheld" : run?.resolution_draft ? "Draft proposed" : "Not run yet",
      state: run?.resolution_draft ? "done" : "pending",
      anchor: "recommendation",
    },
    {
      id: "review",
      label: "Review",
      detail: reviewStatus ? `Verdict ${reviewStatus}` : "Not run yet",
      state: reviewStatus === "PASS" ? "done" : reviewStatus ? "attention" : "pending",
      anchor: "review",
    },
    {
      id: "revision",
      label: "Revision",
      detail: revised ? "One revision used" : hasRun ? "Not needed" : "Not run yet",
      state: revised ? "attention" : hasRun ? "skipped" : "pending",
      anchor: "review",
    },
    {
      id: "assurance",
      label: "Assurance",
      detail: report ? humanize(report.outcome) : "Not run yet",
      state: report
        ? report.outcome === "READY_FOR_HUMAN_REVIEW"
          ? "done"
          : "attention"
        : "pending",
      anchor: "assurance",
    },
    {
      id: "decision",
      label: "Human decision",
      detail: run?.human_decision ? humanDecisionLabel(run.human_decision) : "Awaiting human",
      state: run?.human_decision ? "done" : "pending",
      anchor: "decision",
    },
  ];
}
