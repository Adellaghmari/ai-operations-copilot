import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronRight,
  FlaskConical,
  GitCompare,
  History,
  Inbox,
  Info,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Network,
  Plus,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { describeAppMode } from "../lib/presentation";
import { cn } from "../lib/utils";
import { Badge } from "./ui";
import { Dialog } from "./Dialog";

type NavLinkItem = { to: string; label: string; hint: string; icon: LucideIcon };
type NavGroup = { heading: string; links: NavLinkItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Workspace",
    links: [
      { to: "/", label: "Dashboard", hint: "Queue and assurance signals", icon: LayoutDashboard },
      { to: "/tickets", label: "Ticket queue", hint: "Cases waiting for work", icon: Inbox },
      { to: "/tickets/new", label: "New ticket", hint: "Create a synthetic case", icon: Plus },
    ],
  },
  {
    heading: "Decision intelligence",
    links: [
      { to: "/ai-runs", label: "AI runs", hint: "Stored agent pipelines", icon: Workflow },
      { to: "/replay", label: "Decision Replay", hint: "Compare stored runs of the same ticket", icon: GitCompare },
      { to: "/assurance", label: "Decision Assurance", hint: "Deterministic gates over stored runs", icon: ShieldCheck },
    ],
  },
  {
    heading: "Knowledge and quality",
    links: [
      { to: "/knowledge", label: "Knowledge base", hint: "Documents retrieval can use", icon: BookOpen },
      { to: "/evaluations", label: "Evaluation lab", hint: "Golden cases and outcomes", icon: FlaskConical },
      { to: "/feedback", label: "Feedback", hint: "Recorded human decisions", icon: MessageSquareText },
    ],
  },
  {
    heading: "Project",
    links: [
      { to: "/architecture", label: "Architecture", hint: "Stack and how control is split", icon: Network },
      { to: "/about", label: "About", hint: "Why this project exists", icon: Info },
    ],
  },
];

/** Compact desktop labels. Page headings keep the full product names. */
type RibbonLink = { to: string; label: string; hint: string; icon: LucideIcon };
type RibbonGroup = { id: string; label: string; links: RibbonLink[] };

export const RIBBON_GROUPS: RibbonGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    links: [{ to: "/", label: "Dashboard", hint: "Queue and assurance signals", icon: LayoutDashboard }],
  },
  {
    id: "tickets",
    label: "Tickets",
    links: [
      { to: "/tickets", label: "Ticket queue", hint: "Cases waiting for work", icon: Inbox },
      { to: "/tickets/new", label: "New ticket", hint: "Create a synthetic case", icon: Plus },
    ],
  },
  {
    id: "decision",
    label: "Decision intelligence",
    links: [
      { to: "/ai-runs", label: "AI runs", hint: "Stored agent pipelines", icon: Workflow },
      { to: "/replay", label: "Replay", hint: "Decision Replay", icon: History },
      { to: "/assurance", label: "Assurance", hint: "Decision Assurance", icon: ShieldCheck },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    links: [
      { to: "/knowledge", label: "Knowledge base", hint: "Documents retrieval can use", icon: BookOpen },
      { to: "/evaluations", label: "Evaluation", hint: "Evaluation lab", icon: FlaskConical },
      { to: "/feedback", label: "Feedback", hint: "Recorded human decisions", icon: MessageSquareText },
    ],
  },
  {
    id: "project",
    label: "Project",
    links: [
      { to: "/architecture", label: "Architecture", hint: "Stack and how control is split", icon: Network },
      { to: "/about", label: "About", hint: "Why this project exists", icon: Info },
    ],
  },
];

const CRUMBS: {
  match: (path: string) => boolean;
  group: string;
  label: string;
  parentTo: string | null;
  icon: LucideIcon;
}[] = [
  { match: (path) => path === "/", group: "Workspace", label: "Dashboard", parentTo: null, icon: LayoutDashboard },
  { match: (path) => path === "/tickets/new", group: "Tickets", label: "New ticket", parentTo: "/tickets", icon: Inbox },
  { match: (path) => /^\/tickets\/[^/]+$/.test(path), group: "Tickets", label: "Ticket", parentTo: "/tickets", icon: Inbox },
  { match: (path) => path === "/tickets", group: "Tickets", label: "Ticket queue", parentTo: null, icon: Inbox },
  { match: (path) => /^\/ai-runs\/[^/]+$/.test(path), group: "Decision intelligence", label: "AI run", parentTo: "/ai-runs", icon: Workflow },
  { match: (path) => path === "/ai-runs", group: "Decision intelligence", label: "AI runs", parentTo: null, icon: Workflow },
  { match: (path) => path === "/replay", group: "Decision intelligence", label: "Decision Replay", parentTo: "/ai-runs", icon: Workflow },
  { match: (path) => path === "/assurance", group: "Decision intelligence", label: "Decision Assurance", parentTo: "/ai-runs", icon: Workflow },
  { match: (path) => path === "/knowledge", group: "Knowledge", label: "Knowledge base", parentTo: null, icon: BookOpen },
  { match: (path) => path === "/evaluations", group: "Knowledge", label: "Evaluation lab", parentTo: "/knowledge", icon: BookOpen },
  { match: (path) => path === "/feedback", group: "Knowledge", label: "Feedback", parentTo: "/knowledge", icon: BookOpen },
  { match: (path) => path === "/architecture", group: "Project", label: "Architecture", parentTo: null, icon: Network },
  { match: (path) => path === "/about", group: "Project", label: "About", parentTo: "/architecture", icon: Network },
];

function crumbFor(path: string): { group: string; label: string; parentTo: string | null; icon: LucideIcon } {
  return (
    CRUMBS.find((item) => item.match(path)) ?? {
      group: "Workspace",
      label: "Workspace",
      parentTo: null,
      icon: LayoutDashboard,
    }
  );
}

function Brand({ compact = false, testId }: { compact?: boolean; testId?: string }) {
  return (
    <NavLink
      to="/"
      aria-label="AI Operations Copilot home"
      className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      data-testid={testId}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-violet/15 ring-1 ring-violet/35",
          compact ? "h-9 w-9" : "h-10 w-10",
        )}
      >
        <Sparkles className={cn("text-violet", compact ? "h-4 w-4" : "h-[18px] w-[18px]")} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-violet">
          Decision intelligence
        </span>
        <span
          className={cn(
            "block font-semibold tracking-tight text-ink",
            compact ? "text-sm leading-tight" : "text-base leading-tight",
          )}
        >
          AI Operations Copilot
        </span>
      </span>
    </NavLink>
  );
}

function RuntimeStatus({
  mode,
  usesFoundry,
  healthError,
  ready,
}: {
  mode: ReturnType<typeof describeAppMode> | null;
  usesFoundry: boolean;
  healthError: boolean;
  ready?: { database: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" aria-live="polite">
      {mode && !healthError ? (
        <>
          <Badge tone={mode.tone} title={mode.detail}>
            {mode.label}
          </Badge>
          {!usesFoundry ? <Badge tone="neutral">Foundry not advertised</Badge> : null}
        </>
      ) : healthError ? (
        <Badge tone="bad" title="The health endpoint did not respond.">
          API unreachable
        </Badge>
      ) : (
        <Badge tone="neutral">Checking API</Badge>
      )}
      {ready ? (
        <Badge
          tone={ready.database ? "good" : "bad"}
          title={ready.database ? "PostgreSQL answered a readiness check." : "PostgreSQL did not answer."}
        >
          {ready.database ? "Database ready" : "Database not ready"}
        </Badge>
      ) : null}
    </div>
  );
}

function DesktopProductNav() {
  return (
    <nav id="primary-navigation" aria-label="Primary" data-testid="desktop-navigation">
      <ul className="m-0 flex w-full list-none items-stretch gap-1 overflow-hidden rounded-xl border border-white/10 bg-[#12151c] p-1">
        {RIBBON_GROUPS.map((group) => (
          <li key={group.id} className="min-w-max flex-1 rounded-lg bg-violet/15 px-2 py-2">
            <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-violet">
              {group.label}
            </p>
            <div className="mt-2.5 flex flex-nowrap items-center gap-1.5">
              {group.links.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/" || link.to === "/tickets" || link.to === "/tickets/new"}
                    title={link.hint}
                    className={({ isActive }) =>
                      cn(
                        "group/route inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[13px] font-semibold leading-none text-ink",
                        "border-white/35 bg-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.35)]",
                        "hover:border-violet/70 hover:bg-violet/30 hover:text-white",
                        "motion-safe:transition motion-safe:duration-150 motion-safe:hover:-translate-y-px",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
                        isActive && "border-lime/60 bg-lime/15 text-lime shadow-[inset_0_-2px_0_0_var(--color-lime)]",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          aria-hidden="true"
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-violet group-hover/route:text-lime",
                            isActive && "text-lime",
                          )}
                        />
                        {link.label}
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 text-violet/50 group-hover/route:text-lime",
                            isActive && "text-lime",
                          )}
                        />
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MobileNavGroups({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav id="mobile-navigation" aria-label="Mobile" data-testid="mobile-navigation">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="mb-5">
          <p className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-faint">{group.heading}</p>
          <ul className="m-0 list-none space-y-0.5 p-0">
            {group.links.map((link) => {
              const Icon = link.icon;
              return (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === "/" || link.to === "/tickets"}
                    title={link.hint}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                        isActive
                          ? "bg-lime font-semibold text-lime-ink"
                          : "text-ink-soft hover:bg-white/[0.04] hover:text-ink",
                      )
                    }
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="min-w-0">
                      <span className="block">{link.label}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted">{link.hint}</span>
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Crumb({ path }: { path: string }) {
  const crumb = crumbFor(path);
  const Icon = crumb.icon;
  const parent =
    crumb.parentTo && crumb.parentTo !== path ? (
      <Link
        to={crumb.parentTo}
        className="truncate rounded-sm font-medium text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {crumb.group}
      </Link>
    ) : (
      <span className="truncate font-medium text-ink-soft">{crumb.group}</span>
    );
  return (
    <nav aria-label="Page context" data-testid="topbar-crumb" className="min-w-0">
      <ol className="m-0 inline-flex max-w-full list-none items-center gap-1.5 rounded-full border border-violet/30 bg-[#12151c] px-2.5 py-1 text-xs shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        <li className="flex min-w-0 items-center gap-1.5">
          <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-violet" />
          {parent}
        </li>
        <li aria-hidden="true" className="text-violet">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li className="truncate font-semibold text-ink" aria-current="page">
          {crumb.label}
        </li>
      </ol>
    </nav>
  );
}

function ShellHeader({
  path,
  menuOpen,
  onMenu,
  mode,
  usesFoundry,
  healthError,
  ready,
}: {
  path: string;
  menuOpen: boolean;
  onMenu: () => void;
  mode: ReturnType<typeof describeAppMode> | null;
  usesFoundry: boolean;
  healthError: boolean;
  ready?: { database: boolean };
}) {
  const status = (
    <RuntimeStatus mode={mode} usesFoundry={usesFoundry} healthError={healthError} ready={ready} />
  );
  return (
    <header className="border-b border-line bg-[#06050b]/92 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Brand compact />
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink hover:border-lime/50 hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-haspopup="dialog"
          onClick={onMenu}
        >
          {menuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </div>
      <div className="mt-3 lg:hidden">
        <Crumb path={path} />
      </div>
      <div className="mt-3 lg:hidden">{status}</div>

      <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 lg:grid">
        <Crumb path={path} />
        <div className="flex justify-center" data-testid="centered-brand">
          <Brand testId="brand-home" />
        </div>
        <div className="flex justify-end" data-testid="runtime-status">
          <RuntimeStatus mode={mode} usesFoundry={usesFoundry} healthError={healthError} ready={ready} />
        </div>
      </div>
    </header>
  );
}

export function AppShell() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const ready = useQuery({ queryKey: ["ready"], queryFn: api.ready, retry: false });
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const mode = health.data ? describeAppMode(health.data) : null;

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-lime px-3 py-2 text-sm font-medium text-lime-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <div className="sticky top-0 z-30">
        <ShellHeader
          path={location.pathname}
          menuOpen={menuOpen}
          onMenu={() => setMenuOpen((value) => !value)}
          mode={mode}
          usesFoundry={Boolean(health.data?.uses_foundry)}
          healthError={health.isError}
          ready={ready.data}
        />
        <div className="hidden border-b border-line bg-[#0c0e14] px-3 py-2 backdrop-blur lg:block lg:px-5">
          <DesktopProductNav />
        </div>
      </div>
      <Dialog
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Product navigation"
        description="Workspace, decision intelligence, knowledge, and project pages."
        variant="drawer"
        drawerSide="start"
        testId="mobile-nav-dialog"
        closeLabel="Close"
      >
        <MobileNavGroups onNavigate={() => setMenuOpen(false)} />
      </Dialog>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none lg:px-8">
        <RouteErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
