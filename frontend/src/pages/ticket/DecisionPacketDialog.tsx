import type { ReactNode } from "react";
import type { AssuranceReport } from "../../lib/api";
import { describeProvider, gateTone, supportTone } from "../../lib/presentation";
import { formatOutcome, humanize } from "../../lib/utils";
import { Badge, Button } from "../../components/ui";
import { Dialog } from "../../components/Dialog";

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return typeof value === "object" && value !== null ? (value as Rec) : {};
}

function text(value: unknown, fallback = "Not recorded"): string {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result ? result : fallback;
}

function PacketSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="text-sm text-ink">{children}</div>
    </section>
  );
}

function PacketBody({ report }: { report: AssuranceReport }) {
  const packet = report.packet;
  const caseInfo = asRecord(packet.case);
  const recommendation = asRecord(packet.ai_recommendation);
  const reviewInfo = asRecord(packet.independent_review);
  const audit = asRecord(packet.audit);
  const human = asRecord(packet.human_decision);
  const provider = describeProvider(typeof audit.provider === "string" ? audit.provider : null);
  const findings = Array.isArray(reviewInfo.findings) ? (reviewInfo.findings as unknown[]).map(String) : [];

  return (
    <div className="space-y-5" data-testid="decision-packet-body">
      <PacketSection title="Case">
        <p>{text(caseInfo.summary)}</p>
        <p className="mt-1 text-muted">
          Category {humanize(text(caseInfo.category, ""), "Not recorded")}, severity {text(caseInfo.severity)}
        </p>
      </PacketSection>
      <PacketSection title="AI recommendation">
        <p>{text(recommendation.proposed_action, "No proposed action")}</p>
        {recommendation.customer_response_draft ? (
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 p-3">
            {text(recommendation.customer_response_draft)}
          </p>
        ) : (
          <p className="mt-1 text-muted">No customer response draft.</p>
        )}
      </PacketSection>
      <PacketSection title="Assurance outcome">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={gateTone(report.outcome)}>{formatOutcome(report.outcome)}</Badge>
          <span className="text-muted">Coverage: {report.coverage.display}</span>
        </p>
      </PacketSection>
      <PacketSection title="Assurance gates">
        <ul className="m-0 list-none space-y-1 p-0">
          {Object.values(report.gates).map((gate) => (
            <li key={gate.id} className="flex flex-wrap items-center gap-2">
              <span>{gate.label}</span>
              <Badge tone={gateTone(gate.state)}>{humanize(gate.state)}</Badge>
            </li>
          ))}
        </ul>
      </PacketSection>
      <PacketSection title="Evidence Ledger">
        {report.ledger.length ? (
          <ul className="m-0 list-none space-y-2 p-0">
            {report.ledger.map((entry) => (
              <li key={entry.claim_id} className="flex flex-wrap items-start gap-2">
                <Badge tone={supportTone(entry.support_state)}>{humanize(entry.support_state)}</Badge>
                <span className="min-w-0 flex-1">{entry.claim}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No claims were recorded.</p>
        )}
      </PacketSection>
      <PacketSection title="Evidence gaps">
        <p>{report.gaps.map((item) => item.concept).join(", ") || "None recorded"}</p>
      </PacketSection>
      <PacketSection title="Conflicting evidence">
        <p>{report.conflicts.map((item) => item.summary).join(" ") || "None recorded"}</p>
      </PacketSection>
      <PacketSection title="Independent review">
        <p>
          Verdict {text(reviewInfo.verdict)}. {text(reviewInfo.summary, "")}
        </p>
        {findings.length ? (
          <ul className="m-0 mt-1 list-disc pl-5">
            {findings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </PacketSection>
      {report.revision_delta.occurred ? (
        <PacketSection title="Revision">
          <p>{(report.revision_delta.changed || []).join("; ") || "A revision occurred."}</p>
        </PacketSection>
      ) : null}
      {report.abstention.abstained ? (
        <PacketSection title="Abstention">
          <p>{text(report.abstention.reason)}</p>
        </PacketSection>
      ) : null}
      <PacketSection title="Human decision">
        <p>{humanize(text(human.state, "awaiting human"), "Awaiting human decision")}</p>
      </PacketSection>
      <PacketSection title="Audit">
        <dl className="m-0 grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted">Run</dt>
          <dd className="m-0 break-all font-mono text-xs">{text(audit.run_id)}</dd>
          <dt className="text-muted">Provider</dt>
          <dd className="m-0">
            {provider.label}. {provider.description}
          </dd>
          <dt className="text-muted">Model</dt>
          <dd className="m-0">{text(audit.model_display_name)}</dd>
          <dt className="text-muted">Embeddings</dt>
          <dd className="m-0">{text(audit.embedding_model_display_name)}</dd>
          <dt className="text-muted">Retrieved chunks</dt>
          <dd className="m-0">{text(audit.retrieved_evidence_count, "0")}</dd>
          <dt className="text-muted">Revisions used</dt>
          <dd className="m-0">{text(audit.revision_count, "0")}</dd>
        </dl>
      </PacketSection>
    </div>
  );
}

export function DecisionPacketDialog({
  open,
  onClose,
  report,
}: {
  open: boolean;
  onClose: () => void;
  report: AssuranceReport | undefined;
}) {
  if (!report) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Decision Assurance Packet"
      description="The inspectable decision trail for this run. It is a record, not an approval."
      testId="decision-packet"
      closeTestId="close-decision-packet"
      headerActions={
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          Print
        </Button>
      }
    >
      <PacketBody report={report} />
    </Dialog>
  );
}
