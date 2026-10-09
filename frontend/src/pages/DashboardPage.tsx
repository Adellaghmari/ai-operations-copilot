import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatRelative, percent } from "../lib/utils";
import { Card, ErrorState, Skeleton } from "../components/ui";

export function DashboardPage() {
  const metrics = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const tickets = useQuery({
    queryKey: ["tickets-recent"],
    queryFn: () => api.tickets(new URLSearchParams({ page_size: "5" })),
  });
  const runs = useQuery({ queryKey: ["runs-recent"], queryFn: api.aiRuns });

  if (metrics.isError) return <ErrorState message={(metrics.error as Error).message} />;
  if (metrics.isLoading || !metrics.data) {
    return <Skeleton className="h-64" />;
  }

  const cards = [
    ["Open tickets", String(metrics.data.open_tickets)],
    ["AI assisted", String(metrics.data.ai_assisted_tickets)],
    ["Awaiting human review", String(metrics.data.awaiting_human_review)],
    ["Approval rate", percent(metrics.data.approval_rate)],
    ["Edit rate", percent(metrics.data.edit_rate)],
    ["Avg workflow latency", metrics.data.average_workflow_latency_ms ? `${Math.round(metrics.data.average_workflow_latency_ms)} ms` : "—"],
    ["Latest eval signal", metrics.data.latest_evaluation_groundedness ?? "—"],
    ["Knowledge indexed", String(metrics.data.knowledge_documents_indexed)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-600">Live metrics from this application database. Empty values mean no completed events yet.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Recent tickets</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {tickets.data?.items.map((ticket) => (
              <li key={ticket.id}>
                <Link className="hover:underline" to={`/tickets/${ticket.id}`}>
                  {ticket.display_id} · {ticket.subject}
                </Link>
                <span className="block text-stone-500">{formatRelative(ticket.updated_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Recent AI runs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {runs.data?.items.slice(0, 5).map((run) => (
              <li key={run.id}>
                <Link className="hover:underline" to={`/ai-runs/${run.id}`}>
                  {run.status} · {run.provider_kind}
                </Link>
                <span className="block text-stone-500">{formatRelative(run.created_at)}</span>
              </li>
            )) ?? <li className="text-stone-500">No AI runs yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
