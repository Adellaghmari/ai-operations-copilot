import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, type RetrievedChunk } from "../lib/api";
import { formatDate } from "../lib/utils";
import { Badge, Button, Card, ErrorState, Field, Skeleton, Textarea } from "../components/ui";

export function TicketDetailPage() {
  const { ticketId } = useParams();
  const queryClient = useQueryClient();
  const ticket = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => api.ticket(ticketId!),
    enabled: Boolean(ticketId),
  });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: api.aiRuns,
  });
  const runId = useMemo(
    () => runs.data?.items.find((item) => item.ticket_id === ticketId)?.id,
    [runs.data, ticketId],
  );
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.aiRun(runId!),
    enabled: Boolean(runId),
  });
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [label, setLabel] = useState("fully_useful");
  const [selectedChunk, setSelectedChunk] = useState<RetrievedChunk | null>(null);

  const analyze = useMutation({
    mutationFn: () => api.runAi(ticketId!, feedback || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  const review = useMutation({
    mutationFn: (decision: string) =>
      api.review(ticketId!, run.data!.id, {
        decision,
        edited_response: draft || run.data?.original_customer_response || undefined,
        feedback,
        label,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  if (ticket.isError) return <ErrorState message={(ticket.error as Error).message} />;
  if (!ticket.data) return <Skeleton className="h-80" />;

  const current = run.data;
  const chunks = (current?.retrieval_result?.chunks ?? []) as RetrievedChunk[];
  const reviewResult = current?.review_result as Record<string, unknown> | null;
  const triage = current?.triage_result as Record<string, unknown> | null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{ticket.data.display_id}</p>
          <h1 className="text-2xl font-semibold">{ticket.data.subject}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{ticket.data.status}</Badge>
            {ticket.data.severity ? <Badge tone="warn">{ticket.data.severity}</Badge> : null}
            {ticket.data.category ? <Badge>{ticket.data.category}</Badge> : null}
          </div>
        </div>
        <Button onClick={() => analyze.mutate()} disabled={analyze.isPending}>
          {analyze.isPending ? "Running workflow…" : "Run AI analysis"}
        </Button>
      </div>
      {analyze.isError ? <ErrorState message={(analyze.error as Error).message} /> : null}
      {current?.provider_kind === "test_fixture" ? (
        <Card className="border-amber-200 bg-amber-50">
          This run used the test fixture provider. It is not a Microsoft Foundry response.
        </Card>
      ) : null}
      {current?.status === "foundry_unavailable" ? (
        <Card className="border-amber-200 bg-amber-50">
          Microsoft Foundry is unavailable. Configure APP_MODE=foundry and the project endpoints.
          {current.error_message ? <p className="mt-2 text-sm">{current.error_message}</p> : null}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="font-semibold">Customer context</h2>
          <p className="mt-2 text-sm text-stone-600">
            {ticket.data.customer?.company} · {ticket.data.customer?.name} · {ticket.data.customer?.plan}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.data.body}</p>
          <h3 className="mt-5 text-sm font-semibold">Conversation</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {ticket.data.messages.map((message) => (
              <li key={message.id} className="rounded-md bg-stone-50 p-3">
                <p className="text-xs text-stone-500">{message.author_name} · {formatDate(message.created_at)}</p>
                <p className="mt-1">{message.body}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Workflow timeline</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {(current?.steps ?? []).map((step) => (
              <li key={step.id} className="flex justify-between gap-3">
                <span>{step.name.replaceAll("_", " ")}</span>
                <span className="text-stone-500">{step.status}{step.duration_ms ? ` · ${step.duration_ms} ms` : ""}</span>
              </li>
            ))}
            {!current?.steps?.length ? <li className="text-stone-500">No AI run yet.</li> : null}
          </ol>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Triage</h2>
          {triage ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div>Category: {String(triage.category)}</div>
              <div>Severity: {String(triage.severity)}</div>
              <div>Summary: {String(triage.ticket_summary)}</div>
              <div>Reason: {String(triage.reasoning_summary)}</div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-stone-500">Run analysis to generate structured triage.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Retrieved knowledge</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {chunks.map((chunk) => (
              <li key={chunk.chunk_id}>
                <button className="text-left hover:underline" onClick={() => setSelectedChunk(chunk)}>
                  {chunk.document_name} · {chunk.section} ({chunk.retrieval_score.toFixed(3)})
                </button>
              </li>
            ))}
            {chunks.length === 0 ? <li className="text-stone-500">No sources retrieved yet.</li> : null}
          </ul>
          {selectedChunk ? (
            <div className="mt-3 rounded-md bg-stone-50 p-3 text-sm">
              <p className="font-medium">{selectedChunk.document_name}</p>
              <p className="mt-2 whitespace-pre-wrap">{selectedChunk.body}</p>
            </div>
          ) : null}
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">Resolution and human review</h2>
        <p className="mt-2 text-sm text-stone-600">
          AI quality signal: {current?.quality_signal?.score ?? "—"} — evidence quality, not a probability of correctness.
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm">{current?.original_customer_response ?? "No draft yet."}</p>
        {reviewResult ? <p className="mt-3 text-sm">Review: {String(reviewResult.status)} — {String(reviewResult.review_summary)}</p> : null}
        <div className="mt-4 grid gap-3">
          <Field label="Edit customer response">
            <Textarea
              rows={6}
              value={draft || current?.original_customer_response || ""}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          <Field label="Reviewer feedback">
            <Textarea rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
          </Field>
          <Field label="Feedback label">
            <select className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm" value={label} onChange={(event) => setLabel(event.target.value)}>
              <option value="fully_useful">fully useful</option>
              <option value="minor_edits">minor edits</option>
              <option value="major_edits">major edits</option>
              <option value="wrong_knowledge">wrong knowledge</option>
              <option value="hallucinated_detail">hallucinated detail</option>
              <option value="wrong_severity">wrong severity</option>
              <option value="bad_tone">bad tone</option>
              <option value="missing_information">missing information</option>
              <option value="should_have_escalated">should have escalated</option>
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!current} onClick={() => review.mutate("approve")}>Approve</Button>
            <Button variant="secondary" disabled={!current} onClick={() => review.mutate("edit_and_approve")}>Edit and approve</Button>
            <Button variant="secondary" disabled={!current} onClick={() => review.mutate("reject")}>Reject</Button>
            <Button variant="secondary" disabled={!current} onClick={() => review.mutate("regenerate")}>Regenerate</Button>
            <Button variant="danger" disabled={!current} onClick={() => review.mutate("escalate")}>Escalate</Button>
          </div>
        </div>
        {current ? (
          <p className="mt-4 text-xs text-stone-500">
            Prompt versions {JSON.stringify(current.prompt_versions)} · <Link className="underline" to={`/ai-runs/${current.id}`}>Open AI run</Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
