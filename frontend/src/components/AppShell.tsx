import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { describeAppMode } from "../lib/presentation";
import { cn } from "../lib/utils";
import { Badge } from "./ui";

type NavGroup = { heading: string; links: { to: string; label: string; hint: string }[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Workspace",
    links: [
      { to: "/", label: "Dashboard", hint: "Queue and assurance signals" },
      { to: "/tickets", label: "Ticket queue", hint: "Cases waiting for work" },
      { to: "/tickets/new", label: "New ticket", hint: "Create a synthetic case" },
    ],
  },
  {
    heading: "Knowledge and AI",
    links: [
      { to: "/knowledge", label: "Knowledge base", hint: "Documents retrieval can use" },
      { to: "/ai-runs", label: "AI runs", hint: "Stored agent pipelines" },
      { to: "/evaluations", label: "Evaluation lab", hint: "Golden cases and outcomes" },
      { to: "/feedback", label: "Feedback", hint: "Recorded human decisions" },
    ],
  },
  {
    heading: "Project",
    links: [{ to: "/about", label: "About", hint: "How the system is built" }],
  },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
    isActive
      ? "bg-lime/10 font-medium text-lime ring-1 ring-lime/25"
      : "text-ink-soft hover:bg-surface-2 hover:text-ink",
  );
}

export function AppShell() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const mode = health.data ? describeAppMode(health.data) : null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-lime px-3 py-2 text-sm font-medium text-lime-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <aside className="border-b border-line bg-[#06080c] text-ink lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-3 px-5 py-4 lg:block lg:px-5 lg:py-6">
          <div className="flex gap-3">
            <span aria-hidden="true" className="mt-1 h-9 w-1 shrink-0 rounded-full bg-lime" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-violet">Decision assurance</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-ink">AI Operations Copilot</p>
              <p className="mt-1 hidden text-xs leading-5 text-muted lg:block">Evidence. Challenge. Human Decision.</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm text-ink hover:border-lime/50 hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? "Close menu" : "Menu"}
          </button>
        </div>
        <nav
          id="primary-navigation"
          aria-label="Primary"
          className={cn("px-3 pb-6", menuOpen ? "block" : "hidden", "lg:block")}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
                {group.heading}
              </p>
              <ul className="m-0 list-none space-y-0.5 p-0">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.to === "/" || link.to === "/tickets"}
                      title={link.hint}
                      className={navClass}
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur lg:px-8">
          <p className="max-w-xl text-sm text-muted">
            AI can generate an answer. This system asks whether you should trust it.
          </p>
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {mode && health.data ? (
              <>
                <Badge tone={mode.tone} title={mode.detail}>
                  {mode.label}
                </Badge>
                {!health.data.uses_foundry ? <Badge tone="neutral">Foundry not advertised</Badge> : null}
              </>
            ) : health.isError ? (
              <Badge tone="bad" title="The health endpoint did not respond.">
                API unreachable
              </Badge>
            ) : (
              <Badge tone="neutral">Checking API</Badge>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none lg:px-8">
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}
