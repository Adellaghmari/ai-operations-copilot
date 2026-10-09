import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ticketParams } from "../lib/api";
import type { Ticket } from "../lib/api";
import {
  AI_REVIEW_STATUSES,
  SCENARIOS,
  TICKET_CATEGORIES,
  TICKET_SEVERITIES,
  TICKET_STATUSES,
  aiStateTone,
  scenarioInfo,
  ticketStatusTone,
} from "../lib/presentation";
import { formatRelative, humanize } from "../lib/utils";
import { QueryState } from "../components/QueryState";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  buttonClasses,
} from "../components/ui";

const PAGE_SIZE = 20;
const FILTER_KEYS = ["q", "status", "category", "severity", "ai_review_status", "demo_scenario"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function AiState({ ticket }: { ticket: Ticket }) {
  if (!ticket.ai_review_status) {
    return <Badge tone="neutral">No analysis yet</Badge>;
  }
  return <Badge tone={aiStateTone(ticket.ai_review_status)}>{humanize(ticket.ai_review_status)}</Badge>;
}

function SeverityCell({ value }: { value: string | null }) {
  return <span>{value ?? "Not triaged"}</span>;
}

export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ""])) as Record<
    FilterKey,
    string
  >;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [searchText, setSearchText] = useState(filters.q);
  useEffect(() => {
    if (searchText === filters.q) return;
    const handle = window.setTimeout(() => updateParam("q", searchText), 300);
    return () => window.clearTimeout(handle);
    // updateParam is stable for a given params object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function updateParam(key: FilterKey, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  }

  function goToPage(target: number) {
    const next = new URLSearchParams(params);
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    setParams(next);
  }

  function clearFilters() {
    setSearchText("");
    setParams(new URLSearchParams(), { replace: true });
  }

  const activeFilters = FILTER_KEYS.filter((key) => filters[key] !== "");
  const apiFilters = { ...filters, page, page_size: PAGE_SIZE };
  const tickets = useQuery({
    queryKey: ["tickets", apiFilters],
    queryFn: () => api.tickets(ticketParams(apiFilters)),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Ticket queue"
        description="Tickets are listed by most recent update. The ticket status shows where the work stands. The AI and review state shows what the latest analysis and human review recorded."
        actions={
          <Link to="/tickets/new" className={buttonClasses("primary")}>
            New ticket
          </Link>
        }
      />

      <Card className="space-y-3">
        <form
          role="search"
          aria-label="Filter tickets"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field label="Search" hint="Matches the subject or body.">
            {(control) => (
              <Input
                {...control}
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Subject or body"
              />
            )}
          </Field>
          <Field label="Ticket status">
            {(control) => (
              <Select {...control} value={filters.status} onChange={(event) => updateParam("status", event.target.value)}>
                <option value="">Any status</option>
                {TICKET_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Category">
            {(control) => (
              <Select
                {...control}
                value={filters.category}
                onChange={(event) => updateParam("category", event.target.value)}
              >
                <option value="">Any category</option>
                {TICKET_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Severity">
            {(control) => (
              <Select
                {...control}
                value={filters.severity}
                onChange={(event) => updateParam("severity", event.target.value)}
              >
                <option value="">Any severity</option>
                {TICKET_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="AI and review state">
            {(control) => (
              <Select
                {...control}
                value={filters.ai_review_status}
                onChange={(event) => updateParam("ai_review_status", event.target.value)}
              >
                <option value="">Any state</option>
                {AI_REVIEW_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Synthetic scenario">
            {(control) => (
              <Select
                {...control}
                value={filters.demo_scenario}
                onChange={(event) => updateParam("demo_scenario", event.target.value)}
              >
                <option value="">Any scenario</option>
                {SCENARIOS.map((scenario) => (
                  <option key={scenario.key} value={scenario.key}>
                    {scenario.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </form>
        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>
              {activeFilters.length} {activeFilters.length === 1 ? "filter" : "filters"} active
            </span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <QueryState
        query={tickets}
        label="Tickets"
        errorTitle="The ticket queue could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={
          activeFilters.length > 0 ? (
            <EmptyState
              title="No tickets match these filters"
              body="The API answered and found no matching tickets. Try removing a filter."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="The queue is empty"
              body="No tickets exist yet. Create one, or reset the synthetic demo from the dashboard."
              action={
                <Link to="/tickets/new" className={buttonClasses("primary")}>
                  New ticket
                </Link>
              }
            />
          )
        }
      >
        {(data) => {
          const first = (data.page - 1) * data.page_size + 1;
          const last = first + data.items.length - 1;
          const pageCount = Math.max(1, Math.ceil(data.total / data.page_size));
          return (
            <div className="space-y-3" aria-busy={tickets.isPlaceholderData}>
              <p className="text-sm text-muted" role="status" data-testid="ticket-count">
                Showing {first} to {last} of {data.total} {data.total === 1 ? "ticket" : "tickets"}
                {tickets.isPlaceholderData ? ". Updating" : ""}
              </p>

              <Card className="hidden overflow-x-auto p-0 md:block">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Support tickets, most recently updated first</caption>
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Ticket
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Customer
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Severity
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Ticket status
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        AI and review state
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((ticket) => {
                      const scenario = scenarioInfo(ticket.demo_scenario);
                      return (
                        <tr
                          key={ticket.id}
                          className="cursor-pointer border-t border-line hover:bg-surface-2"
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("a")) return;
                            navigate(`/tickets/${ticket.id}`);
                          }}
                        >
                          <td className="max-w-md px-4 py-3">
                            <Link
                              className="font-medium hover:underline"
                              data-testid={`ticket-link-${ticket.display_id}`}
                              to={`/tickets/${ticket.id}`}
                            >
                              {ticket.display_id}: {ticket.subject}
                            </Link>
                            {scenario ? (
                              <span className="ml-2 align-middle">
                                <Badge tone="info" title="Synthetic scenario ticket">
                                  {scenario.label}
                                </Badge>
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{ticket.customer?.company ?? "Customer not recorded"}</td>
                          <td className="px-4 py-3">
                            <SeverityCell value={ticket.severity} />
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={ticketStatusTone(ticket.status)}>{humanize(ticket.status)}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <AiState ticket={ticket} />
                          </td>
                          <td className="px-4 py-3 text-muted">{formatRelative(ticket.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              <ul className="m-0 list-none space-y-3 p-0 md:hidden">
                {data.items.map((ticket) => (
                  <li key={ticket.id}>
                    <Card>
                      <Link
                        className="font-medium hover:underline"
                        data-testid={`ticket-card-link-${ticket.display_id}`}
                        to={`/tickets/${ticket.id}`}
                      >
                        {ticket.display_id}: {ticket.subject}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {ticket.customer?.company ?? "Customer not recorded"}, updated {formatRelative(ticket.updated_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>{ticket.severity ?? "Not triaged"}</Badge>
                        <Badge tone={ticketStatusTone(ticket.status)}>{humanize(ticket.status)}</Badge>
                        <AiState ticket={ticket} />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>

              {pageCount > 1 ? (
                <nav aria-label="Ticket pages" className="flex items-center justify-between gap-3">
                  <Button variant="secondary" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>
                    Previous page
                  </Button>
                  <span className="text-sm text-muted">
                    Page {data.page} of {pageCount}
                  </span>
                  <Button variant="secondary" disabled={data.page >= pageCount} onClick={() => goToPage(data.page + 1)}>
                    Next page
                  </Button>
                </nav>
              ) : null}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
