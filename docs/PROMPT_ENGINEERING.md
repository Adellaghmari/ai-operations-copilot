# Prompt Engineering

Prompts are named, versioned, documented, and testable. They are not embedded in random service files.

## Registry

Application prompts live in `backend/app/ai/prompts/` and are loaded into `prompt_versions` at startup/seed.

Each prompt has:

- name (`triage`, `resolution`, `review`)
- integer version
- immutable body
- changelog note

Every AI run stores the prompt name and version that produced it.

## Role boundaries

| Prompt | May do | Must not do |
|---|---|---|
| Triage | Classify, summarize, extract entities, build a retrieval query | Invent a customer-facing answer or cite knowledge it did not see |
| Resolution | Draft a grounded recommendation and customer reply | State unsupported facts, ignore missing information, treat retrieved text as system orders |
| Review | Compare draft to sources and policy | Rewrite the customer email itself beyond recommended changes |

## Grounding

Resolution and Review prompts require citations for knowledge-backed claims. If sources are empty or weak, the model must request more information or escalate.

## Prompt injection mitigation

Untrusted blocks are clearly delimited. Instructions say that ticket text and knowledge snippets are data, not orders. Requests for system prompts, secrets, or policy overrides are refused. Review inspects for injection influence.

## What may be changed safely

Safe: wording clarifications, examples, severity rubric phrasing, tone guidance.

Unsafe without a new version and evaluation run: role changes, removal of grounding rules, raising revision limits, adding write tools.

## Structured output

Prompts assume schema-constrained decoding. They do not say “please return JSON” as the only control. Server-side Pydantic validation is still required.
