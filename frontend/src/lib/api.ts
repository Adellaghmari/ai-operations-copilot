const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
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
  aiRuns: () => request<Page<AiRun>>("/api/ai-runs"),
  aiRun: (id: string) => request<AiRun>(`/api/ai-runs/${id}`),
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
  last_ai_analysis_at: string | null;
  ai_review_status: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer | null;
};

export type TicketDetail = Ticket & {
  messages: { id: string; author_name: string; body: string; created_at: string }[];
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export type AiRun = {
  id: string;
  ticket_id: string;
  status: string;
  provider_kind: string;
  model_deployment: string | null;
  prompt_versions: Record<string, number>;
  triage_result: Record<string, unknown> | null;
  retrieval_result: { chunks?: RetrievedChunk[] } | null;
  resolution_draft: Record<string, unknown> | null;
  review_result: Record<string, unknown> | null;
  original_customer_response: string | null;
  final_customer_response: string | null;
  human_decision: string | null;
  error_message: string | null;
  duration_ms: number | null;
  quality_signal: { score?: number; label?: string } | null;
  revision_count: number;
  created_at: string;
  steps?: { id: string; name: string; status: string; duration_ms: number | null }[];
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
