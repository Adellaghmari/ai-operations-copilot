import { useState } from "react";
import type { AiRun } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { FEEDBACK_LABELS, humanDecisionLabel } from "../../lib/presentation";
import type { DecisionKind } from "../../lib/presentation";
import { humanize } from "../../lib/utils";
import { Button, Card, ErrorState, Field, Select, Textarea } from "../../components/ui";

export type DecisionSubmission = {
  decision: DecisionKind;
  editedResponse?: string;
  feedback: string;
  label: string;
};

const ACTION_HELP: { name: string; text: string }[] = [
  { name: "Approve", text: "Accept the AI draft as written. Nothing is sent to the customer by this system." },
  { name: "Edit and approve", text: "Accept your edited version. The original AI draft stays preserved." },
  { name: "Reject", text: "Discard this recommendation and keep the ticket open." },
  { name: "Regenerate", text: "Record a regeneration request on this run and create a new AI run, using your feedback as guidance." },
  { name: "Escalate", text: "Hand the case to a human escalation path and mark the ticket escalated." },
];

/**
 * Human decision controls. Mount with `key={run.id}` so the draft and feedback reset for each run.
 */
export function DecisionSection({
  run,
  hasDraft,
  abstained,
  pending,
  error,
  lastDecision,
  onSubmit,
}: {
  run: AiRun | undefined;
  hasDraft: boolean;
  abstained: boolean;
  pending: boolean;
  error: unknown;
  lastDecision: string | null;
  onSubmit: (submission: DecisionSubmission) => void;
}) {
  const original = run?.original_customer_response ?? "";
  const [draft, setDraft] = useState(original);
  const [feedback, setFeedback] = useState("");
  const [label, setLabel] = useState("");

  if (!run) {
    return (
      <Card data-testid="human-decision">
        <p className="text-sm text-muted">
          Human actions appear here after an AI run exists. The final customer facing action always stays with a
          person.
        </p>
      </Card>
    );
  }

  const decided = Boolean(run.human_decision);
  const locked = decided || pending;
  const submit = (decision: DecisionKind) =>
    onSubmit({
      decision,
      editedResponse: decision === "edit_and_approve" ? draft : undefined,
      feedback,
      label,
    });

  return (
    <Card data-testid="human-decision">
      <p className="text-sm text-ink-soft">
        The final customer facing action stays with a human. Passing every gate does not authorize sending a reply, and
        this system never sends one.
      </p>

      {decided ? (
        <p role="status" className="mt-3 rounded-md bg-lime/10 p-3 text-sm text-lime" data-testid="decision-recorded">
          Decision recorded: {humanDecisionLabel(run.human_decision)}. Run a new AI analysis to create a run that can
          receive a new decision.
        </p>
      ) : null}
      {lastDecision && !decided ? (
        <p role="status" className="mt-3 rounded-md bg-lime/10 p-3 text-sm text-lime">
          {lastDecision}
        </p>
      ) : null}
      {abstained ? (
        <p className="mt-3 rounded-md bg-amber-400/10 p-3 text-sm text-amber-100">
          The AI abstained, so there is no draft to approve. You can reject, regenerate, or escalate.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4">
        {hasDraft ? (
          <Field label="Edit customer response" hint="Only used when you choose Edit and approve.">
            {(control) => (
              <Textarea
                {...control}
                data-testid="edit-response"
                rows={6}
                value={draft}
                disabled={locked}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Field
          label="Reviewer feedback"
          hint="Saved with your decision. Regenerate also uses it as guidance for the new run."
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={feedback}
              disabled={locked}
              onChange={(event) => setFeedback(event.target.value)}
            />
          )}
        </Field>
        <Field label="Feedback label" hint="Optional. Labelled decisions appear in the feedback summary.">
          {(control) => (
            <Select {...control} value={label} disabled={locked} onChange={(event) => setLabel(event.target.value)}>
              <option value="">No label</option>
              {FEEDBACK_LABELS.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorState compact title="The decision was not recorded" message={describeError(error).summary} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Human decision actions">
        <Button data-testid="approve-run" disabled={locked || !hasDraft} onClick={() => submit("approve")}>
          Approve
        </Button>
        <Button
          data-testid="edit-and-approve"
          variant="secondary"
          disabled={locked || !hasDraft || draft.trim().length === 0}
          onClick={() => submit("edit_and_approve")}
        >
          Edit and approve
        </Button>
        <Button data-testid="reject-run" variant="secondary" disabled={locked} onClick={() => submit("reject")}>
          Reject
        </Button>
        <Button data-testid="regenerate-run" variant="secondary" disabled={locked} onClick={() => submit("regenerate")}>
          Regenerate
        </Button>
        <Button data-testid="escalate-run" variant="danger" disabled={locked} onClick={() => submit("escalate")}>
          Escalate
        </Button>
      </div>
      {pending ? (
        <p role="status" className="mt-2 text-sm text-muted">
          Recording your decision. Regenerate runs the full workflow again, which can take a while.
        </p>
      ) : null}

      <div className="mt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">What each action does</h3>
        <dl className="m-0 mt-2 grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
          {ACTION_HELP.map((item) => (
            <div key={item.name} className="contents">
              <dt className="font-medium text-ink">{item.name}</dt>
              <dd className="m-0 mb-1 text-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
