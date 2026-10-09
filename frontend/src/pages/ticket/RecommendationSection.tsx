import type { AiRun } from "../../lib/api";
import { aiStateTone, describeProvider, humanDecisionLabel } from "../../lib/presentation";
import { formatModelLabel, humanize } from "../../lib/utils";
import { Badge, Card } from "../../components/ui";

function BulletList({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h4>
      <ul className="m-0 mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function RecommendationSection({ run, abstained }: { run: AiRun | undefined; abstained: boolean }) {
  if (!run) {
    return (
      <Card>
        <p className="text-sm text-muted">
          There is no AI recommendation yet. Run an AI analysis to produce a proposed action and a customer draft for
          a human to review.
        </p>
      </Card>
    );
  }
  const provider = describeProvider(run.provider_kind);
  const draft = run.resolution_draft;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2" data-testid="ai-run-status">
          <Badge tone={aiStateTone(run.status)}>Run status: {humanize(run.status)}</Badge>
          <Badge tone={provider.tone} title={provider.description}>
            Provider: {provider.label}
          </Badge>
          <Badge>Revisions used: {run.revision_count} of 1</Badge>
          <Badge tone={run.human_decision ? "good" : "info"}>{humanDecisionLabel(run.human_decision)}</Badge>
        </div>

        {run.error_message ? (
          <p className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-100">{run.error_message}</p>
        ) : null}

        {typeof draft?.proposed_action === "string" && draft.proposed_action ? (
          <div className="mt-4" data-testid="proposed-action">
            <h3 className="text-sm font-semibold text-ink">Proposed action</h3>
            <p className="mt-1 text-sm text-ink">{draft.proposed_action}</p>
          </div>
        ) : null}
        {draft?.internal_summary ? (
          <div className="mt-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Internal summary</h4>
            <p className="mt-1 text-sm text-ink">{draft.internal_summary}</p>
          </div>
        ) : null}
        <BulletList title="Recommended actions" items={draft?.recommended_actions} />
        <BulletList title="Unanswered questions" items={draft?.unanswered_questions} />
        <BulletList title="Limitations" items={draft?.limitations} />
        {draft?.escalation_required ? (
          <p className="mt-3 rounded-md bg-amber-400/10 p-3 text-sm text-amber-100">
            The draft recommends escalation{draft.escalation_reason ? `: ${draft.escalation_reason}` : "."}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          Model {formatModelLabel(run.model_deployment)}. Embeddings {formatModelLabel(run.embedding_model)}. These
          are the deployments the run recorded.
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink">Customer response draft</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm" data-testid="original-customer-response">
          {abstained
            ? "None. The system abstained and did not fabricate a customer response."
            : (run.original_customer_response ?? "No draft was produced for this run.")}
        </p>
        {run.final_customer_response ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-ink">Human reviewed response</h3>
            <p
              className="mt-2 whitespace-pre-wrap rounded-md bg-lime/10 p-3 text-sm"
              data-testid="final-customer-response"
            >
              {run.final_customer_response}
            </p>
            <p className="mt-1 text-xs text-muted">
              {run.was_edited
                ? "A human edited this response. The original AI draft above is preserved."
                : "A human approved the original draft without edits."}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">
            The AI does not send this draft to a customer. A human must approve, edit, reject, or escalate.
          </p>
        )}
      </Card>
    </div>
  );
}
