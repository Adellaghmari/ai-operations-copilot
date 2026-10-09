from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ai import (
    MaterialityLiteral,
    SupportStateLiteral,
)

GateStateLiteral = Literal["PASS", "WARNING", "BLOCKED", "HUMAN_REQUIRED", "REVISE", "ESCALATE"]
CoverageGateStateLiteral = Literal["PASS", "WARNING", "BLOCKED"]
MissingGateStateLiteral = Literal["PASS", "WARNING", "HUMAN_REQUIRED"]
ConflictGateStateLiteral = Literal["PASS", "WARNING", "BLOCKED"]
UnsupportedActionStateLiteral = Literal["PASS", "BLOCKED"]
ReviewGateStateLiteral = Literal["PASS", "REVISE", "ESCALATE"]
HumanControlStateLiteral = Literal["HUMAN_REQUIRED"]
AssuranceOutcomeLiteral = Literal[
    "READY_FOR_HUMAN_REVIEW",
    "NEEDS_ATTENTION",
    "BLOCKED_BY_EVIDENCE",
    "ABSTAINED",
    "ESCALATION_REQUIRED",
]


class EvidenceMapping(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    section: str
    excerpt: str


class EvidenceLedgerEntry(BaseModel):
    claim_id: str
    claim: str
    category: str
    requires_evidence: bool
    support_state: SupportStateLiteral
    document_ids: list[str] = Field(default_factory=list)
    chunk_ids: list[str] = Field(default_factory=list)
    evidence: list[EvidenceMapping] = Field(default_factory=list)
    review_note: str | None = None


class ValidatedConflict(BaseModel):
    label: Literal["POTENTIAL_CONFLICT"] = "POTENTIAL_CONFLICT"
    chunk_a: str
    chunk_b: str
    document_a: str
    document_b: str
    section_a: str
    section_b: str
    excerpt_a: str
    excerpt_b: str
    summary: str
    why_conflicts: str
    materiality: MaterialityLiteral
    impact: str
    source: Literal["review_agent", "policy_overlap"] = "review_agent"


class EvidenceGap(BaseModel):
    concept: str
    reason: str
    materiality: MaterialityLiteral
    source: Literal["triage", "review", "resolution", "engine"] = "engine"


class AssuranceGate(BaseModel):
    id: str
    label: str
    question: str
    state: str
    detail: str


class EvidenceCoverage(BaseModel):
    supported_claims: int
    evidence_requiring_claims: int
    display: str
    state: CoverageGateStateLiteral


class RevisionDelta(BaseModel):
    occurred: bool
    reviewer_challenged: list[str] = Field(default_factory=list)
    changed: list[str] = Field(default_factory=list)
    removed_unsupported_claims: list[str] = Field(default_factory=list)
    added_evidence_requirement: list[str] = Field(default_factory=list)
    remaining_concern: list[str] = Field(default_factory=list)
    original_action: str | None = None
    revised_action: str | None = None


class AbstentionResult(BaseModel):
    abstained: bool
    reason: str | None = None
    missing: list[str] = Field(default_factory=list)
    recommended_next_step: str | None = None


class AssuranceGates(BaseModel):
    evidence_support: AssuranceGate
    evidence_coverage: AssuranceGate
    missing_information: AssuranceGate
    conflicting_evidence: AssuranceGate
    unsupported_action: AssuranceGate
    independent_review: AssuranceGate
    human_control: AssuranceGate


class DecisionPacket(BaseModel):
    case: dict
    ai_recommendation: dict
    assurance_outcome: AssuranceOutcomeLiteral
    assurance_gates: AssuranceGates
    evidence_ledger: list[EvidenceLedgerEntry]
    evidence_gaps: list[EvidenceGap]
    conflicting_evidence: list[ValidatedConflict]
    risk_flags: list[str]
    independent_review: dict
    revision_delta: RevisionDelta
    abstention: AbstentionResult
    human_decision: dict
    audit: dict


class AssuranceReport(BaseModel):
    outcome: AssuranceOutcomeLiteral
    gates: AssuranceGates
    coverage: EvidenceCoverage
    ledger: list[EvidenceLedgerEntry]
    gaps: list[EvidenceGap]
    conflicts: list[ValidatedConflict]
    risk_flags: list[str] = Field(default_factory=list)
    revision_delta: RevisionDelta
    abstention: AbstentionResult
    packet: DecisionPacket
    blocking_issues: list[str] = Field(default_factory=list)


class RunComparisonChange(BaseModel):
    field: str
    label: str
    before: str
    after: str
    changed: bool


class RunComparison(BaseModel):
    identical: bool
    run_a_id: str
    run_b_id: str
    summary: str
    triage: RunComparisonChange
    recommendation: RunComparisonChange
    assurance: RunComparisonChange
    review: RunComparisonChange
    human_decision: RunComparisonChange
    prompt_version: RunComparisonChange
    evidence_added: list[str] = Field(default_factory=list)
    evidence_removed: list[str] = Field(default_factory=list)
    claim_support_changes: list[str] = Field(default_factory=list)
    conflicts_introduced: list[str] = Field(default_factory=list)
    conflicts_resolved: list[str] = Field(default_factory=list)
    missing_information_changes: list[str] = Field(default_factory=list)
    revision_occurrence: RunComparisonChange
    gate_changes: list[RunComparisonChange] = Field(default_factory=list)
    why: list[str] = Field(default_factory=list)
