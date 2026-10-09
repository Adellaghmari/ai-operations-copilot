import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { percent } from "../lib/utils";
import { Card } from "../components/ui";

export function FeedbackPage() {
  const feedback = useQuery({ queryKey: ["feedback"], queryFn: api.feedback });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Feedback analytics</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-stone-500">Labels captured</p>
          <p className="mt-2 text-2xl font-semibold">{feedback.data?.total ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-stone-500">Approval rate</p>
          <p className="mt-2 text-2xl font-semibold">{percent(feedback.data?.approval_rate)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-stone-500">Average edit distance</p>
          <p className="mt-2 text-2xl font-semibold">{feedback.data?.average_edit_distance_ratio ?? "—"}</p>
        </Card>
      </div>
      <Card>
        <h2 className="font-semibold">Labels</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {Object.entries(feedback.data?.by_label ?? {}).map(([label, count]) => (
            <li key={label}>{label.replaceAll("_", " ")}: {count}</li>
          ))}
          {feedback.data?.total === 0 ? <li className="text-stone-500">No human feedback stored yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
