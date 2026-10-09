# AI System Design

## Agents

The product uses three specialized agents. More agents would add ceremony without improving the business flow.

### Triage Agent

Analyzes the ticket and returns a validated `TriageResult`:

- `ticket_summary`
- `category`
- `severity` (`P1`–`P4` using documented rules)
- `urgency`
- `sentiment`
- `technical_entities`
- `missing_information`
- `risk_flags`
- `retrieval_query`
- `requires_human_attention`
- `reasoning_summary` (concise, user-appropriate; not hidden chain of thought)

### Retrieval Executor

Not an LLM. Deterministic application logic:

1. Embed the triage retrieval query
2. Vector search in pgvector
3. Lexical full-text search
4. Reciprocal Rank Fusion
5. Apply `top_k` and relevance threshold
6. Return chunks with source metadata

### Resolution Agent

Uses ticket context, triage, and retrieved sources from the hybrid retrieval executor. Returns a validated `ResolutionDraft`:

- internal summary and recommended actions
- customer response draft
- source citations
- escalation decision and unanswered questions
- limitations
- quality-signal components

The agent is instructed never to invent missing facts.

### Review Agent

Compares the draft with retrieved sources. Returns a validated `ReviewResult` with `PASS` or `REVISE`.

If `REVISE`, the service allows **one** Resolution revision that includes reviewer feedback. A second failure forces human escalation. `ESCALATE` is a valid Review verdict for security-sensitive bypass requests.

## Decision Assurance Engine

`DecisionAssuranceEngine` is application-owned deterministic logic. It is not a fourth LLM agent.

It aggregates validated retrieval provenance, Resolution claims, and Review assessments, then computes:

- Evidence Ledger support states
- Assurance Gates
- coverage counts such as `5 of 6 claims supported` (not model confidence)
- potential conflicts only when both chunk IDs exist in the retrieval set
- abstention
- Decision Assurance Packet
- revision delta

The model may identify semantic issues. The application owns validation, gating, persistence, and the final machine state.

Passing gates does not guarantee correctness. Human review remains mandatory.

## Orchestration

Live API orchestration is `SupportWorkflowRunner`, which calls Agent Framework chat agents for Triage, Resolution, and Review and inserts a deterministic retrieval step between Triage and Resolution:

`Triage → Hybrid Retrieval Executor → Resolution → Review → Decision Assurance Engine → Human`

A `SequentialBuilder` helper remains in the repository for framework import verification. It is not the production request path. The one-revision bound lives in the application service, not in an unbounded graph loop. Each stage is persisted so the UI can show a timeline.

## Structured output

Agents use schema-based structured output (`response_format` with Pydantic models). Server-side validation is mandatory. The provider does not retry malformed structured output. Validation failure is recorded as an explicit failed run rather than being written as successful application state.

## Tool calling

Typed, read-only helper functions exist in `app/ai/tools.py`:

- `search_knowledge`
- `get_ticket_history`
- `get_customer_context`
- `get_similar_resolved_tickets`

They accept bounded inputs, return bounded results, and can be logged. They are **not** wired into Foundry LLM tool calling on the application request path. Retrieval runs through the hybrid retrieval executor (vector + lexical + RRF), not agent tool use. Do not claim model tool calling.

## RAG and embeddings

See [RAG.md](RAG.md). Embeddings store model and dimension metadata. Changing the embedding model requires a reindex.

## Human review

The AI never sends a customer-facing message. Reviewer actions:

- Approve
- Edit and approve
- Reject
- Request regeneration with feedback
- Escalate

Original and edited drafts are both stored.

## Quality signal

The backend computes and stores a component based **AI quality signal** from retrieval coverage, mean retrieval score, citation coverage, review outcome, and missing-information flags. The current interface does not display its numeric score. It is not a probability of correctness. See [EVALUATION.md](EVALUATION.md).

## Failure behavior

Timeouts, validation failures, empty retrieval, unavailable Foundry, exhausted demo quota, and double review failure all surface as explicit product states. The system does not fabricate a successful answer.

## Observability

The application uses OpenTelemetry. In production, spans export to Application Insights via `AzureMonitorTraceExporter` and `APPLICATIONINSIGHTS_CONNECTION_STRING`. Agent Framework `configure_otel_providers(enable_sensitive_data=False)` remains in place. Safe attributes include run ID, agent name, provider kind, model deployment, embedding model, retrieval counts, revision count, assurance outcome, claim counts, conflict counts, abstention boolean, and human-review state. Ticket text, prompts, retrieved chunk bodies, and credentials are not exported.
