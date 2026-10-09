import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DASHBOARD, HEALTH_TEST_MODE, RUN, TICKET_PAGE } from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import type { MockRoute } from "../test/mockApi";
import { renderPage } from "../test/render";
import { DashboardPage } from "./DashboardPage";

const DASH = /[\u2013\u2014]|\s-\s/;

function routes(dashboard: MockRoute = { match: "/api/dashboard", json: DASHBOARD }): MockRoute[] {
  return [
    { match: "/api/health", json: HEALTH_TEST_MODE },
    dashboard,
    { match: /^\/api\/tickets\?/, json: TICKET_PAGE },
    { match: /^\/api\/ai-runs/, json: { items: [RUN], total: 1, page: 1, page_size: 20 } },
  ];
}

describe("DashboardPage", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("tells the Evidence, Challenge, Human Decision story with real links", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<DashboardPage />);
    expect(await screen.findByTestId("metric-open-tickets")).toBeInTheDocument();
    const story = screen.getByRole("region", { name: /The model proposes/ });
    expect(within(story).getByRole("link", { name: "Browse the knowledge base" })).toHaveAttribute("href", "/knowledge");
    expect(within(story).getByRole("link", { name: "Open a risky case" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/tickets\//),
    );
    expect(within(story).getByRole("link", { name: "See recorded decisions" })).toHaveAttribute("href", "/feedback");
  });

  it("builds scenario entry points from real risky cases and labels them synthetic", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<DashboardPage />);
    const link = await screen.findByTestId("risky-case-security_bypass");
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/tickets\//));
    expect(screen.getAllByText("Synthetic").length).toBe(4);
    // Scenarios without a seeded ticket are stated honestly, not linked.
    expect(screen.getAllByText("Not seeded in this database yet.").length).toBe(2);
    expect(screen.getByTestId("try-risky-case")).toHaveAttribute("href", expect.stringMatching(/\?guide=risky$/));
  });

  it("shows missing rates as Not available, not as zero", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<DashboardPage />);
    await screen.findByTestId("metric-open-tickets");
    expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(3);
  });

  it("labels the provider as a fixture and not as Foundry", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<DashboardPage />);
    await screen.findByTestId("metric-open-tickets");
    expect(screen.getAllByText("Test fixture").length).toBeGreaterThan(0);
    expect(screen.getByText("Foundry not live")).toBeInTheDocument();
  });

  it("shows an error with retry instead of zero metrics when the API fails", async () => {
    ({ restore } = installMockApi(routes({ match: "/api/dashboard", status: 500 })));
    renderPage(<DashboardPage />);
    const alert = await screen.findByText("Dashboard metrics could not be loaded");
    expect(alert).toBeInTheDocument();
    expect(screen.queryByTestId("metric-open-tickets")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("requires confirmation in a dialog before resetting demo data", async () => {
    const user = userEvent.setup();
    const mock = installMockApi([
      ...routes(),
      { method: "POST", match: "/api/demo/reset", json: { status: "refreshed" } },
    ]);
    restore = mock.restore;
    renderPage(<DashboardPage />);
    await user.click(await screen.findByTestId("reset-demo"));
    expect(screen.getByRole("dialog", { name: "Reset synthetic demo data" })).toBeInTheDocument();
    expect(mock.requests.some((request) => request.method === "POST")).toBe(false);
    await user.click(screen.getByTestId("confirm-reset-demo"));
    expect(await screen.findByTestId("reset-demo-status")).toBeInTheDocument();
  });

  it("hides the destructive reset action on the public demo", async () => {
    ({ restore } = installMockApi([
      {
        match: "/api/health",
        json: {
          ...HEALTH_TEST_MODE,
          public_demo: true,
          administrative_mutations_enabled: false,
        },
      },
      { match: "/api/dashboard", json: DASHBOARD },
      { match: /^\/api\/tickets\?/, json: TICKET_PAGE },
      { match: /^\/api\/ai-runs/, json: { items: [RUN], total: 1, page: 1, page_size: 20 } },
    ]));
    renderPage(<DashboardPage />);

    await screen.findByTestId("metric-open-tickets");
    expect(screen.queryByTestId("reset-demo")).not.toBeInTheDocument();
  });

  it("uses no dash characters in visible copy", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<DashboardPage />);
    await screen.findByTestId("metric-open-tickets");
    expect(document.body.textContent ?? "").not.toMatch(DASH);
  });
});
