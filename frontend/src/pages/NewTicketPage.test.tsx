import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CUSTOMER, TICKET_DETAIL } from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import type { MockRoute } from "../test/mockApi";
import { renderPage } from "../test/render";
import { NewTicketPage, validateTicketForm } from "./NewTicketPage";

function renderForm(routes: MockRoute[]) {
  const mock = installMockApi(routes);
  renderPage(<NewTicketPage />, { path: "/tickets/new" });
  return mock;
}

describe("NewTicketPage", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("has accessible labels and a disabled submit until the form is valid", async () => {
    ({ restore } = renderForm([{ match: "/api/customers", json: [CUSTOMER] }]));
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeDisabled();
    await screen.findByRole("option", { name: "Harborline, Nora Hale" });
  });

  it("never falls back silently to a default customer", async () => {
    ({ restore } = renderForm([{ match: "/api/customers", json: [CUSTOMER] }]));
    await screen.findByRole("option", { name: "Harborline, Nora Hale" });
    expect(screen.queryByText(/default first customer/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Customer")).toHaveValue("");
  });

  it("shows a customers loading state", () => {
    ({ restore } = renderForm([{ match: "/api/customers", json: [CUSTOMER], delayMs: 50 }]));
    expect(screen.getByRole("option", { name: "Loading customers" })).toBeInTheDocument();
    expect(screen.getByLabelText("Customer")).toBeDisabled();
  });

  it("shows a customers error with retry and blocks submission", async () => {
    ({ restore } = renderForm([{ match: "/api/customers", status: 500 }]));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Customers could not be loaded");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeDisabled();
  });

  it("explains when no customers exist", async () => {
    ({ restore } = renderForm([{ match: "/api/customers", json: [] }]));
    expect(await screen.findByText("No customers exist yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeDisabled();
  });

  it("shows inline validation after a field is touched", async () => {
    const user = userEvent.setup();
    ({ restore } = renderForm([{ match: "/api/customers", json: [CUSTOMER] }]));
    await screen.findByRole("option", { name: "Harborline, Nora Hale" });
    await user.type(screen.getByLabelText("Subject"), "Hi");
    await user.tab();
    expect(await screen.findByText(/at least 3 characters/)).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveAttribute("aria-invalid", "true");
  });

  it("submits a valid ticket and sends the chosen customer", async () => {
    const user = userEvent.setup();
    const mock = renderForm([
      { match: "/api/customers", json: [CUSTOMER] },
      { method: "POST", match: "/api/tickets", json: TICKET_DETAIL },
      { match: /^\/api\/tickets\/.+/, json: TICKET_DETAIL },
    ]);
    restore = mock.restore;
    await screen.findByRole("option", { name: "Harborline, Nora Hale" });
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER.id);
    await user.type(screen.getByLabelText("Subject"), "Cannot sign in");
    await user.type(screen.getByLabelText("Description"), "Users cannot sign in after the SSO change.");
    const submit = screen.getByRole("button", { name: "Create ticket" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(mock.requests.some((request) => request.method === "POST")).toBe(true));
    const post = mock.requests.find((request) => request.method === "POST");
    expect(JSON.parse(post?.body ?? "{}")).toMatchObject({ customer_id: CUSTOMER.id, subject: "Cannot sign in" });
  });

  it("shows a submission error without losing the form", async () => {
    const user = userEvent.setup();
    ({ restore } = renderForm([
      { match: "/api/customers", json: [CUSTOMER] },
      { method: "POST", match: "/api/tickets", status: 400, body: JSON.stringify({ detail: "Ticket exceeds the maximum length" }) },
    ]));
    await screen.findByRole("option", { name: "Harborline, Nora Hale" });
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER.id);
    await user.type(screen.getByLabelText("Subject"), "Cannot sign in");
    await user.type(screen.getByLabelText("Description"), "Users cannot sign in after the SSO change.");
    await user.click(screen.getByRole("button", { name: "Create ticket" }));
    expect(await screen.findByText("Ticket exceeds the maximum length")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("Cannot sign in");
  });
});

describe("validateTicketForm", () => {
  it("mirrors the backend limits", () => {
    expect(validateTicketForm({ customerId: "x", subject: "ab", body: "short" })).toMatchObject({
      subject: expect.stringContaining("3"),
      body: expect.stringContaining("10"),
    });
    expect(validateTicketForm({ customerId: "", subject: "Valid subject", body: "A long enough body." }).customer).not.toBeNull();
    expect(
      validateTicketForm({ customerId: "x", subject: "Valid subject", body: "A long enough body." }),
    ).toEqual({ customer: null, subject: null, body: null });
  });
});
