import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TICKET_PAGE } from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import { renderPage } from "../test/render";
import { TicketsPage } from "./TicketsPage";

const DASH = /[\u2013\u2014]|\s-\s/;

describe("TicketsPage", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("lists tickets with ticket status separate from AI and review state", async () => {
    let requests: ReturnType<typeof installMockApi>["requests"] = [];
    ({ restore, requests } = installMockApi([{ match: /^\/api\/tickets\?/, json: TICKET_PAGE }]));
    renderPage(<TicketsPage />, { path: "/tickets" });
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Ticket status" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "AI and review state" })).toBeInTheDocument();
    expect(within(table).getByText("Awaiting human")).toBeInTheDocument();
    expect(within(table).getByText("No analysis yet")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-count")).toHaveTextContent("Showing 1 to 2 of 2 tickets");
    expect(requests[0].path).toContain("page_size=20");
  });

  it("sends backend enum filters and resets to the first page", async () => {
    const user = userEvent.setup();
    let requests: ReturnType<typeof installMockApi>["requests"] = [];
    ({ restore, requests } = installMockApi([{ match: /^\/api\/tickets\?/, json: TICKET_PAGE }]));
    renderPage(<TicketsPage />, { path: "/tickets" });
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Ticket status"), "escalated");
    await screen.findByText(/1 filter active/);
    const last = requests[requests.length - 1].path;
    expect(last).toContain("status=escalated");
    expect(last).toContain("page=1");
  });

  it("shows a failure with retry, never an empty table, when the API fails", async () => {
    ({ restore } = installMockApi([{ match: /^\/api\/tickets\?/, status: 500 }]));
    renderPage(<TicketsPage />, { path: "/tickets" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The ticket queue could not be loaded");
    expect(screen.queryByText("No tickets match these filters")).not.toBeInTheDocument();
    expect(screen.queryByText("The queue is empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an empty state only when the API answered with no tickets", async () => {
    ({ restore } = installMockApi([
      { match: /^\/api\/tickets\?/, json: { items: [], total: 0, page: 1, page_size: 20 } },
    ]));
    renderPage(<TicketsPage />, { path: "/tickets" });
    expect(await screen.findByText("The queue is empty")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a filtered empty result and offers to clear filters", async () => {
    ({ restore } = installMockApi([
      { match: /^\/api\/tickets\?/, json: { items: [], total: 0, page: 1, page_size: 20 } },
    ]));
    renderPage(<TicketsPage />, { path: "/tickets", entry: "/tickets?status=closed" });
    expect(await screen.findByText("No tickets match these filters")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("uses no dash characters in visible copy", async () => {
    ({ restore } = installMockApi([{ match: /^\/api\/tickets\?/, json: TICKET_PAGE }]));
    renderPage(<TicketsPage />, { path: "/tickets" });
    await screen.findByRole("table");
    expect(document.body.textContent ?? "").not.toMatch(DASH);
  });
});
