from app.ai.observability import get_tracer, set_safe_span_attributes
from app.schemas.assurance import RunComparison, RunComparisonChange


def compare_runs(run_a: dict, run_b: dict) -> RunComparison:
    """Deterministic run comparison. An LLM is not the source of truth."""
    tracer = get_tracer()
    with tracer.start_as_current_span("ai.decision_replay") as span:
        report_a = run_a.get("assurance_report") or {}
        report_b = run_b.get("assurance_report") or {}
        packet_a = report_a.get("packet") or {}
        packet_b = report_b.get("packet") or {}
        chunks_a = _chunk_ids(run_a)
        chunks_b = _chunk_ids(run_b)
        names_a = _chunk_names(run_a)
        names_b = _chunk_names(run_b)
        added_ids = sorted(chunks_b - chunks_a)
        removed_ids = sorted(chunks_a - chunks_b)
        evidence_added = sorted(names_b - names_a)
        evidence_removed = sorted(names_a - names_b)
        action_a = _action(run_a, packet_a)
        action_b = _action(run_b, packet_b)
        outcome_a = str(report_a.get("outcome") or "unavailable")
        outcome_b = str(report_b.get("outcome") or "unavailable")
        review_a = str((run_a.get("review_result") or {}).get("status") or "unavailable")
        review_b = str((run_b.get("review_result") or {}).get("status") or "unavailable")
        triage_a = _triage_line(run_a)
        triage_b = _triage_line(run_b)
        human_a = str(run_a.get("human_decision") or "awaiting human")
        human_b = str(run_b.get("human_decision") or "awaiting human")
        prompts_a = str(run_a.get("prompt_versions") or {})
        prompts_b = str(run_b.get("prompt_versions") or {})
        revision_a = str(run_a.get("revision_count") or 0)
        revision_b = str(run_b.get("revision_count") or 0)

        support_a = _support_map(report_a)
        support_b = _support_map(report_b)
        claim_changes = []
        for key in sorted(set(support_a) | set(support_b)):
            left = support_a.get(key, "absent")
            right = support_b.get(key, "absent")
            if left != right:
                claim_changes.append(f"{key}: {left} → {right}")

        conflicts_a = {
            item.get("summary") for item in report_a.get("conflicts") or [] if item.get("summary")
        }
        conflicts_b = {
            item.get("summary") for item in report_b.get("conflicts") or [] if item.get("summary")
        }
        gaps_a = {item.get("concept") for item in report_a.get("gaps") or [] if item.get("concept")}
        gaps_b = {item.get("concept") for item in report_b.get("gaps") or [] if item.get("concept")}

        gate_changes = _gate_changes(report_a, report_b)
        why: list[str] = []
        if evidence_added:
            why.append("New retrieved evidence: " + ", ".join(evidence_added[:4]))
        if evidence_removed:
            why.append("Removed retrieved evidence: " + ", ".join(evidence_removed[:4]))
        if action_a != action_b:
            why.append("The proposed operational action changed.")
        if outcome_a != outcome_b:
            why.append(f"Assurance outcome moved from {outcome_a} to {outcome_b}.")
        if review_a != review_b:
            why.append("The Review Agent verdict changed.")
        if not why:
            why.append("No material inspectable differences were found.")

        changes = [
            triage_a != triage_b,
            action_a != action_b,
            outcome_a != outcome_b,
            review_a != review_b,
            human_a != human_b,
            prompts_a != prompts_b,
            bool(added_ids or removed_ids or claim_changes or gate_changes),
            revision_a != revision_b,
            conflicts_a != conflicts_b,
            gaps_a != gaps_b,
        ]
        identical = not any(changes)
        summary = (
            "The two runs are effectively identical on inspectable decision fields."
            if identical
            else "The runs differ on inspectable evidence, recommendation, or assurance fields."
        )
        comparison = RunComparison(
            identical=identical,
            run_a_id=str(run_a.get("id") or ""),
            run_b_id=str(run_b.get("id") or ""),
            summary=summary,
            triage=_change("triage", "Triage", triage_a, triage_b),
            recommendation=_change("recommendation", "Proposed action", action_a, action_b),
            assurance=_change("assurance", "Assurance outcome", outcome_a, outcome_b),
            review=_change("review", "Review verdict", review_a, review_b),
            human_decision=_change("human_decision", "Human decision", human_a, human_b),
            prompt_version=_change("prompt_version", "Prompt versions", prompts_a, prompts_b),
            evidence_added=evidence_added,
            evidence_removed=evidence_removed,
            claim_support_changes=claim_changes,
            conflicts_introduced=sorted(conflicts_b - conflicts_a),
            conflicts_resolved=sorted(conflicts_a - conflicts_b),
            missing_information_changes=sorted(gaps_a.symmetric_difference(gaps_b)),
            revision_occurrence=_change("revision", "Revision count", revision_a, revision_b),
            gate_changes=gate_changes,
            why=why,
        )
        set_safe_span_attributes(
            span,
            **{
                "ai.decision_replay.identical": identical,
                "ai.decision_replay.evidence_added_count": len(evidence_added),
                "ai.decision_replay.evidence_removed_count": len(evidence_removed),
                "ai.decision_replay.gate_change_count": len(gate_changes),
            },
        )
        return comparison


def _change(field: str, label: str, before: str, after: str) -> RunComparisonChange:
    return RunComparisonChange(
        field=field,
        label=label,
        before=before,
        after=after,
        changed=before != after,
    )


def _chunk_ids(run: dict) -> set[str]:
    chunks = ((run.get("retrieval_result") or {}).get("chunks")) or []
    return {str(item.get("chunk_id")) for item in chunks if item.get("chunk_id")}


def _chunk_names(run: dict) -> set[str]:
    chunks = ((run.get("retrieval_result") or {}).get("chunks")) or []
    names = set()
    for item in chunks:
        name = item.get("document_name")
        if name:
            names.add(str(name))
    return names


def _action(run: dict, packet: dict) -> str:
    recommended = (packet.get("ai_recommendation") or {}).get("proposed_action")
    if recommended:
        return str(recommended)
    draft = run.get("resolution_draft") or {}
    if draft.get("proposed_action"):
        return str(draft["proposed_action"])
    actions = draft.get("recommended_actions") or []
    return str(actions[0]) if actions else "none"


def _triage_line(run: dict) -> str:
    triage = run.get("triage_result") or {}
    return f"{triage.get('category') or 'unknown'} / {triage.get('severity') or 'unknown'}"


def _support_map(report: dict) -> dict[str, str]:
    mapping = {}
    for item in report.get("ledger") or []:
        text = str(item.get("claim") or item.get("claim_id") or "")
        mapping[text] = str(item.get("support_state") or "unknown")
    return mapping


def _gate_changes(report_a: dict, report_b: dict) -> list[RunComparisonChange]:
    gates_a = report_a.get("gates") or {}
    gates_b = report_b.get("gates") or {}
    keys = sorted(set(gates_a) | set(gates_b))
    changes = []
    for key in keys:
        left = str((gates_a.get(key) or {}).get("state") or "unavailable")
        right = str((gates_b.get(key) or {}).get("state") or "unavailable")
        if left != right:
            changes.append(_change(key, key.replace("_", " "), left, right))
    return changes
