import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ABSTAINED_RUN, RUN, TICKET, TICKET_DETAIL } from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import type { MockRoute } from "../test/mockApi";
import { renderPage } from "../test/render";
import { TicketDetailPage } from "./TicketDetailPage";

const DASH = /[\u2013\u2014]|\s-\s/;

function routesFor(run: typeof RUN | null): MockRoute[] {
  return [
    { match: new RegExp(`^/api/tickets/${TICKET.id}$`), json: TICKET_DETAIL },
    {
      match: /^\/api\/ai-runs\?ticket_id=/,
      json: { items: run ? [run] : [], total: run ? 1 : 0, page: 1, page_size: 20 },
    },
    ...(run ? [{ match: new RegExp(`^/api/ai-runs/${run.id}$`), json: run }] : []),
  ];
}

function renderDetail() {
  return renderPage(<TicketDetailPage />, { path: "/tickets/:ticketId", entry: `/tickets/${TICKET.id}` });
}

function renderGuidedDetail() {
  return renderPage(<TicketDetailPage />, {
    path: "/tickets/:ticketId",
    entry: `/tickets/${TICKET.id}?guide=risky`,
  });
}

describe("TicketDetailPage", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("offers navigation to every section", async () => {
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    const nav = await screen.findByRole("navigation", { name: "Ticket sections" });
    for (const label of ["Overview", "Evidence", "AI recommendation", "Review", "Assurance", "Decision", "Replay"]) {
      expect(within(nav).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("labels a fixture run as a fixture and never as Microsoft Foundry", async () => {
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    const notice = await screen.findByTestId("fixture-notice");
    expect(notice).toHaveTextContent("Test fixture");
    expect(notice).toHaveTextContent(/not a Microsoft Foundry response/i);
    expect(screen.queryByText("Microsoft Foundry")).not.toBeInTheDocument();
  });

  it("explains gates progressively and does not present coverage as correctness", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    const gate = await screen.findByTestId("gate-evidence_coverage");
    const trigger = within(gate).getByRole("button", { name: /Evidence coverage/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(gate).getByText("1 of 2 evidence requiring claims are supported.")).toBeVisible();
    expect(within(gate).getByText(/not the probability that the AI is right/i)).toBeVisible();
  });

  it("shows no confidence or quality percentage", async () => {
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    await screen.findByTestId("assurance-outcome");
    expect(document.body.textContent ?? "").not.toMatch(/\d\s*%/);
  });

  it("uses no dash characters in visible copy", async () => {
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    await screen.findByTestId("assurance-outcome");
    expect(document.body.textContent ?? "").not.toMatch(DASH);
  });

  it("shows the evidence ledger with an inspectable source", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    await screen.findByTestId("assurance-gates");
    const ledger = screen.getByTestId("evidence-ledger");
    expect(within(ledger).getByText("Supported")).toBeInTheDocument();
    expect(within(ledger).getByText("Unsupported")).toBeInTheDocument();
    await user.click(within(ledger).getAllByRole("button", { name: "Inspect provenance" })[0]);
    expect(screen.getByTestId("ledger-provenance-claim-1")).toHaveTextContent("document_id");
    await user.click(within(ledger).getByTestId("ledger-chunk-chunk-1"));
    const snippet = await screen.findByTestId("citation-snippet");
    expect(snippet).toHaveTextContent("document_id");
    expect(snippet).toHaveTextContent("chunk_id");
    expect(snippet).toHaveTextContent("Reset links expire after 60 minutes.");
  });

  it("opens the Decision Packet as an accessible dialog and returns focus", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    const opener = await screen.findByTestId("view-decision-packet");
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Decision Assurance Packet" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("treats abstention as a product decision and disables approval of a missing draft", async () => {
    ({ restore } = installMockApi(routesFor(ABSTAINED_RUN)));
    renderDetail();
    const banner = await screen.findByTestId("abstention-banner");
    expect(banner).toHaveTextContent("abstained on purpose");
    expect(banner).toHaveTextContent("not a failure");
    expect(screen.getByTestId("approve-run")).toBeDisabled();
    expect(screen.getByTestId("edit-and-approve")).toBeDisabled();
    expect(screen.getByTestId("reject-run")).toBeEnabled();
    expect(screen.getByTestId("escalate-run")).toBeEnabled();
  });

  it("places human actions after the assurance section", async () => {
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    const assurance = await screen.findByRole("region", { name: "Assurance" });
    const decision = screen.getByRole("region", { name: "Decision" });
    expect(assurance.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows an honest no analysis state for a ticket without runs", async () => {
    ({ restore } = installMockApi(routesFor(null)));
    renderDetail();
    expect(await screen.findByText(/No AI analysis exists for this ticket yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run AI analysis" })).toBeEnabled();
    expect(screen.queryByTestId("assurance-gates")).not.toBeInTheDocument();
  });

  it("does not show the recruiter walkthrough on an ordinary ticket visit", async () => {
    ({ restore } = installMockApi(routesFor(RUN)));
    renderDetail();
    await screen.findByRole("heading", { name: TICKET.subject });
    expect(screen.queryByTestId("risky-guide")).not.toBeInTheDocument();
  });

  it("opens guided review from URL state and moves to a real section", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi(routesFor(RUN)));
    renderGuidedDetail();
    const guide = await screen.findByTestId("risky-guide");
    expect(guide).toHaveTextContent("What to do on this risky case");
    expect(await screen.findByTestId("recommended-decision-label")).toHaveTextContent("Next recommended action");
    expect(screen.getByTestId("next-recommended-action")).toHaveTextContent("Make the human decision");
    await user.click(screen.getByTestId("guide-step-evidence"));
    expect(document.getElementById("evidence")).toHaveFocus();
    await user.click(screen.getByTestId("hide-risky-guide"));
    expect(screen.getByTestId("show-risky-guide")).toBeInTheDocument();
    await user.click(screen.getByTestId("show-risky-guide"));
    expect(screen.getByTestId("guide-step-understand")).toBeInTheDocument();
  });

  it("recommends the real Run AI analysis control when no run exists", async () => {
    ({ restore } = installMockApi(routesFor(null)));
    renderGuidedDetail();
    expect(await screen.findByTestId("next-recommended-action")).toHaveTextContent("Run the AI analysis");
    expect(screen.getByTestId("recommended-run-label")).toHaveTextContent("Next recommended action");
    expect(screen.getByRole("button", { name: "Run AI analysis" })).toBeEnabled();
  });

  it("shows an error with retry, not an empty page, when the ticket cannot load", async () => {
    ({ restore } = installMockApi([{ match: new RegExp(`^/api/tickets/${TICKET.id}$`), status: 500 }, ...routesFor(null).slice(1)]));
    renderDetail();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This ticket could not be loaded");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
