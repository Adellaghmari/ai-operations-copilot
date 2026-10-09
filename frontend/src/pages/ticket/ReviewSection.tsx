import type { AiRun, AssuranceReport } from "../../lib/api";
import { gateTone } from "../../lib/presentation";
import { Badge, Card } from "../../components/ui";

function Findings({ title, items }: { title: string; items: string[] | undefined }) {
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

const VERDICT_EXPLANATION: Record<string, string> = {
  PASS: "The reviewer found no blocking problem with the draft.",
  REVISE: "The reviewer asked for changes. The system allows one revision.",
  ESCALATE: "The reviewer could not accept the draft. The case needs human escalation.",
};

export function ReviewSection({
  run,
  report,
}: {
  run: AiRun | undefined;
  report: AssuranceReport | undefined;
}) {
  const review = run?.review_result ?? null;
  const delta = report?.revision_delta;
  const revised = Boolean(delta?.occurred) || (run?.revision_count ?? 0) > 0;
  const originalAction = delta?.original_action ?? run?.original_resolution_draft?.proposed_action ?? null;
  const finalAction = delta?.revised_action ?? run?.resolution_draft?.proposed_action ?? null;

  return (
    <div className="space-y-4">
      <Card data-testid="independent-review">
        <h3 className="text-sm font-semibold text-ink">Independent review</h3>
        <p className="mt-1 text-xs text-muted">
          A separate Review agent challenges the Resolution draft. It sees the draft and the retrieved evidence.
        </p>
        {review ? (
          <div className="mt-3">
            <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="review-result">
              <span className="font-medium">Review: {review.status ?? "Not recorded"}</span>
              {review.status ? <Badge tone={gateTone(review.status)}>{review.status}</Badge> : null}
              <span className="text-ink">{review.review_summary}</span>
            </p>
            {review.status && VERDICT_EXPLANATION[review.status] ? (
              <p className="mt-1 text-xs text-muted">{VERDICT_EXPLANATION[review.status]}</p>
            ) : null}
            <Findings title="Grounding issues" items={review.grounding_issues} />
            <Findings title="Unsupported claims" items={review.unsupported_claims} />
            <Findings title="Missing items" items={review.missing_items} />
            <Findings title="Citation issues" items={review.citation_issues} />
            <Findings title="Tone issues" items={review.tone_issues} />
            <Findings title="Safety flags" items={review.safety_flags} />
            <Findings title="Recommended changes" items={review.recommended_changes} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">The Review agent has not run yet.</p>
        )}
      </Card>

      <Card data-testid="revision-delta">
        <h3 className="text-sm font-semibold text-ink">Revision</h3>
        <p className="mt-1 text-xs text-muted">
          After a REVISE verdict the Resolution agent may revise once. If a concern remains, the case is escalated to a
          human. There is never a second revision.
        </p>
        {!run ? (
          <p className="mt-3 text-sm text-muted">No run yet.</p>
        ) : revised ? (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-surface-2 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Original recommendation</p>
                <p className="mt-1 text-ink">{originalAction ?? "The original action was not recorded."}</p>
              </div>
              <div className="rounded-md bg-lime/10 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Final recommendation</p>
                <p className="mt-1 text-ink">{finalAction ?? "The final action was not recorded."}</p>
              </div>
            </div>
            <Findings title="Reviewer challenged" items={delta?.reviewer_challenged} />
            <Findings title="Changed" items={delta?.changed} />
            <Findings title="Removed unsupported claims" items={delta?.removed_unsupported_claims} />
            <Findings title="Added evidence requirement" items={delta?.added_evidence_requirement} />
            <Findings title="Remaining concern" items={delta?.remaining_concern} />
            {(delta?.remaining_concern ?? []).length > 0 ? (
              <p className="rounded-md bg-amber-400/10 p-3 text-amber-100">
                A concern remained after the one allowed revision, so a human must decide.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No revision was needed for this run, so there is no before and after to compare.
          </p>
        )}
      </Card>
    </div>
  );
}
