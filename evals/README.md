# Evaluations

Golden dataset: `golden_cases.jsonl` (dataset version `golden-v2`, 44 inspectable synthetic cases).

Generate or refresh the file:

```bash
python evals/generate_cases.py
```

Run deterministic metrics from the backend environment:

```bash
cd backend
python -m evals.run_deterministic
```

Foundry quality evaluations require `APP_MODE=foundry` and are disabled for anonymous public demo users.
