import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { FeedbackSummary } from "../lib/api";
import { NOT_AVAILABLE, humanize, percent } from "../lib/utils";
import { QueryState } from "../components/QueryState";
import { Card, EmptyState, PageHeader, buttonClasses } from "../components/ui";

function editDistance(value: number | null): string {
  if (value === null) return NOT_AVAILABLE;
  return value.toFixed(2);
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="m-0 mt-2 text-2xl font-semibold text-ink">{value}</dd>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Card>
  );
}

function FeedbackBody({ data }: { data: FeedbackSummary }) {
  const labels = Object.entries(data.by_label).sort((left, right) => right[1] - left[1]);
  const max = Math.max(1, ...labels.map(([, count]) => count));
  const nothingRecorded =
    data.total === 0 && data.approval_rate === null && data.edit_rate === null && data.rejection_rate === null;
  return (
    <div className="space-y-5">
      {nothingRecorded ? (
        <EmptyState
          title="No human decisions or labels are recorded yet"
          body="The API answered and found nothing. Decide on an AI run in a ticket, and add a feedback label, to fill this page."
          action={
            <Link to="/tickets" className={buttonClasses("primary")}>
              Open the ticket queue
            </Link>
          }
        />
      ) : null}
      <section aria-labelledby="feedback-figures-heading" className="space-y-3">
        <div>
          <h2 id="feedback-figures-heading" className="text-lg font-semibold text-ink">
            What the API reported
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            A zero is a real count from the API. Not available means that rate cannot be computed because no labelled
            decision exists yet.
          </p>
        </div>
        <dl className="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Labels captured"
          value={String(data.total)}
          hint="Feedback labels humans attached to decisions."
        />
        <Stat
          label="Approval rate"
          value={percent(data.approval_rate)}
          hint="Share of decided runs that a human approved, edited or not."
        />
        <Stat
          label="Edit rate"
          value={percent(data.edit_rate)}
          hint="Share of decided runs approved only after an edit."
        />
        <Stat
          label="Rejection rate"
          value={percent(data.rejection_rate)}
          hint="Share of decided runs a human rejected."
        />
      </dl>
      </section>
      <Card>
        <h2 className="font-semibold text-ink">How much humans changed AI drafts</h2>
        <p className="mt-2 text-2xl font-semibold" data-testid="edit-distance">
          {editDistance(data.average_edit_distance_ratio)}
        </p>
        <p className="mt-1 text-xs text-muted">
          Average edit distance ratio, from 0 for an unchanged draft to 1 for a fully rewritten one. It comes from a
          simple character comparison between the AI draft and the final text. {NOT_AVAILABLE} means no labelled
          decision has been recorded.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold text-ink">Labels</h2>
        {labels.length ? (
          <ul className="m-0 mt-3 list-none space-y-3 p-0 text-sm">
            {labels.map(([label, count]) => (
              <li key={label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{humanize(label)}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
                  <div
                    className="h-1.5 rounded-full bg-lime"
                    style={{ width: `${Math.max(3, Math.round((count / max) * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No feedback label has been recorded yet.</p>
        )}
        <p className="mt-4 text-xs text-muted">
          The API reports aggregates only. Individual feedback entries are not available on this page.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link className="underline underline-offset-2 hover:text-lime" to="/tickets?ai_review_status=awaiting_human">
            Tickets awaiting a human
          </Link>
          <Link className="underline underline-offset-2 hover:text-lime" to="/tickets?ai_review_status=human_approved">
            Approved tickets
          </Link>
          <Link className="underline underline-offset-2 hover:text-lime" to="/tickets?ai_review_status=human_edited">
            Edited approvals
          </Link>
          <Link className="underline underline-offset-2 hover:text-lime" to="/tickets?ai_review_status=human_rejected">
            Rejected tickets
          </Link>
        </div>
      </Card>
    </div>
  );
}

export function FeedbackPage() {
  const feedback = useQuery({ queryKey: ["feedback"], queryFn: api.feedback });
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Knowledge and quality"
        title="Feedback analytics"
        titleTestId="feedback-heading"
        description="What humans decided about AI recommendations. These are recorded decisions, not model confidence."
      />
      <QueryState query={feedback} label="Feedback" errorTitle="Feedback could not be loaded">
        {(data) => <FeedbackBody data={data} />}
      </QueryState>
    </div>
  );
}
