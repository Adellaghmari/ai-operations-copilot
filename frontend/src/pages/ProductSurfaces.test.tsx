import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DASHBOARD, RUN, TICKET_PAGE } from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import { renderPage } from "../test/render";
import { ArchitecturePage } from "./ArchitecturePage";
import { AssurancePage } from "./AssurancePage";
import { ReplayPage } from "./ReplayPage";

describe("first class product surfaces", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("explains architecture with real routes and no fourth agent", () => {
    renderPage(<ArchitecturePage />, { path: "/architecture" });
    expect(screen.getByRole("heading", { level: 1, name: "Architecture" })).toBeInTheDocument();
    expect(screen.getByText(/There is no fourth agent/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inspect stored AI runs" })).toHaveAttribute("href", "/ai-runs");
    expect(screen.getByRole("link", { name: "Open Decision Assurance" })).toHaveAttribute("href", "/assurance");
    expect(screen.getByRole("link", { name: "See recorded decisions" })).toHaveAttribute("href", "/feedback");
  });

  it("lists stored runs for Decision Assurance from the AI runs API", async () => {
    ({ restore } = installMockApi([
      { match: "/api/dashboard", json: DASHBOARD },
      { match: /^\/api\/ai-runs\?/, json: { items: [RUN], total: 1, page: 1, page_size: 100 } },
    ]));
    renderPage(<AssurancePage />, { path: "/assurance" });
    expect(await screen.findByTestId(`assurance-run-${RUN.id}`)).toBeInTheDocument();
    expect(within(screen.getByTestId(`assurance-run-${RUN.id}`)).getByRole("link", { name: "Open AI run" })).toHaveAttribute(
      "href",
      `/ai-runs/${RUN.id}`,
    );
  });

  it("groups Decision Replay by ticket from stored runs", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi([
      { match: /^\/api\/ai-runs\?/, json: { items: [RUN], total: 1, page: 1, page_size: 100 } },
      { match: /^\/api\/tickets\?/, json: TICKET_PAGE },
    ]));
    renderPage(<ReplayPage />, { path: "/replay" });
    await user.click(await screen.findByRole("button", { name: /T-0001/ }));
    expect(screen.getByText(/This case has one stored run/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the ticket" })).toHaveAttribute("href", `/tickets/${RUN.ticket_id}`);
    expect(screen.getByTestId("replay-readiness")).toHaveTextContent("A second stored run is required");
    expect(screen.getByRole("link", { name: "Open stored run" })).toHaveAttribute("href", `/ai-runs/${RUN.id}`);
    expect(screen.getByRole("link", { name: "Run workflow again" })).toHaveAttribute("href", `/tickets/${RUN.ticket_id}`);
  });

  it("offers run selectors when a case has two stored runs", async () => {
    const user = userEvent.setup();
    const second = { ...RUN, id: "r1000000-0000-4000-8000-000000000099", created_at: "2026-10-02T08:31:00Z" };
    ({ restore } = installMockApi([
      { match: /^\/api\/ai-runs\?/, json: { items: [RUN, second], total: 2, page: 1, page_size: 100 } },
      { match: /^\/api\/tickets\?/, json: TICKET_PAGE },
    ]));
    renderPage(<ReplayPage />, { path: "/replay" });
    await user.click(await screen.findByRole("button", { name: /T-0001/ }));
    expect(screen.getAllByText("Ready to compare").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Select run A")).toBeInTheDocument();
    expect(screen.getByLabelText("Select run B")).toBeInTheDocument();
    expect(screen.queryByText(/This case has one stored run/)).not.toBeInTheDocument();
  });
});
