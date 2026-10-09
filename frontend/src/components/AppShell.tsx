import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge } from "./ui";

const links = [
  ["/", "Dashboard"],
  ["/tickets", "Ticket queue"],
  ["/tickets/new", "New ticket"],
  ["/knowledge", "Knowledge base"],
  ["/ai-runs", "AI runs"],
  ["/evaluations", "Evaluation lab"],
  ["/feedback", "Feedback"],
  ["/about", "Architecture"],
];

export function AppShell() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-stone-200 bg-[#2b2118] text-amber-50 lg:border-b-0 lg:border-r">
        <div className="px-5 py-6">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Operations</p>
          <h1 className="mt-1 text-lg font-semibold">AI Operations Copilot</h1>
          <p className="mt-2 text-xs text-amber-100/70">Human reviewed AI for intelligent support operations.</p>
        </div>
        <nav className="flex flex-wrap gap-1 px-3 pb-4 lg:flex-col">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? "bg-amber-100/15 text-white" : "text-amber-100/80 hover:bg-white/5"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white/80 px-6 py-3 backdrop-blur">
          <p className="text-sm text-stone-600">Synthetic demo data. AI output is a recommendation, not a guaranteed fact.</p>
          {health.data ? (
            <div className="flex flex-wrap gap-2">
              <Badge tone={health.data.uses_foundry ? "good" : "warn"}>
                {health.data.uses_foundry ? "Foundry live" : `Mode: ${health.data.app_mode}`}
              </Badge>
              {!health.data.uses_foundry ? (
                <Badge tone="neutral">Foundry not advertised</Badge>
              ) : null}
            </div>
          ) : null}
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
