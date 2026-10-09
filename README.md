# AI Operations Copilot

Human reviewed AI for intelligent support operations.

AI Operations Copilot is a support operations workspace. It receives a customer issue, runs a structured three-agent workflow, retrieves internal knowledge with hybrid search, drafts a grounded recommendation, reviews that draft for unsupported claims, and requires a human decision before anything is treated as accepted.

This is a portfolio project by Adel Laghmari. It demonstrates applied AI engineering. It does not imply professional employment experience with these technologies.

## Live demo

Not deployed yet. The public URL will be added here after a successful smoke test.

## Screenshots

Placeholders until the UI is built and captured:

- Dashboard
- Ticket queue
- AI workspace
- Knowledge base
- Evaluation lab

## What the product does

1. Understand and triage the ticket
2. Retrieve relevant knowledge with vector + lexical hybrid search
3. Generate a grounded resolution and customer draft
4. Review the draft for grounding, tone, and escalation rules
5. Allow one bounded revision
6. Require human approve / edit / reject / regenerate / escalate
7. Store feedback and AI run metadata
8. Evaluate the system over time

The AI never sends a message to an external customer.

## Architecture

```
React (Vite)  →  FastAPI  →  PostgreSQL + pgvector
                     ↓
         Microsoft Agent Framework
                     ↓
     Microsoft Foundry Responses API
```

Three specialized agents plus one deterministic retrieval executor:

`Ticket → Triage → Hybrid retrieval → Resolution → Review → optional single revision → Human review`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/AI_SYSTEM_DESIGN.md](docs/AI_SYSTEM_DESIGN.md).

## Technology stack

- Python, FastAPI, Pydantic, SQLAlchemy 2, Alembic
- React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- PostgreSQL, pgvector
- Microsoft Agent Framework
- Microsoft Foundry (chat via project endpoint, embeddings via models endpoint)
- OpenTelemetry
- Docker Compose
- pytest, Vitest, Playwright

## Modes

| `APP_MODE` | Meaning |
|---|---|
| `local` | Full product except live model calls. AI actions report Foundry unavailable if credentials are missing. |
| `test` | Deterministic fixtures for automated tests. Never presented as Foundry. |
| `foundry` | Real Foundry chat and embeddings. |

## Local setup

1. Copy `.env.example` to `.env`.
2. Start the stack:

```bash
docker compose -f docker/docker-compose.yml up --build
```

3. Open `http://localhost:5173`.
4. API docs: `http://localhost:8000/docs`.

Without Docker, run PostgreSQL with pgvector, then:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --app-dir .
```

```bash
cd frontend
npm install
npm run dev
```

## Environment configuration

See `.env.example`. Foundry variables are required only for `APP_MODE=foundry`.

Do not commit secrets. Do not paste keys into source files.

## Tests

```bash
cd backend
python -m pytest
```

```bash
cd frontend
npm test
npx playwright test
```

Cloud model tests are skipped unless explicitly opted in.

## Evaluation

```bash
cd backend
python -m evals.run_deterministic
```

Full Foundry quality evaluations require credentials and are disabled for anonymous demo users.

## Responsible AI

AI output is a recommendation. A human must review it. See [docs/RESPONSIBLE_AI.md](docs/RESPONSIBLE_AI.md).

## Limitations

- Live Foundry integration requires Adel's Azure project and model deployments.
- Public demo will enforce daily AI-run quotas.
- Quality signals are evidence measures, not probabilities of correctness.
- Prompt-injection defenses reduce risk; they do not eliminate it.

## Project status

See [PROJECT_STATUS.md](PROJECT_STATUS.md) and [CV_CLAIMS_MATRIX.md](CV_CLAIMS_MATRIX.md).
