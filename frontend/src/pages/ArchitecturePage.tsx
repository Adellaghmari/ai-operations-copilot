import { Link } from "react-router-dom";
import { Card, Eyebrow, PageHeader } from "../components/ui";

const CONTROL: { title: string; body: string; kind: "agent" | "code" | "human"; to: string; link: string }[] = [
  {
    title: "Three AI agents",
    body: "Triage classifies the case. Resolution proposes an action and a draft. Review challenges that draft. There is no fourth agent.",
    kind: "agent",
    to: "/ai-runs",
    link: "Inspect stored AI runs",
  },
  {
    title: "Deterministic application logic",
    body: "Hybrid retrieval, Reciprocal Rank Fusion, the Decision Assurance Engine, the Evidence Ledger, and Decision Replay are ordinary code. They do not guess.",
    kind: "code",
    to: "/assurance",
    link: "Open Decision Assurance",
  },
  {
    title: "Human decision",
    body: "A person approves, edits, rejects, regenerates, or escalates. The AI never sends a customer message.",
    kind: "human",
    to: "/feedback",
    link: "See recorded decisions",
  },
];

const LAYERS: { title: string; items: string; to?: string; link?: string }[] = [
  {
    title: "React frontend",
    items: "TypeScript, Vite, Tailwind CSS, TanStack Query. The interface is project owned. It presents stored runs; it does not invent scores.",
    to: "/",
    link: "Open the dashboard",
  },
  {
    title: "FastAPI backend",
    items: "Python, Pydantic, SQLAlchemy, Alembic. The sequential workflow and assurance gates live here.",
  },
  {
    title: "PostgreSQL and pgvector",
    items: "Tickets, runs, feedback, and knowledge chunks. Vector search sits beside full text search.",
    to: "/knowledge",
    link: "Open the knowledge base",
  },
  {
    title: "Hybrid retrieval",
    items: "A query is matched twice, then merged by Reciprocal Rank Fusion. The fused score is a rank, not correctness.",
  },
  {
    title: "Microsoft Agent Framework",
    items: "Application owned agents call the Foundry Responses API when APP_MODE is foundry and endpoints exist.",
  },
  {
    title: "Foundry Responses API",
    items: "Chat uses the Foundry project endpoint. Embeddings use Azure OpenAI v1 with Entra authentication. Only a successful foundry run may be labelled Microsoft Foundry.",
    to: "/about",
    link: "Read fixture versus Foundry",
  },
  {
    title: "Decision Assurance Engine",
    items: "Gates, coverage, conflicts, Safe Abstention, the Evidence Ledger, and the Decision Packet. Deterministic logic around the three agents, not a model.",
    to: "/assurance",
    link: "Inspect assurance on stored runs",
  },
  {
    title: "Public demo hosting",
    items: "The API runs on Azure Container Apps with Azure Database for PostgreSQL. The frontend is on Vercel.",
  },
];

const KIND = { agent: "Agent", code: "Application code", human: "Human" } as const;

export function ArchitecturePage() {
  return (
    <div className="space-y-10">
      <div className="ambient-hero">
        <PageHeader
          eyebrow="Project"
          title="Architecture"
          display
          description="How control is split. Agents propose. Application code challenges. A human decides. Nothing here is a chatbot glued to a dashboard template."
        />
      </div>

      <section aria-labelledby="control-heading" className="space-y-4">
        <div>
          <h2 id="control-heading" className="text-xl font-semibold text-ink">
            Who does what
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Colour marks the kind of work. Violet is an agent. Lime is human control. Graphite is application code.
          </p>
        </div>
        <ol className="m-0 grid list-none gap-4 p-0 lg:grid-cols-3">
          {CONTROL.map((item) => (
            <li key={item.title}>
              <Card
                className={
                  item.kind === "agent"
                    ? "h-full border-t-2 border-t-violet"
                    : item.kind === "human"
                      ? "h-full border-t-2 border-t-lime"
                      : "h-full border-t-2 border-t-line-strong"
                }
              >
                <Eyebrow tone={item.kind === "human" ? "lime" : "violet"}>{KIND[item.kind]}</Eyebrow>
                <h3 className="mt-2 text-lg font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                <Link className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-lime" to={item.to}>
                  {item.link}
                </Link>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="layers-heading" className="space-y-4">
        <h2 id="layers-heading" className="text-xl font-semibold text-ink">
          Runtime layers
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {LAYERS.map((layer) => (
            <li key={layer.title}>
              <Card className="h-full">
                <h3 className="text-base font-semibold text-ink">{layer.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{layer.items}</p>
                {layer.to && layer.link ? (
                  <Link className="mt-3 inline-block text-sm font-medium underline underline-offset-2 hover:text-lime" to={layer.to}>
                    {layer.link}
                  </Link>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted">
        For product intent and honesty rules, read{" "}
        <Link className="underline hover:text-lime" to="/about">
          About the Project
        </Link>
        .
      </p>
    </div>
  );
}
