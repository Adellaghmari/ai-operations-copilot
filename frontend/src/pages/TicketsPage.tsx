import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatRelative } from "../lib/utils";
import { Badge, Card, Field, Input } from "../components/ui";

export function TicketsPage() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [q, setQ] = useState("");
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (severity) params.set("severity", severity);
  if (q) params.set("q", q);
  const tickets = useQuery({ queryKey: ["tickets", status, category, severity, q], queryFn: () => api.tickets(params) });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Ticket queue</h1>
      <Card className="grid gap-3 md:grid-cols-4">
        <Field label="Search">
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Subject or body" />
        </Field>
        <Field label="Status">
          <Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="open" />
        </Field>
        <Field label="Category">
          <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="billing" />
        </Field>
        <Field label="Severity">
          <Input value={severity} onChange={(event) => setSeverity(event.target.value)} placeholder="P2" />
        </Field>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.data?.items.map((ticket) => (
              <tr key={ticket.id} className="border-t border-stone-100">
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" to={`/tickets/${ticket.id}`}>
                    {ticket.display_id} · {ticket.subject}
                  </Link>
                </td>
                <td className="px-4 py-3">{ticket.customer?.company ?? "—"}</td>
                <td className="px-4 py-3">{ticket.severity ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge>{ticket.status}</Badge>
                </td>
                <td className="px-4 py-3 text-stone-500">{formatRelative(ticket.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tickets.data?.items.length === 0 ? <p className="p-4 text-sm text-stone-500">No tickets match these filters.</p> : null}
      </Card>
    </div>
  );
}
