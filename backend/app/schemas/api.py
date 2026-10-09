from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    app_mode: str
    foundry_configured: bool
    uses_foundry: bool


class ReadyResponse(BaseModel):
    status: str
    database: bool


class CustomerOut(BaseModel):
    id: UUID
    name: str
    company: str
    email: str
    plan: str
    region: str
    is_synthetic: bool
    notes: str

    model_config = {"from_attributes": True}


class TicketMessageOut(BaseModel):
    id: UUID
    author_type: str
    author_name: str
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketCreate(BaseModel):
    customer_id: UUID | None = None
    subject: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=10, max_length=8000)


class TicketOut(BaseModel):
    id: UUID
    display_id: str
    customer_id: UUID
    subject: str
    body: str
    status: str
    category: str | None
    severity: str | None
    channel: str
    is_synthetic: bool
    last_ai_analysis_at: datetime | None
    ai_review_status: str | None
    created_at: datetime
    updated_at: datetime
    customer: CustomerOut | None = None

    model_config = {"from_attributes": True}


class TicketDetail(TicketOut):
    messages: list[TicketMessageOut] = Field(default_factory=list)


class PageResult[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class HumanReviewRequest(BaseModel):
    decision: str
    edited_response: str | None = None
    feedback: str | None = None
    label: str | None = None


class KnowledgeDocumentOut(BaseModel):
    id: UUID
    slug: str
    title: str
    filename: str
    media_type: str
    visibility: str
    ingestion_status: str
    chunk_count: int
    last_indexed_at: datetime | None
    is_synthetic: bool
    embedding_model: str | None

    model_config = {"from_attributes": True}


class KnowledgeChunkOut(BaseModel):
    id: UUID
    document_id: UUID
    chunk_index: int
    section: str
    body: str
    token_count: int

    model_config = {"from_attributes": True}


class AiRunOut(BaseModel):
    id: UUID
    ticket_id: UUID
    status: str
    provider_kind: str
    model_deployment: str | None
    embedding_model: str | None
    agent_versions: dict[str, Any]
    prompt_versions: dict[str, Any]
    triage_result: dict[str, Any] | None
    retrieval_result: dict[str, Any] | None
    resolution_draft: dict[str, Any] | None
    review_result: dict[str, Any] | None
    original_customer_response: str | None
    final_customer_response: str | None
    human_decision: str | None
    human_feedback: str | None
    approved_at: datetime | None
    revision_count: int
    retrieved_chunk_count: int
    quality_signal: dict[str, Any] | None
    token_usage: dict[str, Any] | None
    error_message: str | None
    duration_ms: int | None
    was_edited: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AiRunStepOut(BaseModel):
    id: UUID
    name: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    duration_ms: int | None

    model_config = {"from_attributes": True}


class AiRunDetail(AiRunOut):
    steps: list[AiRunStepOut] = Field(default_factory=list)


class DashboardMetrics(BaseModel):
    open_tickets: int
    ai_assisted_tickets: int
    awaiting_human_review: int
    approval_rate: float | None
    edit_rate: float | None
    rejection_rate: float | None
    average_workflow_latency_ms: float | None
    latest_evaluation_groundedness: float | None
    knowledge_documents_indexed: int
    provider_kind: str
    foundry_live: bool


class FeedbackSummary(BaseModel):
    total: int
    by_label: dict[str, int]
    approval_rate: float | None
    edit_rate: float | None
    rejection_rate: float | None
    average_edit_distance_ratio: float | None


class EvaluationRunOut(BaseModel):
    id: UUID
    dataset_version: str
    model_deployment: str | None
    prompt_versions: dict[str, Any]
    provider_kind: str
    status: str
    case_count: int
    metrics: dict[str, Any] | None
    started_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}


class EvaluationCaseOut(BaseModel):
    case_key: str
    title: str
    expected: dict[str, Any]


class DemoResetResponse(BaseModel):
    status: str
    customers: int
    tickets: int
    documents: int
