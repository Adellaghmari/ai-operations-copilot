import { Card } from "../components/ui";

export function AboutPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Architecture</h1>
      <Card>
        <p className="text-sm text-stone-600">
          AI Operations Copilot is a human-reviewed support workspace. The application owns prompts,
          tools, retrieval, and approval state. Microsoft Foundry supplies model inference when configured.
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-stone-950 p-4 text-xs text-amber-50">
{`Ticket
  → Triage Agent (structured output)
  → Hybrid retrieval (pgvector + full-text + RRF)
  → Resolution Agent
  → Review Agent
  → optional single revision
  → Human approve / edit / reject / regenerate / escalate`}
        </pre>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Stack</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>React, TypeScript, Vite, Tailwind CSS</li>
            <li>FastAPI, Pydantic, SQLAlchemy 2, Alembic</li>
            <li>PostgreSQL and pgvector</li>
            <li>Microsoft Agent Framework sequential workflow</li>
            <li>Foundry Responses API and models-endpoint embeddings</li>
            <li>OpenTelemetry traces for workflow metadata</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Honesty</h2>
          <p className="mt-3 text-sm text-stone-600">
            This page does not claim Foundry is live unless the health endpoint reports
            <code> uses_foundry=true</code>. Test fixture output is labeled. Evaluation numbers appear
            only after a stored run.
          </p>
        </Card>
      </div>
    </div>
  );
}
