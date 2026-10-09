import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { describeAppMode } from "../lib/presentation";
import { cn } from "../lib/utils";
import { Badge, Card, Eyebrow, PageHeader } from "../components/ui";

const FLOW: { title: string; body: string; kind: "agent" | "code" | "human" }[] = [
  { title: "Case", body: "A support ticket arrives. Its text is untrusted content.", kind: "code" },
  { title: "Triage agent", body: "Classifies the case, extracts entities, and notes what is missing.", kind: "agent" },
  {
    title: "Hybrid retrieval",
    body: "Deterministic code finds knowledge chunks with vector search and full text search, merged by Reciprocal Rank Fusion.",
    kind: "code",
  },
  { title: "Resolution agent", body: "Proposes an action and a customer draft with citations.", kind: "agent" },
  {
    title: "Review agent",
    body: "Challenges the draft. It can ask for one revision. A second objection forces human escalation.",
    kind: "agent",
  },
  {
    title: "Decision Assurance Engine",
    body: "Application code applies gates, builds the Evidence Ledger, and may abstain. It is not a model and not a fourth agent.",
    kind: "code",
  },
  { title: "Human decision", body: "A person approves, edits, rejects, regenerates, or escalates.", kind: "human" },
];

const KIND_LABEL = { agent: "Agent", code: "Application code", human: "Human" } as const;

const CONCEPTS: { name: string; text: string }[] = [
  { name: "Evidence Ledger", text: "Each claim in a draft is listed with the retrieved chunk that supports it, or marked unsupported." },
  { name: "Assurance gates", text: "Deterministic checks for evidence support, coverage, missing information, conflicts, unsupported actions, review, and human control. Each shows its reason." },
  { name: "Abstention", text: "When evidence is not enough, the system withholds a draft on purpose. That is a safe outcome, not a failure." },
  { name: "Conflicting evidence", text: "Sources that may disagree are shown side by side. A conflict is a signal to check, not proof." },
  { name: "Decision Packet", text: "A printable record of the case, recommendation, gates, ledger, review, and audit details for one run." },
  { name: "Decision Replay", text: "A deterministic comparison of two stored runs of the same ticket. No model is involved." },
];

const MODES: { mode: string; meaning: string }[] = [
  { mode: "local", meaning: "Tickets, knowledge, and the interface work. AI actions report that Foundry is unavailable unless credentials exist." },
  { mode: "test", meaning: "Deterministic fixtures for automated checks. Output is labelled Test fixture and is never shown as Microsoft Foundry." },
  { mode: "foundry", meaning: "Real Microsoft Foundry chat and embeddings. Only this mode may advertise Foundry, and only when endpoints are configured." },
];

const STACK: { area: string; items: string }[] = [
  { area: "Frontend", items: "React, TypeScript, Vite, Tailwind CSS, TanStack Query" },
  { area: "Backend", items: "Python, FastAPI, Pydantic, SQLAlchemy, Alembic" },
  { area: "Data and retrieval", items: "PostgreSQL, pgvector, full text search, Reciprocal Rank Fusion" },
  { area: "AI", items: "Microsoft Agent Framework, Microsoft Foundry when configured, GPT 5 Mini, text embedding 3 small" },
  { area: "Deployment of the public demo", items: "Azure Container Apps, Azure Database for PostgreSQL, Vercel" },
  { area: "Observability", items: "OpenTelemetry with Application Insights. Ticket text, prompts, and chunk text are not exported." },
];

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h2 id={`${id}-heading`} className="text-xl font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AboutPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const mode = health.data ? describeAppMode(health.data) : null;
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Project"
        title="About the Project"
        description={
          <>
            <p className="font-medium text-ink">The model proposes. The system challenges. The human decides.</p>
            <p className="mt-2">
              AI Operations Copilot is a human reviewed AI workspace for support operations. It is built to show how an
              AI answer can be inspected before anyone acts on it.
            </p>
          </>
        }
      />

      <Block id="problem" title="The problem">
        <p className="max-w-3xl text-sm leading-6 text-ink-soft">
          A language model can write a fluent answer that is wrong, unsupported, or based on conflicting policy. In
          support operations a wrong answer can mean a refund that should not happen or a security check that was
          skipped. The question this project asks is not whether the AI can answer. It asks whether you should trust
          the answer, and what the system can show you to decide.
        </p>
      </Block>

      <Block id="how-it-works" title="How a case flows">
        <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4" data-testid="about-flow">
          {FLOW.map((step, index) => (
            <li key={step.title}>
              <Card className={cn("h-full border-t-2", step.kind === "agent" ? "border-t-violet" : step.kind === "human" ? "border-t-ink-soft" : "border-t-lime")}>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>Step {index + 1}</Eyebrow>
                  <Badge tone={step.kind === "agent" ? "info" : step.kind === "human" ? "good" : "neutral"}>
                    {KIND_LABEL[step.kind]}
                  </Badge>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          There are exactly three agents: Triage, Resolution, and Review. Everything else is ordinary application code.
        </p>
      </Block>

      <Block id="decision-assurance" title="The Decision Assurance Engine">
        <Card>
          <p className="text-sm leading-6 text-ink-soft">
            The engine wraps the three agents with deterministic logic. It reads the draft, the review, and the retrieved
            chunks, then reports gates with reasons, an Evidence Ledger, coverage, conflicts, and an outcome. Gates
            describe the evidence. They are not a confidence percentage and passing them does not make an answer
            correct.
          </p>
        </Card>
        <dl className="m-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONCEPTS.map((concept) => (
            <Card key={concept.name}>
              <dt className="text-sm font-semibold text-ink">{concept.name}</dt>
              <dd className="m-0 mt-1 text-sm text-muted">{concept.text}</dd>
            </Card>
          ))}
        </dl>
      </Block>

      <Block id="retrieval" title="The retrieval stack">
        <Card>
          <p className="text-sm leading-6 text-ink-soft">
            Retrieval is a deterministic step, not an agent. A query is matched against document chunks twice: by
            meaning with pgvector embeddings, and by words with PostgreSQL full text search. Reciprocal Rank Fusion
            merges the two rankings. The fused score is a rank value, not a measure of correctness. You can try it in
            the <Link className="underline" to="/knowledge">knowledge base</Link>.
          </p>
        </Card>
      </Block>

      <Block id="human-control" title="Human control">
        <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>The AI never sends a customer message. Humans own every decision.</li>
          <li>There is at most one revision after a REVISE verdict. After that the case goes to a human.</li>
          <li>Ticket text, uploads, and retrieved chunks are treated as untrusted content.</li>
          <li>
            Every decision is stored and appears in the <Link className="underline" to="/feedback">feedback summary</Link>.
          </li>
        </ul>
      </Block>

      <Block id="fixture-vs-foundry" title="Fixture output versus Foundry">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">This API reports:</span>
          {mode ? (
            <Badge tone={mode.tone} title={mode.detail}>
              {mode.label}
            </Badge>
          ) : health.isError ? (
            <Badge tone="bad">API unreachable</Badge>
          ) : (
            <Badge>Checking API</Badge>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">What each application mode does</caption>
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Mode
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  What it means
                </th>
              </tr>
            </thead>
            <tbody>
              {MODES.map((item) => (
                <tr key={item.mode} className="border-t border-line align-top">
                  <th scope="row" className="px-4 py-2 font-mono text-xs font-medium">
                    {item.mode}
                  </th>
                  <td className="px-4 py-2 text-ink-soft">{item.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Every AI run records its provider. A fixture run is labelled Test fixture wherever it appears. Evaluation
          results come from stored runs of the <Link className="underline" to="/evaluations">evaluation lab</Link>,
          which uses the fixture and says so.
        </p>
      </Block>

      <Block id="stack" title="Stack">
        <dl className="m-0 grid gap-3 sm:grid-cols-2">
          {STACK.map((item) => (
            <Card key={item.area}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">{item.area}</dt>
              <dd className="m-0 mt-1 text-sm text-ink">{item.items}</dd>
            </Card>
          ))}
        </dl>
      </Block>

      <Block id="explore" title="Explore">
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
          <li>
            <Link className="underline" to="/">Dashboard</Link>
          </li>
          <li>
            <Link className="underline" to="/tickets">Ticket queue</Link>
          </li>
          <li>
            <Link className="underline" to="/ai-runs">AI runs</Link>
          </li>
          <li>
            <Link className="underline" to="/evaluations">Evaluation lab</Link>
          </li>
        </ul>
      </Block>

      <p className="border-t border-line pt-4 text-xs text-muted">
        A portfolio project by Adel Laghmari. It shows applied AI engineering practice and is not professional
        employment experience.
      </p>
    </div>
  );
}
