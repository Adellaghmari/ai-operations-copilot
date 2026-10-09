const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function publicErrorMessage(status: number, detail: string): string {
  const lower = detail.toLowerCase();
  if (
    lower.includes("traceback") ||
    lower.includes("password") ||
    lower.includes("database_url") ||
    lower.includes("bearer ") ||
    lower.includes("api key") ||
    lower.includes("client_secret")
  ) {
    return `Request failed (${status}). The service reported an error without exposing internal details.`;
  }
  try {
    const parsed = JSON.parse(detail) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    // FastAPI validation errors arrive as a list of field problems. Keep the copy calm and readable.
    if (Array.isArray(parsed.detail)) return "The request was rejected because a value was not valid.";
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    /* raw body is fine when short and non-sensitive */
  }
  if (detail.length > 400) return `Request failed (${status}).`;
  return detail || `Request failed: ${status}`;
}

/**
 * Error raised by the API client. `status` is 0 when the API could not be reached at all,
 * which must never be presented as an empty dataset.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly technicalDetail: string | null;

  constructor(status: number, message: string, technicalDetail: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.technicalDetail = technicalDetail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError(
      0,
      "The API could not be reached.",
      error instanceof Error ? error.message : null,
    );
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(response.status, publicErrorMessage(response.status, detail), `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export type TicketFilters = {
  q?: string;
  status?: string;
  category?: string;
  severity?: string;
  demo_scenario?: string;
  page?: number;
  page_size?: number;
};

export function ticketParams(filters: TicketFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params;
}

export const api = {
  health: () => request<Health>("/api/health"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  tickets: (params: URLSearchParams) => request<Page<Ticket>>(`/api/tickets?${params}`),
  ticket: (id: string) => request<TicketDetail>(`/api/tickets/${id}`),
  createTicket: (payload: { subject: string; body: string; customer_id?: string }) =>
    request<TicketDetail>("/api/tickets", { method: "POST", body: JSON.stringify(payload) }),
  runAi: (id: string, feedback?: string) =>
    request<AiRun>(
      `/api/tickets/${id}/ai-runs${feedback ? `?feedback=${encodeURIComponent(feedback)}` : ""}`,
      { method: "POST" },
    ),
  review: (ticketId: string, runId: string, payload: ReviewPayload) =>
    request<AiRun>(`/api/tickets/${ticketId}/ai-runs/${runId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  customers: () => request<Customer[]>("/api/customers"),
  knowledge: () => request<KnowledgeDocument[]>("/api/knowledge"),
  chunks: (id: string) => request<KnowledgeChunk[]>(`/api/knowledge/${id}/chunks`),
  knowledgeSearch: (q: string) => request<RetrievedChunk[]>(`/api/knowledge/search?q=${encodeURIComponent(q)}`),
  deleteDocument: (id: string) => request<{ status: string }>(`/api/knowledge/${id}`, { method: "DELETE" }),
  uploadDocument: (file: File) => {
    const data = new FormData();
    data.append("file", file);
    data.append("title", file.name);
    return request<KnowledgeDocument>("/api/knowledge/upload", { method: "POST", body: data });
  },
  aiRuns: (ticketId?: string, paging?: { page?: number; page_size?: number }) => {
    const params = new URLSearchParams();
    if (ticketId) params.set("ticket_id", ticketId);
    if (paging?.page) params.set("page", String(paging.page));
    if (paging?.page_size) params.set("page_size", String(paging.page_size));
    const query = params.toString();
    return request<Page<AiRun>>(`/api/ai-runs${query ? `?${query}` : ""}`);
  },
  aiRun: (id: string) => request<AiRun>(`/api/ai-runs/${id}`),
  compareRuns: (runA: string, runB: string) =>
    request<RunComparison>(`/api/ai-runs/${runA}/compare/${runB}`),
  feedback: () => request<FeedbackSummary>("/api/feedback"),
  evalCases: () => request<EvalCase[]>("/api/evaluations/cases"),
  evalRuns: () => request<EvalRun[]>("/api/evaluations"),
  evalResults: (id: string) => request<EvalResult[]>(`/api/evaluations/${id}/results`),
  runEval: () => request<EvalRun>("/api/evaluations/run", { method: "POST" }),
  resetDemo: () => request<{ status: string }>("/api/demo/reset", { method: "POST" }),
};

export type Health = {
  status: string;
  app_mode: string;
  foundry_configured: boolean;
  uses_foundry: boolean;
  public_demo?: boolean;
  administrative_mutations_enabled?: boolean;
};

export type Dashboard = {
  open_tickets: number;
  ai_assisted_tickets: number;
  awaiting_human_review: number;
  approval_rate: number | null;
  edit_rate: number | null;
  rejection_rate: number | null;
  average_workflow_latency_ms: number | null;
  latest_evaluation_groundedness: number | null;
  knowledge_documents_indexed: number;
  provider_kind: string;
  foundry_live: boolean;
  cases_awaiting_human_decision?: number;
  ai_abstentions?: number;
  evidence_gaps_detected?: number;
  potential_evidence_conflicts?: number;
  recommendations_revised?: number;
  grounded_recommendations?: number;
  risky_cases?: DemoCase[];
};

export type DemoCase = {
  id: string;
  display_id: string;
  subject: string;
  demo_scenario: string;
};

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  plan: string;
  region: string;
  is_synthetic: boolean;
  notes: string;
};

export type Ticket = {
  id: string;
  display_id: string;
  customer_id: string;
  subject: string;
  body: string;
  status: string;
  category: string | null;
  severity: string | null;
  channel?: string;
  is_synthetic?: boolean;
  last_ai_analysis_at: string | null;
  ai_review_status: string | null;
  demo_scenario?: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer | null;
};

export type TicketDetail = Ticket & {
  messages: { id: string; author_name: string; body: string; created_at: string }[];
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export type TriageResult = {
  ticket_summary?: string;
  category?: string;
  severity?: string;
  urgency?: string;
  sentiment?: string;
  technical_entities?: string[];
  missing_information?: string[];
  risk_flags?: string[];
  requires_human_attention?: boolean;
  reasoning_summary?: string;
  retrieval_query?: string;
  [key: string]: unknown;
};

export type ResolutionDraftView = {
  internal_summary?: string;
  recommended_actions?: string[];
  customer_response_draft?: string;
  source_citations?: SourceCitation[];
  escalation_required?: boolean;
  escalation_reason?: string | null;
  unanswered_questions?: string[];
  limitations?: string[];
  proposed_action?: string;
  [key: string]: unknown;
};

export type ReviewResultView = {
  status?: string;
  review_summary?: string;
  grounding_issues?: string[];
  unsupported_claims?: string[];
  missing_items?: string[];
  tone_issues?: string[];
  safety_flags?: string[];
  citation_issues?: string[];
  recommended_changes?: string[];
  [key: string]: unknown;
};

export type AiRun = {
  id: string;
  ticket_id: string;
  status: string;
  provider_kind: string;
  model_deployment: string | null;
  embedding_model?: string | null;
  prompt_versions: Record<string, number>;
  triage_result: TriageResult | null;
  retrieval_result: { chunks?: RetrievedChunk[] } | null;
  resolution_draft: ResolutionDraftView | null;
  review_result: ReviewResultView | null;
  retrieved_chunk_count?: number;
  original_customer_response: string | null;
  final_customer_response: string | null;
  human_decision: string | null;
  human_feedback: string | null;
  was_edited: boolean;
  error_message: string | null;
  duration_ms: number | null;
  quality_signal: { score?: number; label?: string } | null;
  revision_count: number;
  created_at: string;
  steps?: AiRunStep[];
  approved_at?: string | null;
  agent_versions?: Record<string, unknown>;
  original_resolution_draft?: ResolutionDraftView | null;
  assurance_report?: AssuranceReport | null;
  assurance_outcome?: string | null;
  abstained?: boolean;
  supported_claim_count?: number;
  unsupported_claim_count?: number;
  conflict_count?: number;
  missing_information_count?: number;
};

export type AiRunStep = {
  id: string;
  name: string;
  status: string;
  duration_ms: number | null;
  started_at?: string;
  ended_at?: string | null;
};

export type AssuranceGate = {
  id: string;
  label: string;
  question: string;
  state: string;
  detail: string;
};

export type EvidenceMapping = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  section: string;
  excerpt: string;
};

export type EvidenceLedgerEntry = {
  claim_id: string;
  claim: string;
  category: string;
  requires_evidence: boolean;
  support_state: string;
  document_ids: string[];
  chunk_ids: string[];
  evidence: EvidenceMapping[];
  review_note?: string | null;
};

export type ValidatedConflict = {
  label: string;
  chunk_a: string;
  chunk_b: string;
  document_a: string;
  document_b: string;
  section_a: string;
  section_b: string;
  excerpt_a: string;
  excerpt_b: string;
  summary: string;
  why_conflicts: string;
  materiality: string;
  impact: string;
};

export type EvidenceGap = {
  concept: string;
  reason: string;
  materiality: string;
};

export type AssuranceReport = {
  outcome: string;
  gates: Record<string, AssuranceGate>;
  coverage: { supported_claims: number; evidence_requiring_claims: number; display: string; state: string };
  ledger: EvidenceLedgerEntry[];
  gaps: EvidenceGap[];
  conflicts: ValidatedConflict[];
  risk_flags: string[];
  revision_delta: {
    occurred: boolean;
    reviewer_challenged: string[];
    changed: string[];
    removed_unsupported_claims: string[];
    added_evidence_requirement: string[];
    remaining_concern: string[];
    original_action?: string | null;
    revised_action?: string | null;
  };
  abstention: {
    abstained: boolean;
    reason?: string | null;
    missing: string[];
    recommended_next_step?: string | null;
  };
  packet: Record<string, unknown>;
  blocking_issues: string[];
};

export type RunComparison = {
  identical: boolean;
  run_a_id: string;
  run_b_id: string;
  summary: string;
  triage: ComparisonChange;
  recommendation: ComparisonChange;
  assurance: ComparisonChange;
  review: ComparisonChange;
  human_decision: ComparisonChange;
  prompt_version: ComparisonChange;
  evidence_added: string[];
  evidence_removed: string[];
  claim_support_changes: string[];
  conflicts_introduced: string[];
  conflicts_resolved: string[];
  missing_information_changes: string[];
  revision_occurrence: ComparisonChange;
  gate_changes: ComparisonChange[];
  why: string[];
};

export type ComparisonChange = {
  field: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

export type ReviewPayload = {
  decision: string;
  edited_response?: string;
  feedback?: string;
  label?: string;
};

export type KnowledgeDocument = {
  id: string;
  slug: string;
  title: string;
  filename: string;
  visibility: string;
  ingestion_status: string;
  chunk_count: number;
  last_indexed_at: string | null;
  embedding_model: string | null;
};

export type KnowledgeChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  section: string;
  body: string;
  token_count: number;
};

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  section: string;
  body: string;
  retrieval_score: number;
  vector_rank?: number | null;
  lexical_rank?: number | null;
};

export type SourceCitation = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  section: string;
  snippet: string;
};

export type FeedbackSummary = {
  total: number;
  by_label: Record<string, number>;
  approval_rate: number | null;
  edit_rate: number | null;
  rejection_rate: number | null;
  average_edit_distance_ratio: number | null;
};

export type EvalCase = { case_key: string; title: string; expected: Record<string, unknown> };
export type EvalRun = {
  id: string;
  dataset_version: string;
  model_deployment?: string | null;
  prompt_versions?: Record<string, unknown>;
  provider_kind: string;
  status: string;
  case_count: number;
  metrics: Record<string, number> | null;
  started_at: string;
};
export type EvalResult = {
  case_key: string;
  passed: boolean;
  metrics: Record<string, number>;
  failure_reason: string | null;
};
