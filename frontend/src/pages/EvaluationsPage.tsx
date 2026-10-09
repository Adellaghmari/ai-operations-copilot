import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate } from "../lib/utils";
import { Button, Card } from "../components/ui";

export function EvaluationsPage() {
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const cases = useQuery({ queryKey: ["eval-cases"], queryFn: api.evalCases });
  const runs = useQuery({ queryKey: ["eval-runs"], queryFn: api.evalRuns });
  const [selected, setSelected] = useState<string | null>(null);
  const results = useQuery({
    queryKey: ["eval-results", selected],
    queryFn: () => api.evalResults(selected!),
    enabled: Boolean(selected),
  });
  const runEval = useMutation({
    mutationFn: api.runEval,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["eval-runs"] }),
  });
  const foundryLive = health.data?.uses_foundry ?? false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Evaluation lab</h1>
          <p className="text-sm text-stone-600">{cases.data?.length ?? 0} golden cases in dataset golden-v1.</p>
        </div>
        <Button disabled={foundryLive} onClick={() => runEval.mutate()}>
          {foundryLive ? "Full Foundry eval disabled in public demo" : "Run deterministic evaluation"}
        </Button>
      </div>
      <Card>
        <h2 className="font-semibold">Historical runs</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {runs.data?.map((run) => (
            <li key={run.id}>
              <button className="hover:underline" onClick={() => setSelected(run.id)}>
                {formatDate(run.started_at)} · {run.provider_kind} · {run.case_count} cases
              </button>
              <pre className="mt-1 overflow-auto text-xs text-stone-600">{JSON.stringify(run.metrics)}</pre>
            </li>
          ))}
          {runs.data?.length === 0 ? <li className="text-stone-500">No completed evaluation runs stored yet.</li> : null}
        </ul>
      </Card>
      {results.data ? (
        <Card>
          <h2 className="font-semibold">Case results</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {results.data.map((item) => (
              <li key={item.case_key}>
                {item.passed ? "PASS" : "FAIL"} · {item.case_key}
                {item.failure_reason ? ` — ${item.failure_reason}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
