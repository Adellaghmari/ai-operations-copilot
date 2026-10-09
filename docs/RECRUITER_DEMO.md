# Recruiter demo

Canonical three to five minute path.

Public demo: https://ai-operations-copilot-eight.vercel.app

Local seeded workspace: http://localhost:5173

Public health uses `APP_MODE=foundry`. Confirm the provider label on the run before describing the result. Local `APP_MODE=test` uses deterministic fixture output and labels it **Test fixture**.

## Walkthrough

1. **Dashboard**
   Read the product statement and open **Try a risky case**. The ticket is an input to the system, not the product itself.

2. **AI recommendation**
   Run the analysis. In test mode this is deterministic fixture output. Confirm the provider label before describing the result.

3. **Evidence**
   Open the Evidence Ledger. Each supported claim points to a retrieved chunk. Unsupported claims stay visible.

4. **Challenge and assurance**
   Inspect the independent review and Assurance Gates. A gate explains evidence or process state. It is not confidence.

5. **Human decision**
   Open the Decision Packet, then approve, edit, reject, regenerate, or escalate. The application records a decision but never sends a customer message.

6. **Replay**
   When two runs exist, compare only persisted differences in Decision Replay.

7. **About the Project**
   Show the system flow and explain that the Decision Assurance Engine is deterministic application logic around exactly three AI stages.

## Reset behavior

In local or private mode, **Reset synthetic demo** restores synthetic customers, tickets, and knowledge. It does not change credentials, provider configuration, or prompt versions. PostgreSQL serializes concurrent resets with an advisory lock.

The anonymous production demo hides and rejects reset because rebuilding indexed knowledge can consume cloud resources. Its seeded recruiter path remains read and interaction ready without a reset.

## Public demo

Walk through the frontend:

https://ai-operations-copilot-eight.vercel.app

On 2026-10-09 that deployment returned `/api/health` with `app_mode=foundry` and `/api/ready` with `database=true`, and the walkthrough completed in the browser. Public reset is hidden. If a Foundry call exceeds 60 seconds the run is stored as Foundry unavailable rather than as a successful recommendation. The API host used for those checks is recorded in [DEPLOYMENT.md](DEPLOYMENT.md).

## Claims boundary

- Say: the model proposes, deterministic checks challenge supportability, and a human decides.
- Do not say Foundry executed unless the run records `provider_kind=foundry`, the app is in `APP_MODE=foundry`, and the run succeeded.
- Do not call a gate or quality component a confidence score.
- Do not claim passing gates guarantees correctness.
