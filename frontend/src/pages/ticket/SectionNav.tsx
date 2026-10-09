import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type SectionLink = { id: string; label: string };

export const TICKET_SECTIONS: SectionLink[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "recommendation", label: "AI recommendation" },
  { id: "review", label: "Review" },
  { id: "assurance", label: "Assurance" },
  { id: "decision", label: "Decision" },
  { id: "replay", label: "Replay" },
];

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Sticky in page navigation. Sections stay in one scrolling page, so every section is reachable
 * with a link, a keyboard, and a screen reader. On narrow screens the bar scrolls sideways.
 */
export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  // While a click driven scroll is in flight, scroll events must not fight the chosen section.
  const lockedUntil = useRef(0);

  useEffect(() => {
    // Measured at scroll time, so it works no matter when the sections mount (they appear after
    // the ticket and its runs have loaded).
    const OFFSET = 140;

    function measure() {
      if (Date.now() < lockedUntil.current) return;
      let current: string | null = null;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= OFFSET) current = section.id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && window.scrollY > 0) {
        const last = [...sections].reverse().find((section) => document.getElementById(section.id));
        if (last) current = last.id;
      }
      if (current) setActive(current);
    }

    // Seven rect reads per scroll event is cheap, so no throttling is needed.
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [sections]);

  function go(id: string) {
    const element = document.getElementById(id);
    if (!element) return;
    lockedUntil.current = Date.now() + 900;
    element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    setActive(id);
    // Move focus to the section so keyboard and screen reader users land where they navigated.
    element.focus({ preventScroll: true });
  }

  return (
    <nav
      aria-label="Ticket sections"
      className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:-mx-8 lg:px-8"
      data-testid="ticket-section-nav"
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 py-2">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <button
              type="button"
              onClick={() => go(section.id)}
              aria-current={active === section.id ? "location" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
                active === section.id
                  ? "bg-lime text-lime-ink"
                  : "text-ink-soft hover:bg-surface-3",
              )}
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Anchor target for a ticket section. Focusable so the nav can move focus to it. */
export function TicketSection({
  id,
  title,
  description,
  children,
  testId,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-heading`}
      data-testid={testId}
      className="scroll-mt-16 space-y-4 outline-none"
    >
      <div>
        <h2 id={`${id}-heading`} className="text-xl font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
