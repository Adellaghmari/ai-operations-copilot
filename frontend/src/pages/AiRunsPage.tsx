import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate } from "../lib/utils";
import { Card } from "../components/ui";

export function AiRunsPage() {
  const { runId } = useParams();
  const list = useQuery({ queryKey: ["runs"], queryFn: api.aiRuns });
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.aiRun(runId!),
    enabled: Boolean(runId),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">AI runs</h1>
      {detail.data ? (
        <Card>
          <p className="text-sm text-stone-500">{detail.data.status} · {detail.data.provider_kind}</p>
          <p className="mt-2 text-sm">Duration {detail.data.duration_ms ?? "—"} ms · revisions {detail.data.revision_count}</p>
          <p className="mt-2 text-sm">Model {detail.data.model_deployment ?? "—"} · prompts {JSON.stringify(detail.data.prompt_versions)}</p>
          <ol className="mt-4 space-y-1 text-sm">
            {detail.data.steps?.map((step) => (
              <li key={step.id}>{step.name} · {step.status} · {step.duration_ms ?? 0} ms</li>
            ))}
          </ol>
        </Card>
      ) : null}
      <Card className="p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((run) => (
              <tr key={run.id} className="border-t border-stone-100">
                <td className="px-4 py-3">
                  <Link className="hover:underline" to={`/ai-runs/${run.id}`}>{formatDate(run.created_at)}</Link>
                </td>
                <td className="px-4 py-3">{run.status}</td>
                <td className="px-4 py-3">{run.provider_kind}</td>
                <td className="px-4 py-3">{run.duration_ms ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
