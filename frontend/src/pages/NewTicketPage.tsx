import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { describeError } from "../lib/errors";
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, Textarea } from "../components/ui";

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 300;
export const BODY_MIN = 10;
export const BODY_MAX = 8000;

export type TicketFormErrors = { customer: string | null; subject: string | null; body: string | null };

/** Pure validation that mirrors the backend `TicketCreate` schema. */
export function validateTicketForm(values: { customerId: string; subject: string; body: string }): TicketFormErrors {
  const subject = values.subject.trim();
  const body = values.body.trim();
  return {
    customer: values.customerId ? null : "Choose the customer this ticket belongs to.",
    subject:
      subject.length < SUBJECT_MIN
        ? `Enter a subject of at least ${SUBJECT_MIN} characters.`
        : subject.length > SUBJECT_MAX
          ? `Keep the subject to ${SUBJECT_MAX} characters or fewer.`
          : null,
    body:
      body.length < BODY_MIN
        ? `Describe the problem in at least ${BODY_MIN} characters.`
        : body.length > BODY_MAX
          ? `Keep the description to ${BODY_MAX} characters or fewer.`
          : null,
  };
}

export function NewTicketPage() {
  const navigate = useNavigate();
  const customers = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [touched, setTouched] = useState({ customer: false, subject: false, body: false });

  const create = useMutation({
    mutationFn: () =>
      api.createTicket({ subject: subject.trim(), body: body.trim(), customer_id: customerId }),
    onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`, { state: { justCreated: true } }),
  });

  const errors = validateTicketForm({ customerId, subject, body });
  const valid = !errors.customer && !errors.subject && !errors.body;
  const customersReady = customers.isSuccess && customers.data.length > 0;
  const canSubmit = valid && customersReady && !create.isPending;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="New ticket"
        description="Create a ticket, then open it to run an AI analysis. Nothing is sent to the customer."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
      <Card className="space-y-4">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched({ customer: true, subject: true, body: true });
            if (canSubmit) create.mutate();
          }}
        >
          {customers.isError ? (
            <ErrorState
              compact
              title="Customers could not be loaded"
              error={customers.error}
              onRetry={() => void customers.refetch()}
              retrying={customers.isFetching}
            />
          ) : null}
          {customers.isSuccess && customers.data.length === 0 ? (
            <ErrorState
              compact
              title="No customers exist yet"
              message="A ticket needs a customer. Reset the synthetic demo from the dashboard to seed customers."
            />
          ) : null}
          <Field label="Customer" error={touched.customer ? errors.customer : null}>
            {(control) => (
              <Select
                {...control}
                value={customerId}
                disabled={!customersReady}
                onChange={(event) => setCustomerId(event.target.value)}
                onBlur={() => setTouched((state) => ({ ...state, customer: true }))}
              >
                <option value="">
                  {customers.isPending
                    ? "Loading customers"
                    : customers.isError
                      ? "Customers unavailable"
                      : customersReady
                        ? "Choose a customer"
                        : "No customers available"}
                </option>
                {customers.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company}, {customer.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Subject"
            hint={`${subject.trim().length} of ${SUBJECT_MAX} characters`}
            error={touched.subject ? errors.subject : null}
          >
            {(control) => (
              <Input
                {...control}
                value={subject}
                maxLength={SUBJECT_MAX + 50}
                onChange={(event) => setSubject(event.target.value)}
                onBlur={() => setTouched((state) => ({ ...state, subject: true }))}
              />
            )}
          </Field>
          <Field
            label="Description"
            hint={`${body.trim().length} of ${BODY_MAX} characters. Ticket text is treated as untrusted data. The AI reads it as content to analyse, never as instructions.`}
            error={touched.body ? errors.body : null}
          >
            {(control) => (
              <Textarea
                {...control}
                value={body}
                rows={8}
                onChange={(event) => setBody(event.target.value)}
                onBlur={() => setTouched((state) => ({ ...state, body: true }))}
              />
            )}
          </Field>
          <p className="text-xs text-muted">
            Tickets created here are stored as synthetic demo records. Resetting the synthetic demo removes them.
          </p>
          {create.isError ? (
            <ErrorState compact title="The ticket was not created" message={describeError(create.error).summary} />
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? "Creating ticket" : "Create ticket"}
            </Button>
            <Link className="text-sm text-muted underline hover:text-ink" to="/tickets">
              Back to the queue
            </Link>
            {!valid && !create.isPending ? (
              <span className="text-xs text-muted">Complete the required fields to enable Create ticket.</span>
            ) : null}
          </div>
        </form>
      </Card>
      <aside className="space-y-3 lg:sticky lg:top-24">
        <Card className="border-t-2 border-t-violet">
          <h2 className="text-sm font-semibold text-ink">What happens next</h2>
          <ol className="m-0 mt-2 list-decimal space-y-2 pl-4 text-sm leading-6 text-muted">
            <li>The ticket is stored as a synthetic demo record.</li>
            <li>You run the workflow: Triage, retrieval, Resolution, Review, then assurance gates.</li>
            <li>A human decides. The AI never sends a customer message.</li>
          </ol>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-ink">Untrusted input</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ticket text is treated as data to analyse, never as instructions to the model. Humans remain in control of
            every outbound decision.
          </p>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-ink">Human control</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Creating a ticket does not start an analysis. You choose when to run it, and you choose whether anything is
            approved.
          </p>
        </Card>
      </aside>
      </div>
    </div>
  );
}
