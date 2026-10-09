import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Broken(): never {
  throw new Error("Unexpected response shape");
}

describe("RouteErrorBoundary", () => {
  it("renders children when nothing fails", () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/a">
          <p>Healthy page</p>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText("Healthy page")).toBeInTheDocument();
  });

  it("shows an honest alert with a way out instead of a blank screen", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/a">
          <Broken />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("This page could not be displayed");
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    spy.mockRestore();
  });
});
