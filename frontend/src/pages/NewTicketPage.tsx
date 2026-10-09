import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, Field, Input, Textarea } from "../components/ui";

export function NewTicketPage() {
  const navigate = useNavigate();
  const customers = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [customerId, setCustomerId] = useState("");
  const create = useMutation({
    mutationFn: () => api.createTicket({ subject, body, customer_id: customerId || undefined }),
    onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">New ticket</h1>
      <Card className="space-y-4">
        <Field label="Customer">
          <select
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Default first customer</option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.company} — {customer.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <Input value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={3} />
        </Field>
        <Field label="Description">
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} required minLength={10} />
        </Field>
        {create.isError ? <p className="text-sm text-red-700">{(create.error as Error).message}</p> : null}
        <Button disabled={create.isPending || subject.length < 3 || body.length < 10} onClick={() => create.mutate()}>
          {create.isPending ? "Creating…" : "Create ticket"}
        </Button>
      </Card>
    </div>
  );
}
