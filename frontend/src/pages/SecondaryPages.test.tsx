import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell, NAV_GROUPS } from "../components/AppShell";
import {
  CHUNKS,
  DOCUMENTS,
  FEEDBACK,
  HEALTH_TEST_MODE,
  RUN,
  TICKET_PAGE,
} from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import { renderPage } from "../test/render";
import { AboutPage } from "./AboutPage";
import { AiRunsPage } from "./AiRunsPage";
import { FeedbackPage } from "./FeedbackPage";
import { KnowledgePage } from "./KnowledgePage";

const DASH = /[\u2013\u2014]|\s-\s/;

describe("secondary pages", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  describe("KnowledgePage", () => {
    it("shows documents, opens an accessible details drawer, and lists chunks", async () => {
      const user = userEvent.setup();
      ({ restore } = installMockApi([
        { match: "/api/knowledge", json: DOCUMENTS },
        { match: "/api/knowledge/d1/chunks", json: CHUNKS },
      ]));
      renderPage(<KnowledgePage />, { path: "/knowledge" });
      expect(await screen.findByText("Password reset guide")).toBeInTheDocument();
      expect(screen.getByTestId("knowledge-count")).toHaveTextContent("1 document, 3 chunks");
      await user.click(screen.getByRole("button", { name: "View details and chunks" }));
      const drawer = screen.getByRole("dialog", { name: "Password reset guide" });
      expect(drawer).toHaveAttribute("aria-modal", "true");
      expect(await within(drawer).findByText(/Chunk 1: Expiry/)).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("explains the consequence before deleting and can be cancelled", async () => {
      const user = userEvent.setup();
      const mock = installMockApi([{ match: "/api/knowledge", json: DOCUMENTS }]);
      restore = mock.restore;
      renderPage(<KnowledgePage />, { path: "/knowledge" });
      await user.click(await screen.findByRole("button", { name: "Delete document" }));
      const dialog = screen.getByRole("dialog", { name: "Delete this document?" });
      expect(dialog).toHaveTextContent("can no longer cite it");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(mock.requests.some((request) => request.method === "DELETE")).toBe(false);
    });

    it("shows an error, not an empty list, when documents cannot load", async () => {
      ({ restore } = installMockApi([{ match: "/api/knowledge", status: 500 }]));
      renderPage(<KnowledgePage />, { path: "/knowledge" });
      expect(await screen.findByText("The knowledge base could not be loaded")).toBeInTheDocument();
      expect(screen.queryByText("No documents are indexed")).not.toBeInTheDocument();
    });

    it("shows an empty state when the API answered with no documents", async () => {
      ({ restore } = installMockApi([{ match: "/api/knowledge", json: [] }]));
      renderPage(<KnowledgePage />, { path: "/knowledge" });
      expect(await screen.findByText("No documents are indexed")).toBeInTheDocument();
    });

    it("keeps administrative knowledge actions out of the public demo", async () => {
      ({ restore } = installMockApi([
        {
          match: "/api/health",
          json: {
            ...HEALTH_TEST_MODE,
            public_demo: true,
            administrative_mutations_enabled: false,
          },
        },
        { match: "/api/knowledge", json: DOCUMENTS },
      ]));
      renderPage(<KnowledgePage />, { path: "/knowledge" });
      expect(await screen.findByText("Public demo knowledge")).toBeInTheDocument();
      expect(screen.queryByLabelText("Choose a file")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete document" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View details and chunks" })).toBeInTheDocument();
    });
  });

  describe("FeedbackPage", () => {
    it("distinguishes an empty result from a failure", async () => {
      ({ restore } = installMockApi([{ match: "/api/feedback", json: FEEDBACK }]));
      renderPage(<FeedbackPage />, { path: "/feedback" });
      expect(await screen.findByText("No human decisions or labels are recorded yet")).toBeInTheDocument();
      expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(3);
    });

    it("shows an error with retry when the API fails", async () => {
      ({ restore } = installMockApi([{ match: "/api/feedback", status: 500 }]));
      renderPage(<FeedbackPage />, { path: "/feedback" });
      expect(await screen.findByText("Feedback could not be loaded")).toBeInTheDocument();
      expect(screen.queryByText("No human decisions or labels are recorded yet")).not.toBeInTheDocument();
    });

    it("shows aggregates the API supports", async () => {
      ({ restore } = installMockApi([
        {
          match: "/api/feedback",
          json: { ...FEEDBACK, total: 3, by_label: { minor_edits: 2, bad_tone: 1 }, approval_rate: 0.5, average_edit_distance_ratio: 0.12 },
        },
      ]));
      renderPage(<FeedbackPage />, { path: "/feedback" });
      expect(await screen.findByText("Minor edits")).toBeInTheDocument();
      expect(screen.getByTestId("edit-distance")).toHaveTextContent("0.12");
    });
  });

  describe("AiRunsPage", () => {
    it("labels fixture runs as fixtures in the list", async () => {
      ({ restore } = installMockApi([
        { match: /^\/api\/ai-runs\?/, json: { items: [RUN], total: 1, page: 1, page_size: 20 } },
        { match: /^\/api\/tickets\?/, json: TICKET_PAGE },
      ]));
      renderPage(<AiRunsPage />, { path: "/ai-runs" });
      const table = await screen.findByRole("table");
      expect(within(table).getByText("Test fixture")).toBeInTheDocument();
      expect(within(table).queryByText("Microsoft Foundry")).not.toBeInTheDocument();
    });

    it("shows a measured pipeline and a fixture notice on the detail view", async () => {
      ({ restore } = installMockApi([{ match: new RegExp(`^/api/ai-runs/${RUN.id}$`), json: RUN }]));
      renderPage(<AiRunsPage />, { path: "/ai-runs/:runId", entry: `/ai-runs/${RUN.id}` });
      const detail = await screen.findByTestId("ai-run-detail");
      expect(within(detail).getByRole("note")).toHaveTextContent(/not a Microsoft Foundry response/i);
      expect(within(detail).getByTestId("run-timeline")).toHaveTextContent("Hybrid retrieval");
      expect(within(detail).getByTestId("run-timeline")).toHaveTextContent("780 ms");
    });

    it("shows an error rather than an empty list when runs cannot load", async () => {
      ({ restore } = installMockApi([
        { match: /^\/api\/ai-runs\?/, status: 500 },
        { match: /^\/api\/tickets\?/, json: TICKET_PAGE },
      ]));
      renderPage(<AiRunsPage />, { path: "/ai-runs" });
      expect(await screen.findByText("AI runs could not be loaded")).toBeInTheDocument();
      expect(screen.queryByText("No AI runs yet")).not.toBeInTheDocument();
    });
  });

  describe("AboutPage", () => {
    it("is titled About the Project and says the engine is not a fourth agent", async () => {
      ({ restore } = installMockApi([{ match: "/api/health", json: HEALTH_TEST_MODE }]));
      renderPage(<AboutPage />, { path: "/about" });
      expect(screen.getByRole("heading", { level: 1, name: "About the Project" })).toBeInTheDocument();
      expect(screen.getAllByText(/not a fourth agent/i).length).toBeGreaterThan(0);
      expect(await screen.findByText("Test fixture mode")).toBeInTheDocument();
      expect(document.body.textContent ?? "").not.toMatch(/shadcn/i);
    });

    it("links only to real routes and has no dash characters", async () => {
      ({ restore } = installMockApi([{ match: "/api/health", json: HEALTH_TEST_MODE }]));
      renderPage(<AboutPage />, { path: "/about" });
      await screen.findByText("Test fixture mode");
      const real = new Set(["/", "/tickets", "/tickets/new", "/knowledge", "/ai-runs", "/evaluations", "/feedback", "/about"]);
      for (const link of screen.getAllByRole("link")) {
        expect(real.has(link.getAttribute("href") ?? "")).toBe(true);
      }
      expect(document.body.textContent ?? "").not.toMatch(DASH);
    });
  });

  describe("AppShell", () => {
    it("labels the About link and honest mode badges, and does not advertise Foundry in test mode", async () => {
      ({ restore } = installMockApi([{ match: "/api/health", json: HEALTH_TEST_MODE }]));
      renderPage(<AppShell />, { path: "/" });
      const nav = screen.getByRole("navigation", { name: "Primary" });
      expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
      expect(within(nav).queryByRole("link", { name: "Architecture" })).not.toBeInTheDocument();
      expect(NAV_GROUPS.flatMap((group) => group.links).length).toBe(8);
      expect(await screen.findByText("Test fixture mode")).toBeInTheDocument();
      expect(screen.queryByText("Foundry live")).not.toBeInTheDocument();
    });

    it("shows API unreachable instead of a mode when health fails", async () => {
      ({ restore } = installMockApi([{ match: "/api/health", networkError: true }]));
      renderPage(<AppShell />, { path: "/" });
      expect(await screen.findByText("API unreachable")).toBeInTheDocument();
    });

    it("collapses the menu on small screens behind an accessible toggle", async () => {
      const user = userEvent.setup();
      ({ restore } = installMockApi([{ match: "/api/health", json: HEALTH_TEST_MODE }]));
      renderPage(<AppShell />, { path: "/" });
      const toggle = screen.getByRole("button", { name: "Menu" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveAttribute("aria-controls", "primary-navigation");
      await user.click(toggle);
      expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    });

    it("has exactly one level one heading slot for pages and a skip link", () => {
      ({ restore } = installMockApi([{ match: "/api/health", json: HEALTH_TEST_MODE }]));
      renderPage(<AppShell />, { path: "/" });
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    });
  });
});
