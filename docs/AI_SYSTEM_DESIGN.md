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

Uses ticket context, triage, retrieved sources, and bounded tools. Returns a validated `ResolutionDraft`:

- internal summary and recommended actions
- customer response draft
- source citations
- escalation decision and unanswered questions
- limitations
- quality-signal components

The agent is instructed never to invent missing facts.

### Review Agent

Compares the draft with retrieved sources. Returns a validated `ReviewResult` with `PASS` or `REVISE`.

If `REVISE`, the service allows **one** Resolution revision that includes reviewer feedback. A second failure forces human escalation.

## Orchestration

Microsoft Agent Framework `SequentialBuilder`:

`Triage → Retrieval Executor → Resolution → Review`

The one-revision bound lives in the application service, not in an unbounded graph loop. Each stage is persisted so the UI can show a timeline.

## Structured output

Agents use schema-based structured output (`response_format` with Pydantic models). Server-side validation is mandatory. Invalid output is retried with a bounded policy and never written as application state.

## Tool calling

Read-only tools with typed inputs, bounded results, and logging:

- `search_knowledge`
- `get_ticket_history`
- `get_customer_context`
- `get_similar_resolved_tickets`

No tool mutates tickets, customers, or knowledge autonomously.

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

Displayed as **AI quality signal**, never as a probability of correctness. Calculated from retrieval coverage, mean retrieval score, citation coverage, review outcome, and missing-information flags. See [EVALUATION.md](EVALUATION.md).

## Failure behavior

Timeouts, validation failures, empty retrieval, unavailable Foundry, exhausted demo quota, and double review failure all surface as explicit product states. The system does not fabricate a successful answer.
