# Evaluation

Evaluation is a first-class product capability. Only completed real runs are persisted. The UI never invents scores.

## Golden dataset

`evals/golden_cases.jsonl` contains at least 40 inspectable synthetic tickets.

Coverage includes:

- account access, billing, bugs, integrations, onboarding, performance
- security-sensitive cases
- feature requests and how-to questions
- service incidents
- ambiguous wording and missing information
- prompt injection in tickets and retrieved documents
- cases that should escalate
- cases where the knowledge base has no answer

Where objectively possible, each case includes expected category, severity range, escalation, relevant document IDs, required facts, and forbidden claims.

## Deterministic metrics

These run locally without a paid judge model:

| Metric | Meaning |
|---|---|
| Classification accuracy | Predicted category equals expected category |
| Severity accuracy | Predicted severity is inside the expected range |
| Retrieval recall at K | Expected document IDs appear in the top-K retrieved set |
| Citation coverage | Cited chunk IDs exist and belong to retrieved or expected sources |
| Escalation accuracy | Escalation decision matches the expected label |
| Structured output validity | Agent payloads pass Pydantic validation |

## Foundry quality metrics

When Foundry credentials are available, the application can call the current Agent Framework `FoundryEvals` helper. That helper is **experimental** in the current `agent-framework-foundry` package. Deterministic metrics remain the generally available default. Do not display Foundry quality scores until a real run completes.

These metrics are not shown until a real run completes.

Public demo users cannot trigger an expensive full evaluation.

## Quality signal shown in the product

Label: **AI quality signal**

Not a confidence percentage.

```
signal = clip(
  0.25 * retrieval_coverage
  + 0.20 * normalized_mean_retrieval_score
  + 0.25 * citation_coverage
  + 0.20 * review_pass
  + 0.10 * information_completeness
)
```

Each term is documented in code (`backend/app/ai/quality.py`) and visible in the AI workspace.

## Comparison

The Evaluation Lab stores dataset version, prompt versions, model deployment, and metric snapshots so two runs can be compared.

## Limitations

- Deterministic metrics cannot judge prose quality.
- LLM-as-judge metrics vary by judge model and cost money.
- A passing score does not mean the recommendation is operationally correct.
