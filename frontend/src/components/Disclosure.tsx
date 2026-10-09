import { useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Accessible expand and collapse row. The trigger is a real button with aria-expanded and
 * aria-controls, and the panel is hidden from everyone when collapsed.
 */
export function Disclosure({
  title,
  summary,
  trailing,
  defaultOpen = false,
  children,
  className,
  testId,
  headingLevel = 3,
}: {
  title: ReactNode;
  summary?: ReactNode;
  trailing?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
  headingLevel?: 3 | 4;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panelId = `${id}-panel`;
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <div className={cn("rounded-lg border border-line bg-surface", className)} data-testid={testId}>
      <Heading className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lime"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{title}</span>
            {summary ? <span className="mt-0.5 block text-xs text-muted">{summary}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {trailing}
            <span
              aria-hidden="true"
              className={cn(
                "inline-block text-muted motion-safe:transition-transform",
                open ? "rotate-90" : "rotate-0",
              )}
            >
              {"\u25B8"}
            </span>
          </span>
        </button>
      </Heading>
      <div id={panelId} hidden={!open} className="border-t border-line px-4 py-3 text-sm">
        {children}
      </div>
    </div>
  );
}
