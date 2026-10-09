# Deployment

Lowest-friction path for the public demo: Vercel for the frontend, Azure Container Apps for the API, Azure Database for PostgreSQL with pgvector, and Microsoft Foundry for models. Terraform and elaborate CI/CD are out of scope.

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
FOUNDRY_MODEL=gpt-5-mini
FOUNDRY_MODELS_ENDPOINT=
FOUNDRY_EMBEDDING_MODEL=text-embedding-3-small
FOUNDRY_EMBEDDING_DIMENSIONS=1536
DAILY_DEMO_AI_RUN_LIMIT=
DEMO_MAX_TICKETS=250
DEMO_PUBLIC=true
DEMO_DISABLE_FULL_EVAL=true
ENABLE_SENSITIVE_TELEMETRY=false
```

`DEMO_PUBLIC=true` with `APP_ENV=production` keeps synthetic ticket creation, AI runs, human decisions, and replay available. It blocks demo reset, knowledge upload, knowledge deletion, and starting evaluation runs. Public ticket creation is serialized and capped by `DEMO_MAX_TICKETS`. Initial AI runs and regenerations share the daily guest quota, and an AI run accepts only one human decision.

Use Microsoft Entra (`DefaultAzureCredential` / managed identity). Do not use Foundry API keys. Do not bake secrets into images.

`DATABASE_URL` and `DATABASE_URL_SYNC` are Container Apps secrets. Do not print them.

## Cost awareness

- Prefer a cost-efficient chat deployment such as `gpt-5-mini`
- Prefer `text-embedding-3-small`
- Daily demo AI-run quota is mandatory
- Full evaluation runs are disabled for anonymous users
- One revision maximum
- Bounded ticket size, upload size, `top_k`, and output tokens

Azure PostgreSQL, Container Apps, Foundry inference, and Vercel bandwidth all incur recurring cost. Exact SKUs are listed in this document. Monthly dollar figures are estimates, not invoices: Burstable `Standard_B1ms` PostgreSQL, ACR Basic, and an always-on Consumption replica (min 1) are the standing items; Foundry chat/embeddings and Log Analytics ingestion are usage-based. Keep min replicas at 1 for recruiter reliability. Delete unused deployments if the demo is paused.

## Backend container

Multi-stage Docker build in `docker/backend.Dockerfile`.

- `GET /api/health` is liveness and returns success while the process can serve HTTP.
- `GET /api/ready` checks PostgreSQL and returns HTTP 503 when the required database is unavailable.

Container liveness probes should use `/api/health`. Traffic readiness probes should use `/api/ready`. Revision `0000009` currently has no configured probes; the platform still served health and readiness successfully after deploy.

Run migrations **once** before serving, not on every replica:

```
alembic upgrade head
```

The production container command is uvicorn only:

```
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`APP_ENV=production` skips startup `create_schema()` and auto-seed. The database is already migrated and seeded. `POST /api/demo/reset` is a local or private administrative action and is rejected on the anonymous production demo.

Then seed demo data if the database is empty:

```
APP_MODE=foundry python -m scripts.seed
```

`CREATE EXTENSION vector` must run outside the SQLAlchemy transaction (AUTOCOMMIT). Azure must allowlist `vector` on `azure.extensions` first.

Async URLs use `ssl=require`. Sync/Alembic URLs use `sslmode=require`. Do not swap those query names.

## Public backend (Azure Container Apps)

Public API:

`https://ai-operations-copilot-api.salmonhill-73258b1b.swedencentral.azurecontainerapps.io`

| Resource | Name |
|---|---|
| Resource group | `rg-ai-operations-copilot` (Sweden Central) |
| ACR | `adelaicopilotacr` (Basic, admin user disabled) |
| Image | `adelaicopilotacr.azurecr.io/ai-operations-copilot-api:latest` |
| Environment | `ai-operations-copilot-env` (Consumption) |
| Container App | `ai-operations-copilot-api` |
| Ingress | external HTTPS, target port 8000 |
| Compute | 0.5 vCPU / 1Gi, min 1 / max 2 replicas |
| Identity | system-assigned |

Do not run `az containerapp up --source .` from the repo root. That command looks for a file named `Dockerfile` in the source directory.

`az acr build` (ACR Tasks) is **paused on Azure Free Trial**. This image was built in Azure from `docker/backend.Dockerfile` with repository-root context using a one-off Kaniko Container Instance, then pulled by the app via **AcrPull** and system registry identity. Do not enable the ACR admin user.

The Container Apps environment uses Azure Monitor log destination. Console logs are available with `az containerapp logs show`. Existing Foundry Log Analytics was not attached because that path requires a workspace key.

### Managed identity RBAC

System-assigned principal on `ai-operations-copilot-api`, scoped to existing resources only:

- **Foundry User** (`53ca6127-db72-4b80-b1b0-d745d6d5456d`) on `adel-ai-operations-foundry`
- **Cognitive Services OpenAI User** (`5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`) on `adel-ai-operations-foundry`
- **AcrPull** on `adelaicopilotacr`
- **Monitoring Metrics Publisher** on `adel-ai-operations-foundry-appinsights` only

Do not assign Azure AI Developer, Contributor, or Owner to the workload identity.

### PostgreSQL firewall

Do not enable "Allow public access from all Azure services". Do not open `0.0.0.0/0`.

After deploy, add each Azure-reported Container App `outboundIpAddresses` value as its own start=end firewall rule on `adel-ai-operations-pg`. Keep the developer client-IP rule.

Consumption Container Apps without NAT Gateway use a shared outbound IP pool that **can change**. If `/api/ready` later reports `database: false`, refresh those `aca-*` rules from the current outbound list. Add NAT only if that drift becomes a recurring problem.

## Frontend (Vercel)

Public origin:

https://ai-operations-copilot-eight.vercel.app

Project: `adel-laghmaris-projects/ai-operations-copilot`. Root directory is `frontend/`. Framework is Vite. Build is `npm run build` (`tsc --noEmit && vite build`). Output is `dist/`. SPA routes rewrite to `index.html`.

Production and Preview environment (public configuration, not a secret):

```
VITE_API_BASE_URL=https://ai-operations-copilot-api.salmonhill-73258b1b.swedencentral.azurecontainerapps.io
```

`https://ai-operations-copilot.vercel.app` is a different existing Vercel project. Do not use it. The team alias `https://ai-operations-copilot-adel-laghmaris-projects.vercel.app` is SSO-protected; recruiters should use the public `*-eight.vercel.app` origin.

## CORS

Production Container App `CORS_ORIGINS` is the exact recruiter origin only:

```
https://ai-operations-copilot-eight.vercel.app
```

Localhost is not allowed on the production API. Do not use `*`, `*.vercel.app`, or regex origins.

## Smoke test after deploy

Backend:

1. `GET /api/health` returns `app_mode=foundry`
2. `GET /api/ready` returns `database=true`
3. `POST /api/tickets/{id}/ai-runs` through the public FQDN reaches `awaiting_human` with Foundry + real citations
4. Do not auto-approve a customer response

Full recruiter path:

1. Open https://ai-operations-copilot-eight.vercel.app without developer tools
2. Dashboard loads with real seeded metrics and **Foundry live**
3. Open a demo ticket
4. Run AI analysis (`provider_kind=foundry`, `gpt-5-mini`, `text-embedding-3-small`, one revision, `awaiting_human`)
5. Confirm citations open real chunks (`document_id` + `chunk_id` match `/api/knowledge/chunks/{id}`)
6. Approve or edit a draft through the UI; original and final responses are stored separately
7. Confirm an AI run appears; Feedback stores the label
8. Confirm the browser bundle contains the public API URL and does not contain database passwords, Azure tokens, or Foundry API keys

## Recorded deployment

On 2026-10-09 the Azure subscription was Active, the Container Apps environment was Ready, and revision `ai-operations-copilot-api--0000009` served image `adelaicopilotacr.azurecr.io/ai-operations-copilot-api:release-20261009`. Public `/api/health` returned `app_mode=foundry` and `/api/ready` returned `database=true`. The Vercel production alias `https://ai-operations-copilot-eight.vercel.app` was redeployed the same day. This is a record of that deployment, not a label for later uncommitted work.

Live Foundry runs recorded on that date include `89ec091d-…` on `T-0010` (`NEEDS_ATTENTION`, later human `escalate`) and `fa24e9b1-…` on `T-0001` (`ABSTAINED`). A later chat call hit the 60 second timeout and was stored as `foundry_unavailable`. ACR Tasks remains paused; this image was built locally from `docker/backend.Dockerfile` and pushed to ACR.

## Observability

Reuse existing Application Insights `adel-ai-operations-foundry-appinsights` (workspace `adel-ai-operations-foundry-logs`). Do not create a second App Insights resource.

Production Container Apps:

```
APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:applicationinsights-connection-string
ENABLE_SENSITIVE_TELEMETRY=false
OTEL_SERVICE_NAME=ai-operations-copilot
```

The backend uses `AzureMonitorTraceExporter` (from `azure-monitor-opentelemetry`) plus application spans. Connection-string ingestion is used because passing `DefaultAzureCredential` into `configure_azure_monitor` broke Foundry managed-identity token acquisition on this runtime. `Monitoring Metrics Publisher` remains scoped only to that App Insights resource.

## Demo reset

When enabled in local or private mode, `POST /api/demo/reset` takes a PostgreSQL advisory lock on a dedicated connection so concurrent requests cannot insert duplicate knowledge slugs. Prompt versions are not wiped.
