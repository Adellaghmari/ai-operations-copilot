import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Dialog } from "./Dialog";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div id="root">
      <button onClick={() => setOpen(true)}>Open details</button>
      <Dialog
        open={open}
        title="Decision Assurance Packet"
        description="A record, not an approval."
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button>First action</button>
        <button>Last action</button>
      </Dialog>
    </div>
  );
}

describe("Dialog accessibility", () => {
  it("exposes dialog semantics with a label and description", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open details" }));
    const dialog = screen.getByRole("dialog", { name: "Decision Assurance Packet" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("A record, not an approval.");
  });

  it("moves focus into the dialog and returns it to the opener on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open details" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close Decision Assurance Packet" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open details" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open details" }));
    const close = screen.getByRole("button", { name: "Close Decision Assurance Packet" });
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("makes the page behind the dialog inert while open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const root = document.getElementById("root");
    await user.click(screen.getByRole("button", { name: "Open details" }));
    expect(root).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(root).not.toHaveAttribute("inert");
  });
});
