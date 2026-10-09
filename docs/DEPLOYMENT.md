# Deployment

The project is not complete until a public demo works. This document describes the lowest-friction secure path. Terraform and elaborate CI/CD are intentionally out of scope.

## Target

| Piece | Suggested host |
|---|---|
| React frontend | Vercel |
| FastAPI backend | Azure Container Apps |
| PostgreSQL + pgvector | Azure Database for PostgreSQL Flexible Server |
| Models | Microsoft Foundry |

## Environment variables

Copy from `.env.example`. Production must set:

```
APP_ENV=production
APP_MODE=foundry
DATABASE_URL=
DATABASE_URL_SYNC=
CORS_ORIGINS=https://<frontend-domain>
FOUNDRY_PROJECT_ENDPOINT=
FOUNDRY_MODEL=
FOUNDRY_MODELS_ENDPOINT=
FOUNDRY_EMBEDDING_MODEL=
FOUNDRY_EMBEDDING_DIMENSIONS=
DAILY_DEMO_AI_RUN_LIMIT=
DEMO_PUBLIC=true
DEMO_DISABLE_FULL_EVAL=true
ENABLE_SENSITIVE_TELEMETRY=false
```

Use managed identity or a secret store for credentials. Do not bake secrets into images.

## Cost awareness

- Prefer a cost-efficient chat deployment such as `gpt-4o-mini`
- Prefer `text-embedding-3-small`
- Daily demo AI-run quota is mandatory
- Full evaluation runs are disabled for anonymous users
- One revision maximum
- Bounded ticket size, upload size, `top_k`, and output tokens

Azure PostgreSQL, Container Apps, Foundry inference, and Vercel bandwidth all incur recurring cost. Delete unused deployments if the demo is paused.

## Backend container

Multi-stage Docker build in `docker/backend.Dockerfile`. Health check: `GET /api/health`.

Run migrations before serving:

```
alembic upgrade head
```

Then seed demo data if the database is empty:

```
python -m scripts.seed
```

## Frontend

Build with `VITE_API_BASE_URL` pointing at the public API.

## Smoke test after deploy

1. Open the public URL without developer tools
2. Dashboard loads with real seeded metrics
3. Open a demo ticket
4. Run AI analysis only if `APP_MODE=foundry`
5. Confirm citations open real chunks
6. Approve or edit a draft
7. Confirm an AI run appears
8. Confirm no secrets in the browser bundle

Until that smoke test succeeds, `CV_CLAIMS_MATRIX.md` must not mark claims Live Verified.

## Current status

Live deployment is blocked on Adel creating Azure / Foundry / Vercel resources.
