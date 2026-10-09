from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String(80), nullable=False)
    region: Mapped[str] = mapped_column(String(80), nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="customer")


class Ticket(Base, TimestampMixin):
    __tablename__ = "tickets"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    display_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="open")
    category: Mapped[str | None] = mapped_column(String(40))
    severity: Mapped[str | None] = mapped_column(String(8))
    channel: Mapped[str] = mapped_column(String(40), default="email", nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_ai_analysis_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_review_status: Mapped[str | None] = mapped_column(String(40))
    demo_scenario: Mapped[str | None] = mapped_column(String(80))

    customer: Mapped[Customer] = relationship(back_populates="tickets")
    messages: Mapped[list["TicketMessage"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )
    ai_runs: Mapped[list["AiRun"]] = relationship(back_populates="ticket")

    __table_args__ = (
        Index("ix_tickets_status", "status"),
        Index("ix_tickets_category", "category"),
        Index("ix_tickets_severity", "severity"),
        Index("ix_tickets_ai_review_status", "ai_review_status"),
        Index("ix_tickets_demo_scenario", "demo_scenario"),
    )


class TicketMessage(Base, TimestampMixin):
    __tablename__ = "ticket_messages"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    ticket_id: Mapped[UUID] = mapped_column(ForeignKey("tickets.id"), nullable=False)
    author_type: Mapped[str] = mapped_column(String(40), nullable=False)
    author_name: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="messages")


class KnowledgeDocument(Base, TimestampMixin):
    __tablename__ = "knowledge_documents"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    filename: Mapped[str] = mapped_column(String(260), nullable=False)
    media_type: Mapped[str] = mapped_column(String(80), nullable=False)
    visibility: Mapped[str] = mapped_column(String(40), default="standard", nullable=False)
    ingestion_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    embedding_model: Mapped[str | None] = mapped_column(String(120))
    embedding_dimensions: Mapped[int | None] = mapped_column(Integer)

    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class KnowledgeChunk(Base, TimestampMixin):
    __tablename__ = "knowledge_chunks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("knowledge_documents.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    embedding_model: Mapped[str | None] = mapped_column(String(120))
    embedding_dimensions: Mapped[int | None] = mapped_column(Integer)
    lexical: Mapped[Any | None] = mapped_column(TSVECTOR)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")

    __table_args__ = (Index("ix_knowledge_chunks_document_id", "document_id"),)


class PromptVersion(Base, TimestampMixin):
    __tablename__ = "prompt_versions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    changelog: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("name", "version", name="uq_prompt_name_version"),)


class AiRun(Base, TimestampMixin):
    __tablename__ = "ai_runs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    ticket_id: Mapped[UUID] = mapped_column(ForeignKey("tickets.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    model_deployment: Mapped[str | None] = mapped_column(String(120))
    embedding_model: Mapped[str | None] = mapped_column(String(120))
    agent_versions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    prompt_versions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    triage_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    retrieval_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    resolution_draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    review_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    original_customer_response: Mapped[str | None] = mapped_column(Text)
    final_customer_response: Mapped[str | None] = mapped_column(Text)
    human_decision: Mapped[str | None] = mapped_column(String(40))
    human_feedback: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retrieved_chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quality_signal: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    token_usage: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    was_edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    original_resolution_draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    assurance_report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    assurance_outcome: Mapped[str | None] = mapped_column(String(60))
    abstained: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supported_claim_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unsupported_claim_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conflict_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    missing_information_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="ai_runs")
    steps: Mapped[list["AiRunStep"]] = relationship(
        back_populates="ai_run", cascade="all, delete-orphan"
    )
    feedback: Mapped[list["AiFeedback"]] = relationship(back_populates="ai_run")

    __table_args__ = (
        Index("ix_ai_runs_ticket_id", "ticket_id"),
        Index("ix_ai_runs_assurance_outcome", "assurance_outcome"),
        Index("ix_ai_runs_abstained", "abstained"),
    )


class AiRunStep(Base, TimestampMixin):
    __tablename__ = "ai_run_steps"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    ai_run_id: Mapped[UUID] = mapped_column(ForeignKey("ai_runs.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    ai_run: Mapped[AiRun] = relationship(back_populates="steps")


class AiFeedback(Base, TimestampMixin):
    __tablename__ = "ai_feedback"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    ai_run_id: Mapped[UUID] = mapped_column(ForeignKey("ai_runs.id"), nullable=False)
    ticket_id: Mapped[UUID] = mapped_column(ForeignKey("tickets.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    human_decision: Mapped[str] = mapped_column(String(40), nullable=False)
    edit_distance_ratio: Mapped[float | None] = mapped_column(Float)

    ai_run: Mapped[AiRun] = relationship(back_populates="feedback")


class EvaluationCase(Base, TimestampMixin):
    __tablename__ = "evaluation_cases"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    case_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    ticket_body: Mapped[str] = mapped_column(Text, nullable=False)
    expected: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class EvaluationRun(Base, TimestampMixin):
    __tablename__ = "evaluation_runs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dataset_version: Mapped[str] = mapped_column(String(40), nullable=False)
    model_deployment: Mapped[str | None] = mapped_column(String(120))
    prompt_versions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    provider_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    case_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_evaluation_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    results: Mapped[list["EvaluationResult"]] = relationship(
        back_populates="evaluation_run", cascade="all, delete-orphan"
    )


class EvaluationResult(Base, TimestampMixin):
    __tablename__ = "evaluation_results"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    evaluation_run_id: Mapped[UUID] = mapped_column(
        ForeignKey("evaluation_runs.id"), nullable=False
    )
    case_key: Mapped[str] = mapped_column(String(80), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    failure_reason: Mapped[str | None] = mapped_column(Text)

    evaluation_run: Mapped[EvaluationRun] = relationship(back_populates="results")


class AuditEvent(Base, TimestampMixin):
    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    actor: Mapped[str] = mapped_column(String(80), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class DemoUsage(Base, TimestampMixin):
    __tablename__ = "demo_usage"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    guest_key: Mapped[str] = mapped_column(String(80), nullable=False)
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    ai_run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (UniqueConstraint("guest_key", "usage_date", name="uq_demo_guest_date"),)
