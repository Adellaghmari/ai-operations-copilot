# Evaluation

Evaluation is a first-class product capability. Only completed real runs are persisted. The UI never invents scores.

## Golden dataset

`evals/golden_cases.jsonl` contains 44 inspectable synthetic tickets (`golden-v2`).

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

## Current Evaluation Lab path

The application Evaluation Lab runs the deterministic fixture provider over all 44 cases. Retrieval is intentionally empty in this path. The UI therefore presents retrieval recall and citation coverage as **Not measured**, even though the stored evaluation record keeps schema-compatible metric fields.

| Metric | Meaning |
|---|---|
| Classification check | Fixture category equals the expected category |
| Severity check | Fixture severity is inside the expected range |
| Escalation check | Fixture escalation decision matches the expected label |
| Structured output validity | Typed fixture output passes Pydantic validation by construction |
| Retrieval recall at K | Not measured in the current lab path |
| Citation coverage | Not measured in the current lab path |

The assurance engine, retrieval, citations, replay, and revision bounds have separate unit and browser coverage. Their tests are not aggregated into an Evaluation Lab score.

## Foundry quality metrics

Do not invent Foundry Evals results. FoundryEvals remains unused on the public demo unless a real run is later recorded.

Unit tests in `backend/tests/test_assurance_engine.py` cover supported claims, unsupported claims, partial support, invalid citation rejection, missing information abstention, potential conflicts, revision delta, packet assembly, and Decision Replay.

Public demo users cannot trigger an expensive full evaluation.

## Stored quality signal

The backend computes a component based value labelled **AI quality signal** and stores it with an AI run. The current interface does not display the numeric score.

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

Each term is documented in `backend/app/ai/quality.py`. The value is an evidence and process summary, not calibrated correctness.

## Comparison

The Evaluation Lab stores dataset version, prompt versions, provider, model label, case results, and metric snapshots. The current interface lets a user select stored runs and inspect case outcomes. It does not present a statistical benchmark comparison.

## Limitations

- Deterministic metrics cannot judge prose quality.
- LLM-as-judge metrics vary by judge model and cost money.
- A passing score does not mean the recommendation is operationally correct.
- This project does not invent evaluation numbers for the live demo. FoundryEvals remains unused on the public site.
