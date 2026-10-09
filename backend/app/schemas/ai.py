from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ReviewStatus, Sentiment, Severity, TicketCategory, Urgency

SeverityLiteral = Literal["P1", "P2", "P3", "P4"]
CategoryLiteral = Literal[
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
]
ClaimCategoryLiteral = Literal["fact", "action", "policy", "procedure", "limitation", "other"]
SupportStateLiteral = Literal[
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "UNSUPPORTED",
    "CONFLICTED",
    "NOT_EVIDENCE_REQUIRED",
]
MaterialityLiteral = Literal["LOW", "MATERIAL", "BLOCKING"]
ReviewStatusLiteral = Literal["PASS", "REVISE", "ESCALATE"]


class TriageResult(BaseModel):
    ticket_summary: str
    category: CategoryLiteral
    severity: SeverityLiteral
    urgency: Literal["immediate", "high", "normal", "low"]
    sentiment: Literal["negative", "neutral", "positive"]
    technical_entities: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    retrieval_query: str
    requires_human_attention: bool
    reasoning_summary: str


class RetrievedChunk(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    section: str
    body: str
    retrieval_score: float
    vector_rank: int | None = None
    lexical_rank: int | None = None


class SourceCitation(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    section: str
    snippet: str


class QualitySignalComponents(BaseModel):
    retrieval_coverage: float
    mean_retrieval_score: float
    citation_coverage: float
    review_pass: float
    information_completeness: float
    score: float
    label: str = "AI quality signal"


class ResolutionClaim(BaseModel):
    claim_id: str
    text: str
    category: ClaimCategoryLiteral = "fact"
    requires_evidence: bool = True
    cited_chunk_ids: list[str] = Field(default_factory=list)


class ResolutionDraft(BaseModel):
    internal_summary: str
    recommended_actions: list[str]
    customer_response_draft: str
    source_citations: list[SourceCitation] = Field(default_factory=list)
    escalation_required: bool
    escalation_reason: str | None = None
    unanswered_questions: list[str] = Field(default_factory=list)
    quality_signal_components: QualitySignalComponents | None = None
    limitations: list[str] = Field(default_factory=list)
    proposed_action: str = ""
    claims: list[ResolutionClaim] = Field(default_factory=list)


class ClaimEvidenceAssessment(BaseModel):
    claim_id: str
    support_state: SupportStateLiteral
    valid_chunk_ids: list[str] = Field(default_factory=list)
    issue: str | None = None
    materiality: MaterialityLiteral = "MATERIAL"


class PotentialConflict(BaseModel):
    chunk_a: str
    chunk_b: str
    summary: str
    materiality: MaterialityLiteral = "MATERIAL"
    impact: str


class MissingInformationItem(BaseModel):
    concept: str
    reason: str
    materiality: MaterialityLiteral = "MATERIAL"


class ReviewResult(BaseModel):
    status: ReviewStatusLiteral
    grounding_issues: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)
    tone_issues: list[str] = Field(default_factory=list)
    safety_flags: list[str] = Field(default_factory=list)
    citation_issues: list[str] = Field(default_factory=list)
    recommended_changes: list[str] = Field(default_factory=list)
    review_summary: str
    claim_assessments: list[ClaimEvidenceAssessment] = Field(default_factory=list)
    potential_conflicts: list[PotentialConflict] = Field(default_factory=list)
    missing_information: list[MissingInformationItem] = Field(default_factory=list)


class WorkflowOutput(BaseModel):
    triage: TriageResult
    retrieved: list[RetrievedChunk]
    resolution: ResolutionDraft
    review: ReviewResult
    revision_count: int
    forced_human_escalation: bool = False
    provider_kind: str
    original_resolution: ResolutionDraft | None = None
    abstained: bool = False
    assurance_report: dict | None = None


def coerce_enums() -> None:
    _ = (TicketCategory, Severity, Urgency, Sentiment, ReviewStatus)
