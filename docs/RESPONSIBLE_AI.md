# Responsible AI

AI Operations Copilot produces recommendations. It does not autonomously contact customers.

## Human review

No generated response is treated as accepted until a human approves, edits and approves, rejects, requests regeneration, or escalates. Original and edited text are both stored.

## Grounding and source transparency

Resolution drafts must cite retrieved chunks when they rely on knowledge. The UI lets a reviewer open the supporting snippet. If retrieval is insufficient, the draft must say that more information or human investigation is needed.

## Hallucination risk

Language models can invent plausible details. Mitigations:

- retrieved context with a relevance threshold
- structured outputs
- Review Agent grounding checks
- one bounded revision
- human approval
- evaluation cases for unsupported claims

Residual risk remains. The UI must not call model text a guaranteed fact.

## Decision Assurance and abstention

The Decision Assurance Engine measures inspectable evidence and process conditions: claim support, coverage counts, missing information, potential conflicts, unsupported actions, independent review, and mandatory human control.

These gates are not a scientific confidence score and do not prove objective truth. Passing gates does not guarantee correctness.

AI abstention is intentional. When supporting evidence is insufficient, required facts are missing, a blocking potential conflict exists, or the proposed action is unsupported, the system withholds a customer response. Abstention is a successful safe outcome, not an error.

Potential conflicts are labeled as potential conflicts. They are not claimed as mathematical proofs.

Human review remains required before any customer facing decision.

## Prompt injection

Ticket text, uploaded files, and retrieved chunks are untrusted. Prompts separate instructions from untrusted content. The Review Agent looks for suspicious instruction-following. Dedicated evaluation cases cover direct and indirect injection.

These defenses reduce risk. They do not make injection impossible.

## Data privacy

Demo customers and tickets are fictional. No real customer PII belongs in this repository or the public demo. Secrets stay in environment variables and Container Apps secret references.

Production telemetry sets `ENABLE_SENSITIVE_TELEMETRY=false`. Traces may include run IDs, agent names, model deployment names, retrieval counts, and HTTP routes. They must not include ticket bodies, prompts, chunk text, customer drafts, or credentials.

## Sensitive information

Security-sensitive tickets set risk flags and can require human attention or escalation. The model is not authorized to disable security controls or reveal secrets.

## Model limitations

Models can be wrong, outdated, or overly fluent. Severity assignment follows documented rules, not unconstrained model preference. Token usage and latency are recorded when the provider returns them.

## Automation boundaries

The product recommends. It does not refund money, reset production credentials, or send mail. Tools are read-only.

## Evaluation and auditability

AI runs, steps, prompt versions, sources, human decisions, and feedback are persisted. Evaluation results are stored only after an actual run.

## Product language

Do not use hype such as “revolutionary AI”, “100 percent accurate”, or “guaranteed resolution”.
