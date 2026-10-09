import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Disclosure } from "./Disclosure";
import { QueryState } from "./QueryState";

type Fake<T> = Parameters<typeof QueryState<T>>[0]["query"];

function fake<T>(overrides: Partial<Fake<T>>): Fake<T> {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn() as unknown as Fake<T>["refetch"],
    ...overrides,
  } as Fake<T>;
}

describe("QueryState runtime states", () => {
  it("shows an accessible loading state while pending", () => {
    render(
      <QueryState query={fake<string[]>({ isPending: true })} label="Tickets">
        {(items) => <p>{items.length}</p>}
      </QueryState>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading Tickets");
  });

  it("shows an error with retry, and never the empty state, when the request failed", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    render(
      <QueryState
        query={fake<string[]>({ isError: true, error: new Error("Boom"), refetch: refetch as never })}
        label="Tickets"
        isEmpty={(items) => items.length === 0}
        empty={<p>No tickets match</p>}
      >
        {(items) => <p>{items.length}</p>}
      </QueryState>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Tickets could not be loaded");
    expect(screen.queryByText("No tickets match")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state only when the API answered with nothing", () => {
    render(
      <QueryState
        query={fake<string[]>({ data: [] })}
        label="Tickets"
        isEmpty={(items) => items.length === 0}
        empty={<p>No tickets match</p>}
      >
        {(items) => <p>{items.length}</p>}
      </QueryState>,
    );
    expect(screen.getByText("No tickets match")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps stale data visible with a degraded notice when a refresh fails", () => {
    render(
      <QueryState
        query={fake<string[]>({ data: ["T-0001"], isError: true, error: new Error("Boom") })}
        label="Tickets"
      >
        {(items) => <p>{items.join(",")}</p>}
      </QueryState>,
    );
    expect(screen.getByText("T-0001")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing the last data that loaded");
  });

  it("renders data on success", () => {
    render(
      <QueryState query={fake<string[]>({ data: ["a", "b"] })} label="Tickets">
        {(items) => <p>{items.length} items</p>}
      </QueryState>,
    );
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });
});

describe("Disclosure", () => {
  it("toggles aria-expanded and hides the panel when collapsed", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Evidence coverage" summary="How many claims are supported">
        <p>Reason text</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: /Evidence coverage/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reason text")).not.toBeVisible();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Reason text")).toBeVisible();
    expect(trigger).toHaveAttribute("aria-controls");
  });

  it("is reachable and operable with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Gate">
        <p>Body</p>
      </Disclosure>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Gate" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Body")).toBeVisible();
  });
});
