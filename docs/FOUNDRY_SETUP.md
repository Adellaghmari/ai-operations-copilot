# Microsoft Foundry setup

Do not paste secrets into source files or into a public chat. Put configuration in `.env` only.

This project authenticates with Microsoft Entra ID only (`az login` locally, managed identity in Azure). Do not use a Foundry API key.

## Azure resources already created

- Foundry project: `ai-operations-copilot`
- Chat deployment: `gpt-5-mini`
- Embedding deployment: `text-embedding-3-small`

## Environment variables

```
APP_MODE=foundry
FOUNDRY_PROJECT_ENDPOINT=https://adel-ai-operations-foundry.services.ai.azure.com/api/projects/ai-operations-copilot
FOUNDRY_MODEL=gpt-5-mini
FOUNDRY_MODELS_ENDPOINT=https://adel-ai-operations-foundry.services.ai.azure.com/openai/v1
FOUNDRY_EMBEDDING_MODEL=text-embedding-3-small
FOUNDRY_EMBEDDING_DIMENSIONS=1536
```

Chat uses `FoundryChatClient` against the project endpoint. Embeddings use the Azure OpenAI v1 endpoint, not the project endpoint. The installed `FoundryEmbeddingClient` requires an API key, so the application uses Entra + `OpenAI.embeddings.create` instead.

## Authentication

Install Azure CLI, then run `az login`. Application code uses `DefaultAzureCredential`. Do not substitute an API key.

## Live smoke tests

After `az login` succeeds:

```
cd backend
$env:RUN_FOUNDRY_SMOKE=1
python -m pytest tests/test_foundry_smoke.py -m cloud
```

A portal deployment existing is not the same as application integration. These tests must call the application providers.

## After a successful smoke test

Deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md). A chat or embedding smoke test does not by itself prove retrieval, assurance, or the public demo.
