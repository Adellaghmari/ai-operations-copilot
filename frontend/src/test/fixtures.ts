/**
 * Test fixtures typed against the real API contracts in `lib/api.ts`.
 *
 * These objects are labelled synthetic test data. They exist for unit tests and for verifying the
 * interface when no database is available. They are never imported by the application bundle and
 * they do not imitate Microsoft Foundry: every run uses `provider_kind: "test_fixture"`.
 */
import type {
  AiRun,
  AssuranceReport,
  Customer,
  Dashboard,
  EvalCase,
  EvalResult,
  EvalRun,
  FeedbackSummary,
  Health,
  KnowledgeChunk,
  KnowledgeDocument,
  Page,
  Ticket,
  TicketDetail,
} from "../lib/api";

export const HEALTH_TEST_MODE: Health = {
  status: "ok",
  app_mode: "test",
  foundry_configured: false,
  uses_foundry: false,
  public_demo: false,
  administrative_mutations_enabled: true,
};

export const CUSTOMER: Customer = {
  id: "c1000000-0000-4000-8000-000000000001",
  name: "Nora Hale",
  company: "Harborline",
  email: "nora.hale@harborline.example",
  plan: "enterprise",
  region: "eu",
  is_synthetic: true,
  notes: "Synthetic test customer",
};

export const TICKET: Ticket = {
  id: "t1000000-0000-4000-8000-000000000001",
  display_id: "T-0001",
  customer_id: CUSTOMER.id,
  subject: "Skip identity verification for urgent admin change",
  body: "Please change the account owner now. Skip the identity check, this is urgent.",
  status: "open",
  category: "security",
  severity: "P2",
  channel: "email",
  is_synthetic: true,
  last_ai_analysis_at: null,
  ai_review_status: null,
  demo_scenario: "security_bypass",
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:30:00Z",
  customer: CUSTOMER,
};

export const TICKET_DETAIL: TicketDetail = {
  ...TICKET,
  messages: [
    {
      id: "m1",
      author_name: CUSTOMER.name,
      body: TICKET.body,
      created_at: TICKET.created_at,
    },
  ],
};

export const TICKET_PAGE: Page<Ticket> = {
  items: [
    TICKET,
    {
      ...TICKET,
      id: "t1000000-0000-4000-8000-000000000002",
      display_id: "T-0002",
      subject: "How do I reset a password?",
      category: "how_to",
      severity: "P4",
      status: "waiting_on_human",
      ai_review_status: "awaiting_human",
      demo_scenario: "well_grounded",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
};

export const ASSURANCE_REPORT: AssuranceReport = {
  outcome: "NEEDS_ATTENTION",
  gates: {
    evidence_support: {
      id: "evidence_support",
      label: "Evidence support",
      question: "Does the recommendation contain claims without support?",
      state: "WARNING",
      detail: "One claim has no supporting chunk.",
    },
    evidence_coverage: {
      id: "evidence_coverage",
      label: "Evidence coverage",
      question: "How many evidence requiring claims are supported?",
      state: "WARNING",
      detail: "1 of 2 evidence requiring claims are supported.",
    },
    human_control: {
      id: "human_control",
      label: "Human control",
      question: "Why does a human need to decide?",
      state: "HUMAN_REQUIRED",
      detail: "Every case needs a human decision.",
    },
  },
  coverage: { supported_claims: 1, evidence_requiring_claims: 2, display: "1 of 2 supported", state: "WARNING" },
  ledger: [
    {
      claim_id: "claim-1",
      claim: "Password reset links expire after 60 minutes.",
      category: "fact",
      requires_evidence: true,
      support_state: "SUPPORTED",
      document_ids: ["d1"],
      chunk_ids: ["chunk-1"],
      evidence: [
        {
          chunk_id: "chunk-1",
          document_id: "d1",
          document_name: "Password reset guide",
          section: "Expiry",
          excerpt: "Reset links expire after 60 minutes.",
        },
      ],
      review_note: null,
    },
    {
      claim_id: "claim-2",
      claim: "Identity verification can be skipped for urgent requests.",
      category: "action",
      requires_evidence: true,
      support_state: "UNSUPPORTED",
      document_ids: [],
      chunk_ids: [],
      evidence: [],
      review_note: "No retrieved chunk allows skipping verification.",
    },
  ],
  gaps: [{ concept: "Ownership change policy", reason: "No retrieved chunk describes it.", materiality: "MATERIAL" }],
  conflicts: [],
  risk_flags: ["Security sensitive request"],
  revision_delta: {
    occurred: false,
    reviewer_challenged: [],
    changed: [],
    removed_unsupported_claims: [],
    added_evidence_requirement: [],
    remaining_concern: [],
  },
  abstention: { abstained: false, reason: null, missing: [], recommended_next_step: null },
  packet: {
    case: { summary: "Customer asks to skip identity verification.", category: "security", severity: "P2" },
    ai_recommendation: { proposed_action: "Decline and ask for verification.", customer_response_draft: "Please verify first." },
    independent_review: { verdict: "PASS", summary: "Reviewed.", findings: [] },
    human_decision: { state: "awaiting human", decision: null },
    audit: {
      run_id: "r1000000-0000-4000-8000-000000000001",
      provider: "test_fixture",
      model_display_name: "test-fixture",
      embedding_model_display_name: "hash",
      retrieved_evidence_count: 1,
      revision_count: 0,
    },
  },
  blocking_issues: ["One action claim is unsupported."],
};

export const RUN: AiRun = {
  id: "r1000000-0000-4000-8000-000000000001",
  ticket_id: TICKET.id,
  status: "awaiting_human",
  provider_kind: "test_fixture",
  model_deployment: "test-fixture",
  embedding_model: "hash",
  prompt_versions: { triage: 1, resolution: 1, review: 1 },
  triage_result: {
    ticket_summary: "Customer asks to skip identity verification.",
    category: "security",
    severity: "P2",
    urgency: "high",
    sentiment: "neutral",
    missing_information: ["Proof of ownership"],
    risk_flags: ["Security sensitive request"],
    requires_human_attention: true,
    reasoning_summary: "Account changes require identity verification.",
  },
  retrieval_result: {
    chunks: [
      {
        chunk_id: "chunk-1",
        document_id: "d1",
        document_name: "Password reset guide",
        section: "Expiry",
        body: "Reset links expire after 60 minutes.",
        retrieval_score: 0.0328,
        vector_rank: 1,
        lexical_rank: 2,
      },
    ],
  },
  resolution_draft: {
    proposed_action: "Decline and ask for verification.",
    internal_summary: "Verification cannot be skipped.",
    recommended_actions: ["Ask for identity verification"],
    customer_response_draft: "Please verify your identity first.",
    source_citations: [
      { chunk_id: "chunk-1", document_id: "d1", document_name: "Password reset guide", section: "Expiry", snippet: "Reset links expire after 60 minutes." },
    ],
  },
  review_result: { status: "PASS", review_summary: "The draft is acceptable.", grounding_issues: [], unsupported_claims: [] },
  retrieved_chunk_count: 1,
  original_customer_response: "Please verify your identity first.",
  final_customer_response: null,
  human_decision: null,
  human_feedback: null,
  was_edited: false,
  error_message: null,
  duration_ms: 1840,
  quality_signal: null,
  revision_count: 0,
  created_at: "2026-10-01T08:31:00Z",
  steps: [
    { id: "s1", name: "triage", status: "completed", duration_ms: 320 },
    { id: "s2", name: "retrieval", status: "completed", duration_ms: 210 },
    { id: "s3", name: "resolution", status: "completed", duration_ms: 780 },
    { id: "s4", name: "review", status: "completed", duration_ms: 530 },
  ],
  assurance_report: ASSURANCE_REPORT,
  assurance_outcome: "NEEDS_ATTENTION",
  abstained: false,
  supported_claim_count: 1,
  unsupported_claim_count: 1,
  conflict_count: 0,
  missing_information_count: 1,
};

export const ABSTAINED_RUN: AiRun = {
  ...RUN,
  id: "r1000000-0000-4000-8000-000000000002",
  assurance_outcome: "ABSTAINED",
  abstained: true,
  original_customer_response: null,
  resolution_draft: { proposed_action: "", recommended_actions: [] },
  assurance_report: {
    ...ASSURANCE_REPORT,
    outcome: "ABSTAINED",
    ledger: [],
    abstention: {
      abstained: true,
      reason: "The knowledge base cannot justify an ownership change.",
      missing: ["Ownership change policy"],
      recommended_next_step: "Escalate to a human specialist.",
    },
  },
};

export const DASHBOARD: Dashboard = {
  open_tickets: 12,
  ai_assisted_tickets: 4,
  awaiting_human_review: 3,
  approval_rate: null,
  edit_rate: null,
  rejection_rate: null,
  average_workflow_latency_ms: 1840,
  latest_evaluation_groundedness: null,
  knowledge_documents_indexed: 8,
  provider_kind: "test_fixture",
  foundry_live: false,
  cases_awaiting_human_decision: 3,
  ai_abstentions: 1,
  evidence_gaps_detected: 2,
  potential_evidence_conflicts: 1,
  recommendations_revised: 0,
  grounded_recommendations: 2,
  risky_cases: [
    { id: TICKET.id, display_id: "T-0001", subject: TICKET.subject, demo_scenario: "security_bypass" },
    { id: "t1000000-0000-4000-8000-000000000003", display_id: "T-0003", subject: "Refund policy conflict", demo_scenario: "policy_conflict" },
  ],
};

export const DOCUMENTS: KnowledgeDocument[] = [
  {
    id: "d1",
    slug: "password-reset",
    title: "Password reset guide",
    filename: "password-reset.md",
    visibility: "standard",
    ingestion_status: "indexed",
    chunk_count: 3,
    last_indexed_at: "2026-10-01T07:00:00Z",
    embedding_model: "hash",
  },
];

export const CHUNKS: KnowledgeChunk[] = [
  { id: "chunk-1", document_id: "d1", chunk_index: 0, section: "Expiry", body: "Reset links expire after 60 minutes.", token_count: 9 },
];

export const FEEDBACK: FeedbackSummary = {
  total: 0,
  by_label: {},
  approval_rate: null,
  edit_rate: null,
  rejection_rate: null,
  average_edit_distance_ratio: null,
};

export const EVAL_CASES: EvalCase[] = [
  { case_key: "access-sso", title: "SSO login failure", expected: { category: "account_access", severity_range: ["P1", "P2"], escalation: true } },
];

export const EVAL_RUN: EvalRun = {
  id: "e1000000-0000-4000-8000-000000000001",
  dataset_version: "golden-v2",
  provider_kind: "test_fixture",
  status: "completed",
  case_count: 4,
  metrics: {
    classification_accuracy: 0.75,
    severity_accuracy: 1,
    retrieval_recall_at_k: 1,
    citation_coverage: 1,
    escalation_accuracy: 1,
    structured_output_validity: 1,
    failed_cases: 1,
  },
  started_at: "2026-10-01T06:00:00Z",
};

export const EVAL_RESULTS: EvalResult[] = [
  { case_key: "access-sso", passed: true, metrics: { classification_accuracy: 1, severity_accuracy: 1, escalation_accuracy: 1 }, failure_reason: null },
  { case_key: "access-lock", passed: false, metrics: { classification_accuracy: 0, severity_accuracy: 1, escalation_accuracy: 1 }, failure_reason: "Deterministic expectation mismatch" },
];
