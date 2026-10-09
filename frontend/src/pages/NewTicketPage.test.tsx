import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NewTicketPage } from "./NewTicketPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NewTicketPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("new ticket form has accessible labels", () => {
  renderPage();
  expect(screen.getByLabelText("Subject")).toBeInTheDocument();
  expect(screen.getByLabelText("Description")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create ticket" })).toBeDisabled();
});
