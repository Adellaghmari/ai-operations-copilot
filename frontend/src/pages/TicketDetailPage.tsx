import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { describeError } from "../lib/errors";
import {
  describeProvider,
  gateTone,
  hasDraft as runHasDraft,
  humanDecisionLabel,
  ticketStatusTone,
} from "../lib/presentation";
import { formatModelLabel, formatOutcome, humanize } from "../lib/utils";
import { Badge, Button, Card, DegradedNotice, ErrorState, LoadingState } from "../components/ui";
import { AssuranceSection } from "./ticket/AssuranceSection";
import { DecisionPacketDialog } from "./ticket/DecisionPacketDialog";
import { DecisionSection } from "./ticket/DecisionSection";
import type { DecisionSubmission } from "./ticket/DecisionSection";
import { EvidenceSection } from "./ticket/EvidenceSection";
import {
  CaseCard,
  DecisionTrail,
  OutcomeBanner,
  RunProviderNotice,
  TriageCard,
} from "./ticket/OverviewSection";
import { RecommendationSection } from "./ticket/RecommendationSection";
import { ReplaySection } from "./ticket/ReplaySection";
import { ReviewSection } from "./ticket/ReviewSection";
import { SectionNav, TICKET_SECTIONS, TicketSection } from "./ticket/SectionNav";

const FAILURE_STATUSES = new Set(["failed", "foundry_unavailable", "quota_exceeded"]);

export function TicketDetailPage() {
  const { ticketId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showPacket, setShowPacket] = useState(false);
  const [lastDecision, setLastDecision] = useState<string | null>(null);
  const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);

  const ticket = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => api.ticket(ticketId!),
    enabled: Boolean(ticketId),
  });
  const runs = useQuery({
    queryKey: ["ticket-runs", ticketId],
    queryFn: () => api.aiRuns(ticketId),
    enabled: Boolean(ticketId),
  });
  const latestRunId = runs.data?.items[0]?.id;
  const runQuery = useQuery({
    queryKey: ["run", latestRunId],
    queryFn: () => api.aiRun(latestRunId!),
    enabled: Boolean(latestRunId),
  });

  const analyze = useMutation({
    mutationFn: () => api.runAi(ticketId!),
    onSuccess: async () => {
      setLastDecision(null);
      await queryClient.invalidateQueries();
    },
  });
  const review = useMutation({
    mutationFn: (submission: DecisionSubmission) => {
      const runId = latestRunId ?? analyze.data?.id;
      if (!runId) throw new Error("There is no AI run to review.");
      return api.review(ticketId!, runId, {
        decision: submission.decision,
        edited_response: submission.editedResponse,
        feedback: submission.feedback || undefined,
        label: submission.label || undefined,
      });
    },
    onSuccess: async (_run, submission) => {
      setLastDecision(
        submission.decision === "regenerate"
          ? "Regeneration was recorded and a new AI run was created."
          : `Decision recorded: ${humanDecisionLabel(submission.decision)}. Nothing was sent to the customer.`,
      );
      await queryClient.invalidateQueries();
    },
  });

  if (ticket.isPending) {
    return <LoadingState label="Loading ticket" rows={4} />;
  }
  if (ticket.isError && !ticket.data) {
    return (
      <div className="space-y-3">
        <ErrorState
          title="This ticket could not be loaded"
          error={ticket.error}
          onRetry={() => void ticket.refetch()}
          retrying={ticket.isFetching}
        />
        <Link className="text-sm underline" to="/tickets">
          Back to the ticket queue
        </Link>
      </div>
    );
  }
  const data = ticket.data!;

  // The newest persisted run. A fresh analysis result bridges the gap until the refetch lands.
  const bridged = [analyze.data, review.data].find((candidate) => candidate && candidate.id === latestRunId);
  const current = runQuery.data ?? bridged;
  const runStillLoading = Boolean(latestRunId) && runQuery.isPending && !current;
  const report = current?.assurance_report ?? undefined;
  const abstained = Boolean(current?.abstained || report?.abstention?.abstained);
  const draftAvailable = runHasDraft(current);
  const provider = current ? describeProvider(current.provider_kind) : null;
  const runList = runs.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm text-muted">
          <Link className="underline" to="/tickets">
            Ticket queue
          </Link>{" "}
          / {data.display_id}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{data.subject}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={ticketStatusTone(data.status)} title="Ticket status">
                Ticket {humanize(data.status).toLowerCase()}
              </Badge>
              {data.severity ? <Badge tone="warn">Severity {data.severity}</Badge> : null}
              {data.category ? <Badge>{humanize(data.category)}</Badge> : null}
              {current?.assurance_outcome ? (
                <Badge tone={gateTone(current.assurance_outcome)} title="Assurance outcome">
                  {formatOutcome(current.assurance_outcome)}
                </Badge>
              ) : (
                <Badge tone="neutral">No analysis yet</Badge>
              )}
              {provider ? (
                <Badge tone={provider.tone} title={provider.description}>
                  {provider.label}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {report ? (
              <Button variant="secondary" data-testid="view-decision-packet" onClick={() => setShowPacket(true)}>
                View Decision Packet
              </Button>
            ) : null}
            <Button data-testid="run-ai-analysis" onClick={() => analyze.mutate()} disabled={analyze.isPending}>
              {analyze.isPending ? "Running workflow" : current ? "Run AI analysis again" : "Run AI analysis"}
            </Button>
          </div>
        </div>
      </header>

      {justCreated ? (
        <p role="status" className="rounded-md bg-lime/10 p-3 text-sm text-lime">
          Ticket {data.display_id} was created. Run an AI analysis when you are ready. Nothing is sent to the
          customer.
        </p>
      ) : null}
      {ticket.isError ? (
        <DegradedNotice onRetry={() => void ticket.refetch()} retrying={ticket.isFetching}>
          Showing the last loaded ticket. Refreshing it failed.
        </DegradedNotice>
      ) : null}
      {analyze.isPending ? (
        <div role="status" className="rounded-lg border border-line-strong bg-surface p-4 text-sm text-ink">
          <p className="font-medium">Running the workflow</p>
          <p className="mt-1 text-muted">
            Triage, hybrid retrieval, Resolution, Review, and the assurance gates run in sequence. A live model can
            take a while. The page updates when the run is stored.
          </p>
        </div>
      ) : null}
      {analyze.isError ? (
        <ErrorState
          title="The analysis did not run"
          message={describeError(analyze.error).summary}
          onRetry={() => analyze.mutate()}
        />
      ) : null}
      {current ? <RunProviderNotice run={current} /> : null}
      {current && FAILURE_STATUSES.has(current.status) ? (
        <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="font-semibold">This run did not complete: {humanize(current.status)}</p>
          {current.status === "foundry_unavailable" ? (
            <p className="mt-1">
              Microsoft Foundry is not available in this environment. Real model output needs APP_MODE=foundry and the
              project endpoints.
            </p>
          ) : null}
          {current.error_message ? <p className="mt-1">{current.error_message}</p> : null}
        </div>
      ) : null}

      <SectionNav sections={TICKET_SECTIONS} />

      <TicketSection id="overview" title="Overview" description="Where this case stands, from the stored run.">
        {runs.isError || (runQuery.isError && !current) ? (
          <ErrorState
            compact
            title="The latest AI run could not be loaded"
            error={runs.isError ? runs.error : runQuery.error}
            onRetry={() => {
              void runs.refetch();
              void runQuery.refetch();
            }}
            retrying={runs.isFetching || runQuery.isFetching}
          />
        ) : runStillLoading || runs.isPending ? (
          <LoadingState label="Loading the latest AI run" rows={2} />
        ) : (
          <>
            {current && report ? (
              <OutcomeBanner report={report} run={current} />
            ) : (
              <Card>
                <p className="text-sm text-ink-soft">
                  No AI analysis exists for this ticket yet. The workflow will triage the case, retrieve knowledge,
                  draft a recommendation, challenge it, and check the evidence. A human then decides.
                </p>
              </Card>
            )}
            <DecisionTrail run={current} />
          </>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <CaseCard ticket={data} />
          <TriageCard run={current} />
        </div>
      </TicketSection>

      <TicketSection
        id="evidence"
        title="Evidence"
        description="What was retrieved, which claims it supports, and where the knowledge falls short."
      >
        <EvidenceSection run={current} report={report} />
      </TicketSection>

      <TicketSection
        id="recommendation"
        title="AI recommendation"
        description="A proposal for a human to review. It is never sent automatically."
      >
        <RecommendationSection run={current} abstained={abstained} />
      </TicketSection>

      <TicketSection
        id="review"
        title="Review"
        description="The independent challenge, and the single allowed revision."
      >
        <ReviewSection run={current} report={report} />
      </TicketSection>

      <TicketSection
        id="assurance"
        title="Assurance"
        description="Deterministic gates over evidence, conflicts, and actions. Each shows its reason."
      >
        <AssuranceSection run={current} report={report} />
      </TicketSection>

      <TicketSection id="decision" title="Decision" description="The human decision. Only a person can approve or act.">
        <DecisionSection
          key={current?.id ?? "no-run"}
          run={current}
          hasDraft={draftAvailable}
          abstained={abstained}
          pending={review.isPending}
          error={review.isError ? review.error : null}
          lastDecision={lastDecision}
          onSubmit={(submission) => review.mutate(submission)}
        />
      </TicketSection>

      <TicketSection id="replay" title="Replay" description="See what changed between two runs of this ticket.">
        {runs.isError ? (
          <ErrorState compact title="Runs could not be loaded for replay" error={runs.error} />
        ) : (
          <ReplaySection runs={runList} />
        )}
      </TicketSection>

      {current ? (
        <p className="text-xs text-muted">
          Model {formatModelLabel(current.model_deployment)}. Embeddings {formatModelLabel(current.embedding_model)}.
          Prompt versions {Object.entries(current.prompt_versions)
            .map(([name, version]) => `${name} v${version}`)
            .join(", ") || "not recorded"}
          .{" "}
          <Link className="underline" data-testid="open-ai-run" to={`/ai-runs/${current.id}`}>
            Open AI run
          </Link>
        </p>
      ) : null}

      <DecisionPacketDialog open={showPacket} onClose={() => setShowPacket(false)} report={report} />
    </div>
  );
}
