from enum import StrEnum


class TicketStatus(StrEnum):
    OPEN = "open"
    WAITING_ON_CUSTOMER = "waiting_on_customer"
    WAITING_ON_HUMAN = "waiting_on_human"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    CLOSED = "closed"


class TicketCategory(StrEnum):
    ACCOUNT_ACCESS = "account_access"
    BILLING = "billing"
    BUG = "bug"
    INTEGRATION = "integration"
    ONBOARDING = "onboarding"
    PERFORMANCE = "performance"
    SECURITY = "security"
    FEATURE_REQUEST = "feature_request"
    HOW_TO = "how_to"
    SERVICE_INCIDENT = "service_incident"
    OTHER = "other"


class Severity(StrEnum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class Urgency(StrEnum):
    IMMEDIATE = "immediate"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class Sentiment(StrEnum):
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    POSITIVE = "positive"


class AiRunStatus(StrEnum):
    QUEUED = "queued"
    TRIAGE_COMPLETED = "triage_completed"
    KNOWLEDGE_RETRIEVED = "knowledge_retrieved"
    RESOLUTION_GENERATED = "resolution_generated"
    REVIEW_COMPLETED = "review_completed"
    AWAITING_HUMAN = "awaiting_human"
    HUMAN_APPROVED = "human_approved"
    HUMAN_EDITED = "human_edited"
    HUMAN_REJECTED = "human_rejected"
    HUMAN_ESCALATED = "human_escalated"
    FAILED = "failed"
    FOUNDRY_UNAVAILABLE = "foundry_unavailable"
    QUOTA_EXCEEDED = "quota_exceeded"


class ReviewStatus(StrEnum):
    PASS = "PASS"
    REVISE = "REVISE"


class HumanDecision(StrEnum):
    APPROVE = "approve"
    EDIT_AND_APPROVE = "edit_and_approve"
    REJECT = "reject"
    REGENERATE = "regenerate"
    ESCALATE = "escalate"


class IngestionStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


class DocumentVisibility(StrEnum):
    STANDARD = "standard"
    EVALUATION_ONLY = "evaluation_only"


class FeedbackLabel(StrEnum):
    FULLY_USEFUL = "fully_useful"
    MINOR_EDITS = "minor_edits"
    MAJOR_EDITS = "major_edits"
    WRONG_KNOWLEDGE = "wrong_knowledge"
    HALLUCINATED_DETAIL = "hallucinated_detail"
    WRONG_SEVERITY = "wrong_severity"
    BAD_TONE = "bad_tone"
    MISSING_INFORMATION = "missing_information"
    SHOULD_HAVE_ESCALATED = "should_have_escalated"


class ProviderKind(StrEnum):
    FOUNDRY = "foundry"
    TEST_FIXTURE = "test_fixture"
    LOCAL_HASH = "local_hash"
    UNAVAILABLE = "unavailable"
