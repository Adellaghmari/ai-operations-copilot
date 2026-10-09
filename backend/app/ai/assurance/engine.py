from __future__ import annotations

from app.ai.observability import get_tracer, set_safe_span_attributes
from app.schemas.ai import (
    ResolutionClaim,
    ResolutionDraft,
    RetrievedChunk,
    ReviewResult,
    TriageResult,
)
from app.schemas.assurance import (
    AbstentionResult,
    AssuranceGate,
    AssuranceGates,
    AssuranceReport,
    DecisionPacket,
    EvidenceCoverage,
    EvidenceGap,
    EvidenceLedgerEntry,
    EvidenceMapping,
    RevisionDelta,
    ValidatedConflict,
)

EXCERPT_LIMIT = 420

SENSITIVE_ACTION_MARKERS = (
    "mfa",
    "sso",
    "domain",
    "owner",
    "ownership",
    "admin",
    "refund",
    "password",
    "unlock",
    "bypass",
    "disable",
    "transfer",
    "privilege",
    "authorization",
)

IMMEDIATE_REFUND_MARKERS = (
    "immediate refund",
    "refund immediately",
    "refund now",
    "issue the refund",
    "auto refund",
    "automatic refund",
)

MFA_BYPASS_MARKERS = (
    "disable mfa",
    "turn off mfa",
    "bypass mfa",
    "skip mfa",
    "bypass sso",
    "skip identity",
    "skip verification",
)

CRITICAL_CONCEPTS = {
    "identity verification": ("identity", "verify", "verification", "requester"),
    "contract tier": ("contract", "plan", "tier", "enterprise", "business"),
    "invoice age": ("invoice age", "unused month", "billing cycle", "prepaid"),
    "account ownership": ("owner", "ownership", "account owner"),
    "affected domain": ("domain", "workspace"),
    "authorization": ("authorization", "authorised", "authorized", "admin access"),
}


class DecisionAssuranceEngine:
    """Application-owned assurance layer. Not an LLM agent.

    Validates provenance, computes inspectable gates, and decides abstention.
    Review Agent output may identify semantic issues; this engine owns the
    machine state after validating retrieved chunk IDs.
    """

    def evaluate(
        self,
        *,
        ticket_subject: str,
        ticket_body: str,
        triage: TriageResult,
        retrieved: list[RetrievedChunk],
        resolution: ResolutionDraft,
        review: ReviewResult,
        original_resolution: ResolutionDraft | None,
        revision_count: int,
        forced_human_escalation: bool,
        min_retrieval_score: float,
        prompt_versions: dict[str, int],
        provider_kind: str,
        model_deployment: str | None,
        embedding_model: str | None,
        run_id: str,
        human_decision: str | None = None,
        human_decision_label: str | None = None,
    ) -> tuple[AssuranceReport, ResolutionDraft]:
        tracer = get_tracer()
        with tracer.start_as_current_span("ai.assurance") as span:
            by_id = {item.chunk_id: item for item in retrieved}
            claims = _normalize_claims(resolution, by_id)
            conflicts = _validated_conflicts(review, retrieved, by_id, ticket_body, resolution)
            gaps = _collect_gaps(triage, review, resolution, ticket_body)
            ledger = _build_ledger(claims, by_id, review, conflicts)
            coverage = _coverage(ledger)
            risk_flags = list(dict.fromkeys([*triage.risk_flags, *review.safety_flags]))
            if _mentions(ticket_body, MFA_BYPASS_MARKERS):
                risk_flags.append("security_control_bypass_request")

            support_gate = _evidence_support_gate(ledger)
            coverage_gate = _coverage_gate(coverage)
            missing_gate = _missing_gate(gaps, ticket_body, triage)
            conflict_gate = _conflict_gate(conflicts, resolution)
            unsupported_gate = _unsupported_action_gate(ledger, resolution, ticket_body)
            review_gate = _review_gate(review, forced_human_escalation)
            human_gate = AssuranceGate(
                id="human_control",
                label="Human control",
                question="Why does a human need to decide?",
                state="HUMAN_REQUIRED",
                detail=(
                    "A human must review every operational decision "
                    "before any customer facing action."
                ),
            )
            gates = AssuranceGates(
                evidence_support=support_gate,
                evidence_coverage=coverage_gate,
                missing_information=missing_gate,
                conflicting_evidence=conflict_gate,
                unsupported_action=unsupported_gate,
                independent_review=review_gate,
                human_control=human_gate,
            )
            abstention = _abstention(
                retrieved,
                min_retrieval_score,
                gaps,
                missing_gate,
                conflict_gate,
                unsupported_gate,
                coverage,
                ticket_body,
            )
            outcome = _aggregate_outcome(
                abstention.abstained,
                gates,
                forced_human_escalation,
                review.status,
            )
            blocking = _blocking_issues(gates, abstention)
            if abstention.abstained:
                resolution = resolution.model_copy(
                    update={
                        "customer_response_draft": "",
                        "proposed_action": (
                            "No operational action recommended. Human investigation required."
                        ),
                        "limitations": [
                            *resolution.limitations,
                            "AI abstained; no customer response was produced.",
                        ],
                    }
                )
            revision_delta = _revision_delta(
                original_resolution, resolution, review, revision_count
            )
            packet = _packet(
                ticket_subject=ticket_subject,
                triage=triage,
                resolution=resolution,
                review=review,
                retrieved=retrieved,
                outcome=outcome,
                gates=gates,
                ledger=ledger,
                gaps=gaps,
                conflicts=conflicts,
                risk_flags=risk_flags,
                revision_delta=revision_delta,
                abstention=abstention,
                prompt_versions=prompt_versions,
                provider_kind=provider_kind,
                model_deployment=model_deployment,
                embedding_model=embedding_model,
                run_id=run_id,
                revision_count=revision_count,
                human_decision=human_decision,
                human_decision_label=human_decision_label,
            )
            report = AssuranceReport(
                outcome=outcome,
                gates=gates,
                coverage=coverage,
                ledger=ledger,
                gaps=gaps,
                conflicts=conflicts,
                risk_flags=risk_flags,
                revision_delta=revision_delta,
                abstention=abstention,
                packet=packet,
                blocking_issues=blocking,
            )
            set_safe_span_attributes(
                span,
                **{
                    "ai.assurance.outcome": outcome,
                    "ai.assurance.abstained": abstention.abstained,
                    "ai.assurance.claim_count": len(ledger),
                    "ai.assurance.supported_claim_count": coverage.supported_claims,
                    "ai.assurance.unsupported_claim_count": sum(
                        1 for item in ledger if item.support_state == "UNSUPPORTED"
                    ),
                    "ai.assurance.conflict_count": len(conflicts),
                    "ai.assurance.missing_information_count": len(gaps),
                    "ai.assurance.gate.evidence_support": support_gate.state,
                    "ai.assurance.gate.evidence_coverage": coverage_gate.state,
                    "ai.assurance.gate.missing_information": missing_gate.state,
                    "ai.assurance.gate.conflicting_evidence": conflict_gate.state,
                    "ai.assurance.gate.unsupported_action": unsupported_gate.state,
                    "ai.assurance.gate.independent_review": review_gate.state,
                    "ai.assurance.revision_count": revision_count,
                },
            )
            with tracer.start_as_current_span("ai.assurance.evidence_ledger") as ledger_span:
                set_safe_span_attributes(
                    ledger_span,
                    **{
                        "ai.assurance.claim_count": len(ledger),
                        "ai.assurance.supported_claim_count": coverage.supported_claims,
                    },
                )
            with tracer.start_as_current_span("ai.assurance.conflict_detection") as conflict_span:
                set_safe_span_attributes(
                    conflict_span,
                    **{"ai.assurance.conflict_count": len(conflicts)},
                )
            with tracer.start_as_current_span("ai.assurance.gates") as gates_span:
                set_safe_span_attributes(
                    gates_span,
                    **{
                        "ai.assurance.outcome": outcome,
                        "ai.assurance.gate.evidence_support": support_gate.state,
                    },
                )
            with tracer.start_as_current_span("ai.assurance.abstention") as abs_span:
                set_safe_span_attributes(
                    abs_span,
                    **{"ai.assurance.abstained": abstention.abstained},
                )
            with tracer.start_as_current_span("ai.decision_packet") as packet_span:
                set_safe_span_attributes(
                    packet_span,
                    **{
                        "ai.assurance.outcome": outcome,
                        "ai.assurance.claim_count": len(ledger),
                    },
                )
            return report, resolution


def _excerpt(text: str) -> str:
    compact = " ".join(text.split())
    if len(compact) <= EXCERPT_LIMIT:
        return compact
    return compact[: EXCERPT_LIMIT - 1].rstrip() + "…"


def _mentions(text: str, markers: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


def _blob(*parts: str) -> str:
    return " ".join(part for part in parts if part).lower()


def _normalize_claims(
    resolution: ResolutionDraft, by_id: dict[str, RetrievedChunk]
) -> list[ResolutionClaim]:
    claims: list[ResolutionClaim] = []
    for index, claim in enumerate(resolution.claims, start=1):
        valid = [chunk_id for chunk_id in claim.cited_chunk_ids if chunk_id in by_id]
        claims.append(
            claim.model_copy(
                update={
                    "claim_id": claim.claim_id or f"claim-{index}",
                    "cited_chunk_ids": valid,
                }
            )
        )
    if claims:
        return claims
    cited = [item.chunk_id for item in resolution.source_citations if item.chunk_id in by_id]
    action = resolution.proposed_action or (
        resolution.recommended_actions[0] if resolution.recommended_actions else ""
    )
    if action:
        claims.append(
            ResolutionClaim(
                claim_id="claim-action",
                text=action,
                category="action",
                requires_evidence=True,
                cited_chunk_ids=cited[:4],
            )
        )
    for index, item in enumerate(resolution.recommended_actions[1:4], start=2):
        claims.append(
            ResolutionClaim(
                claim_id=f"claim-action-{index}",
                text=item,
                category="action",
                requires_evidence=bool(cited),
                cited_chunk_ids=cited[:2] if cited else [],
            )
        )
    for index, item in enumerate(resolution.limitations[:2], start=1):
        claims.append(
            ResolutionClaim(
                claim_id=f"claim-limit-{index}",
                text=item,
                category="limitation",
                requires_evidence=False,
                cited_chunk_ids=[],
            )
        )
    if not claims:
        claims.append(
            ResolutionClaim(
                claim_id="claim-empty",
                text="No material operational claim was produced.",
                category="limitation",
                requires_evidence=False,
            )
        )
    return claims


def _build_ledger(
    claims: list[ResolutionClaim],
    by_id: dict[str, RetrievedChunk],
    review: ReviewResult,
    conflicts: list[ValidatedConflict],
) -> list[EvidenceLedgerEntry]:
    assessments = {item.claim_id: item for item in review.claim_assessments}
    conflicted_chunks = {
        item.chunk_a for item in conflicts if item.materiality in {"MATERIAL", "BLOCKING"}
    }
    conflicted_chunks.update(
        item.chunk_b for item in conflicts if item.materiality in {"MATERIAL", "BLOCKING"}
    )
    ledger: list[EvidenceLedgerEntry] = []
    with get_tracer().start_as_current_span("ai.assurance.evidence_ledger.build"):
        for claim in claims:
            valid_ids = [chunk_id for chunk_id in claim.cited_chunk_ids if chunk_id in by_id]
            mappings = []
            for chunk_id in valid_ids:
                chunk = by_id[chunk_id]
                mappings.append(
                    EvidenceMapping(
                        chunk_id=chunk.chunk_id,
                        document_id=chunk.document_id,
                        document_name=chunk.document_name,
                        section=chunk.section,
                        excerpt=_excerpt(chunk.body),
                    )
                )
            assessment = assessments.get(claim.claim_id)
            review_ids = []
            if assessment:
                review_ids = [
                    chunk_id for chunk_id in assessment.valid_chunk_ids if chunk_id in by_id
                ]
                for chunk_id in review_ids:
                    if chunk_id not in valid_ids and chunk_id in by_id:
                        chunk = by_id[chunk_id]
                        mappings.append(
                            EvidenceMapping(
                                chunk_id=chunk.chunk_id,
                                document_id=chunk.document_id,
                                document_name=chunk.document_name,
                                section=chunk.section,
                                excerpt=_excerpt(chunk.body),
                            )
                        )
                        valid_ids.append(chunk_id)
            if not claim.requires_evidence:
                state = "NOT_EVIDENCE_REQUIRED"
            elif valid_ids and any(chunk_id in conflicted_chunks for chunk_id in valid_ids):
                state = "CONFLICTED"
            elif not valid_ids:
                state = "UNSUPPORTED"
            elif assessment and assessment.support_state == "PARTIALLY_SUPPORTED":
                state = "PARTIALLY_SUPPORTED"
            elif (
                assessment
                and assessment.support_state in {"UNSUPPORTED", "CONFLICTED"}
                and not valid_ids
            ):
                state = assessment.support_state
            else:
                state = "SUPPORTED"
            if assessment and assessment.support_state == "CONFLICTED" and valid_ids:
                state = "CONFLICTED"
            ledger.append(
                EvidenceLedgerEntry(
                    claim_id=claim.claim_id,
                    claim=claim.text,
                    category=claim.category,
                    requires_evidence=claim.requires_evidence,
                    support_state=state,
                    document_ids=list(dict.fromkeys(item.document_id for item in mappings)),
                    chunk_ids=list(dict.fromkeys(item.chunk_id for item in mappings)),
                    evidence=mappings,
                    review_note=assessment.issue if assessment else None,
                )
            )
    return ledger


def _validated_conflicts(
    review: ReviewResult,
    retrieved: list[RetrievedChunk],
    by_id: dict[str, RetrievedChunk],
    ticket_body: str,
    resolution: ResolutionDraft,
) -> list[ValidatedConflict]:
    conflicts: list[ValidatedConflict] = []
    seen: set[tuple[str, str]] = set()
    for item in review.potential_conflicts:
        left = by_id.get(item.chunk_a)
        right = by_id.get(item.chunk_b)
        if left is None or right is None or left.chunk_id == right.chunk_id:
            continue
        key = tuple(sorted((left.chunk_id, right.chunk_id)))
        if key in seen:
            continue
        seen.add(key)
        conflicts.append(
            ValidatedConflict(
                chunk_a=left.chunk_id,
                chunk_b=right.chunk_id,
                document_a=left.document_name,
                document_b=right.document_name,
                section_a=left.section,
                section_b=right.section,
                excerpt_a=_excerpt(left.body),
                excerpt_b=_excerpt(right.body),
                summary=item.summary,
                why_conflicts=item.summary,
                materiality=item.materiality,
                impact=item.impact,
                source="review_agent",
            )
        )
    refund_general: RetrievedChunk | None = None
    refund_enterprise: RetrievedChunk | None = None
    for chunk in retrieved:
        blob = _blob(chunk.document_name, chunk.section, chunk.body)
        if "enterprise" in blob and "refund" in blob:
            refund_enterprise = refund_enterprise or chunk
        elif "refund" in blob and "enterprise" not in blob:
            refund_general = refund_general or chunk
    ticket_is_refund = "refund" in ticket_body.lower()
    if ticket_is_refund and refund_general and refund_enterprise:
        key = tuple(sorted((refund_general.chunk_id, refund_enterprise.chunk_id)))
        if key not in seen:
            seen.add(key)
            action_blob = _blob(
                resolution.proposed_action,
                *resolution.recommended_actions,
                resolution.customer_response_draft,
            )
            ticket_wants_immediate = _mentions(ticket_body, IMMEDIATE_REFUND_MARKERS) or (
                "refund" in ticket_body.lower() and "immediately" in ticket_body.lower()
            )
            blocking = _mentions(action_blob, IMMEDIATE_REFUND_MARKERS) or ticket_wants_immediate
            conflicts.append(
                ValidatedConflict(
                    chunk_a=refund_general.chunk_id,
                    chunk_b=refund_enterprise.chunk_id,
                    document_a=refund_general.document_name,
                    document_b=refund_enterprise.document_name,
                    section_a=refund_general.section,
                    section_b=refund_enterprise.section,
                    excerpt_a=_excerpt(refund_general.body),
                    excerpt_b=_excerpt(refund_enterprise.body),
                    summary=(
                        "General refund guidance and Enterprise refund policy "
                        "give different requirements."
                    ),
                    why_conflicts=(
                        "One source discusses unused prepaid months through a billing specialist. "
                        "The other requires written finance approval and forbids an immediate "
                        "Enterprise refund."
                    ),
                    materiality="BLOCKING" if blocking else "MATERIAL",
                    impact=(
                        "The system should not recommend an immediate refund without resolving "
                        "the Enterprise policy requirement."
                    ),
                    source="policy_overlap",
                )
            )
    return conflicts


def _collect_gaps(
    triage: TriageResult,
    review: ReviewResult,
    resolution: ResolutionDraft,
    ticket_body: str,
) -> list[EvidenceGap]:
    gaps: list[EvidenceGap] = []
    seen: set[str] = set()

    def add(concept: str, reason: str, materiality: str, source: str) -> None:
        key = concept.lower()
        if key in seen:
            return
        seen.add(key)
        gaps.append(
            EvidenceGap(concept=concept, reason=reason, materiality=materiality, source=source)  # type: ignore[arg-type]
        )

    for item in review.missing_information:
        add(item.concept, item.reason, item.materiality, "review")
    for raw in [
        *triage.missing_information,
        *review.missing_items,
        *resolution.unanswered_questions,
    ]:
        concept = _map_concept(raw)
        add(concept, raw, "MATERIAL", "triage")
    lowered = ticket_body.lower()
    sensitive = _mentions(lowered, SENSITIVE_ACTION_MARKERS)
    if sensitive:
        if "email" not in lowered and "verify" not in lowered and "identity" not in lowered:
            add(
                "identity verification",
                "The request affects access or account controls without a "
                "verified requester identity.",
                "BLOCKING",
                "engine",
            )
        if "owner" in lowered or "ownership" in lowered or "transfer" in lowered:
            if "workspace" not in lowered and "domain" not in lowered:
                add(
                    "account ownership",
                    "Account ownership is requested without a named workspace or verified owner.",
                    "BLOCKING",
                    "engine",
                )
        if ("domain" in lowered or "sso" in lowered) and "workspace" not in lowered:
            add(
                "affected domain",
                "The affected workspace or domain is not identified.",
                "MATERIAL",
                "engine",
            )
        if "refund" in lowered and "enterprise" in lowered:
            if "invoice" not in lowered and "unused" not in lowered:
                add(
                    "invoice age",
                    "Enterprise refund handling needs invoice or prepaid period context.",
                    "MATERIAL",
                    "engine",
                )
    return gaps


def _map_concept(raw: str) -> str:
    lowered = raw.lower()
    for concept, markers in CRITICAL_CONCEPTS.items():
        if any(marker in lowered for marker in markers):
            return concept
    return raw[:80]


def _coverage(ledger: list[EvidenceLedgerEntry]) -> EvidenceCoverage:
    required = [item for item in ledger if item.requires_evidence]
    supported = [item for item in required if item.support_state == "SUPPORTED"]
    total = len(required)
    count = len(supported)
    if total == 0:
        state = "PASS"
    elif count == total:
        state = "PASS"
    elif count == 0:
        state = "BLOCKED"
    else:
        state = "WARNING"
    return EvidenceCoverage(
        supported_claims=count,
        evidence_requiring_claims=total,
        display=f"{count} of {total} claims supported" if total else "No evidence requiring claims",
        state=state,
    )


def _evidence_support_gate(ledger: list[EvidenceLedgerEntry]) -> AssuranceGate:
    required = [item for item in ledger if item.requires_evidence]
    unsupported = [item for item in required if item.support_state == "UNSUPPORTED"]
    conflicted = [item for item in required if item.support_state == "CONFLICTED"]
    partial = [item for item in required if item.support_state == "PARTIALLY_SUPPORTED"]
    if not required:
        state = "PASS"
        detail = "No evidence requiring claims were made."
    elif unsupported and len(unsupported) == len(required):
        state = "BLOCKED"
        detail = "None of the evidence requiring claims map to retrieved knowledge."
    elif unsupported or conflicted:
        state = (
            "BLOCKED" if conflicted and any(True for _ in conflicted) and unsupported else "WARNING"
        )
        if unsupported and not any(item.support_state == "SUPPORTED" for item in required):
            state = "BLOCKED"
        detail = f"{len(unsupported)} unsupported and {len(conflicted)} conflicted claims remain."
    elif partial:
        state = "WARNING"
        detail = "Some claims are only partially supported by retrieved knowledge."
    else:
        state = "PASS"
        detail = "Evidence requiring claims map to retrieved knowledge chunks."
    if unsupported and any(item.category == "action" for item in unsupported):
        if not any(
            item.support_state == "SUPPORTED" for item in required if item.category == "action"
        ):
            state = "BLOCKED"
    return AssuranceGate(
        id="evidence_support",
        label="Evidence support",
        question=(
            "Does the recommendation contain factual or action claims "
            "that are supported by retrieved knowledge?"
        ),
        state=state,
        detail=detail,
    )


def _coverage_gate(coverage: EvidenceCoverage) -> AssuranceGate:
    return AssuranceGate(
        id="evidence_coverage",
        label="Evidence coverage",
        question="How many evidence requiring claims are supported?",
        state=coverage.state,
        detail=coverage.display,
    )


def _missing_gate(gaps: list[EvidenceGap], ticket_body: str, triage: TriageResult) -> AssuranceGate:
    blocking = [item for item in gaps if item.materiality == "BLOCKING"]
    material = [item for item in gaps if item.materiality == "MATERIAL"]
    sensitive = _mentions(ticket_body, SENSITIVE_ACTION_MARKERS) or triage.category in {
        "security",
        "account_access",
        "billing",
    }
    if blocking and sensitive:
        state = "HUMAN_REQUIRED"
        detail=(
            "Critical case facts are missing. A human must investigate "
            "before an operational action."
        )
    elif blocking or (material and sensitive):
        state = "HUMAN_REQUIRED" if blocking else "WARNING"
        detail = "Important case facts are absent from the ticket."
    elif gaps:
        state = "WARNING"
        detail = "Some additional context would strengthen the recommendation."
    else:
        state = "PASS"
        detail = "No material missing information was identified."
    names = ", ".join(item.concept for item in gaps[:4]) or "none"
    return AssuranceGate(
        id="missing_information",
        label="Missing information",
        question="Is important case information absent?",
        state=state,
        detail=f"{detail} Missing: {names}.",
    )


def _conflict_gate(
    conflicts: list[ValidatedConflict], resolution: ResolutionDraft
) -> AssuranceGate:
    if not conflicts:
        return AssuranceGate(
            id="conflicting_evidence",
            label="Conflicting evidence",
            question="Do retrieved sources disagree on this decision?",
            state="PASS",
            detail="No potential conflict was validated against retrieved chunks.",
        )
    blocking = [item for item in conflicts if item.materiality == "BLOCKING"]
    material = [item for item in conflicts if item.materiality == "MATERIAL"]
    action_blob = _blob(resolution.proposed_action, *resolution.recommended_actions)
    if blocking or (_mentions(action_blob, IMMEDIATE_REFUND_MARKERS) and material):
        state = "BLOCKED"
        detail = "A potential conflict affects the recommended action. The gate cannot pass."
    elif material:
        state = "WARNING"
        detail = (
            "Potential conflict detected between retrieved policies. "
            "Presented as model or overlap assessed, not as a mathematical proof."
        )
    else:
        state = "WARNING"
        detail = "A low materiality potential conflict was recorded."
    return AssuranceGate(
        id="conflicting_evidence",
        label="Conflicting evidence",
        question="Do retrieved sources disagree on this decision?",
        state=state,
        detail=detail,
    )


def _unsupported_action_gate(
    ledger: list[EvidenceLedgerEntry],
    resolution: ResolutionDraft,
    ticket_body: str,
) -> AssuranceGate:
    action_claims = [
        item for item in ledger if item.category == "action" and item.requires_evidence
    ]
    unsupported_actions = [
        item for item in action_claims if item.support_state in {"UNSUPPORTED", "CONFLICTED"}
    ]
    blob = _blob(
        resolution.proposed_action,
        *resolution.recommended_actions,
        resolution.customer_response_draft,
    )
    requested_bypass = _mentions(ticket_body, MFA_BYPASS_MARKERS)
    recommended_bypass = _mentions(blob, MFA_BYPASS_MARKERS)
    if recommended_bypass:
        return AssuranceGate(
            id="unsupported_action",
            label="Unsupported action",
            question="Does the proposed operational action lack supporting evidence?",
            state="BLOCKED",
            detail=(
                "The draft recommends bypassing a security control. "
                "That action is not supported."
            ),
        )
    if requested_bypass and recommended_bypass:
        state = "BLOCKED"
        detail = "A security workaround was recommended without supporting policy evidence."
        return AssuranceGate(
            id="unsupported_action",
            label="Unsupported action",
            question="Does the proposed operational action lack supporting evidence?",
            state=state,
            detail=detail,
        )
    if unsupported_actions and not any(item.support_state == "SUPPORTED" for item in action_claims):
        return AssuranceGate(
            id="unsupported_action",
            label="Unsupported action",
            question="Does the proposed operational action lack supporting evidence?",
            state="BLOCKED",
            detail="The proposed operational action is not mapped to retrieved evidence.",
        )
    return AssuranceGate(
        id="unsupported_action",
        label="Unsupported action",
        question="Does the proposed operational action lack supporting evidence?",
        state="PASS",
        detail="No unsupported operational action was recommended.",
    )


def _review_gate(review: ReviewResult, forced_human_escalation: bool) -> AssuranceGate:
    status = "ESCALATE" if forced_human_escalation or review.status == "ESCALATE" else review.status
    detail = review.review_summary
    if forced_human_escalation:
        detail = (
            "Review still required changes after the single allowed revision. "
            "Human escalation is required."
        )
    return AssuranceGate(
        id="independent_review",
        label="Independent review",
        question="What did the independent review challenge?",
        state=status,
        detail=detail,
    )


def _abstention(
    retrieved: list[RetrievedChunk],
    min_score: float,
    gaps: list[EvidenceGap],
    missing_gate: AssuranceGate,
    conflict_gate: AssuranceGate,
    unsupported_gate: AssuranceGate,
    coverage: EvidenceCoverage,
    ticket_body: str,
) -> AbstentionResult:
    above = [item for item in retrieved if item.retrieval_score >= min_score]
    missing = [item.concept for item in gaps if item.materiality in {"MATERIAL", "BLOCKING"}]
    if not retrieved or not above:
        return AbstentionResult(
            abstained=True,
            reason="Insufficient evidence for a safe recommendation.",
            missing=missing or ["Retrieved knowledge below the safe retrieval threshold"],
            recommended_next_step="Human investigation required.",
        )
    if missing_gate.state == "HUMAN_REQUIRED" and _mentions(ticket_body, SENSITIVE_ACTION_MARKERS):
        blocking_missing = [item.concept for item in gaps if item.materiality == "BLOCKING"]
        if blocking_missing:
            return AbstentionResult(
                abstained=True,
                reason="Required case facts are missing for a sensitive operational request.",
                missing=blocking_missing,
                recommended_next_step="Human investigation required.",
            )
    if conflict_gate.state == "BLOCKED":
        return AbstentionResult(
            abstained=True,
            reason="A blocking potential conflict exists in retrieved knowledge.",
            missing=missing,
            recommended_next_step="A human must resolve the policy conflict before acting.",
        )
    if unsupported_gate.state == "BLOCKED" and coverage.supported_claims == 0:
        return AbstentionResult(
            abstained=True,
            reason="The proposed action lacks supporting evidence.",
            missing=missing,
            recommended_next_step="Human investigation required.",
        )
    if coverage.evidence_requiring_claims > 0 and coverage.supported_claims == 0 and not above:
        return AbstentionResult(
            abstained=True,
            reason="Insufficient evidence for a safe recommendation.",
            missing=missing,
            recommended_next_step="Human investigation required.",
        )
    return AbstentionResult(abstained=False)


def _aggregate_outcome(
    abstained: bool,
    gates: AssuranceGates,
    forced_human_escalation: bool,
    review_status: str,
) -> str:
    if abstained:
        return "ABSTAINED"
    if (
        forced_human_escalation
        or review_status == "ESCALATE"
        or gates.independent_review.state == "ESCALATE"
    ):
        return "ESCALATION_REQUIRED"
    if (
        gates.evidence_support.state == "BLOCKED"
        or gates.unsupported_action.state == "BLOCKED"
        or gates.conflicting_evidence.state == "BLOCKED"
        or gates.evidence_coverage.state == "BLOCKED"
    ):
        return "BLOCKED_BY_EVIDENCE"
    if (
        gates.evidence_support.state == "WARNING"
        or gates.evidence_coverage.state == "WARNING"
        or gates.missing_information.state in {"WARNING", "HUMAN_REQUIRED"}
        or gates.conflicting_evidence.state == "WARNING"
        or gates.independent_review.state == "REVISE"
    ):
        return "NEEDS_ATTENTION"
    return "READY_FOR_HUMAN_REVIEW"


def _blocking_issues(gates: AssuranceGates, abstention: AbstentionResult) -> list[str]:
    issues = []
    for gate in (
        gates.evidence_support,
        gates.evidence_coverage,
        gates.missing_information,
        gates.conflicting_evidence,
        gates.unsupported_action,
        gates.independent_review,
    ):
        if gate.state in {"BLOCKED", "HUMAN_REQUIRED", "ESCALATE"}:
            issues.append(f"{gate.label}: {gate.state}")
    if abstention.abstained and abstention.reason:
        issues.append(abstention.reason)
    return issues


def _revision_delta(
    original: ResolutionDraft | None,
    revised: ResolutionDraft,
    review: ReviewResult,
    revision_count: int,
) -> RevisionDelta:
    if not original or revision_count < 1:
        return RevisionDelta(occurred=False)
    original_claims = {item.text for item in original.claims}
    revised_claims = {item.text for item in revised.claims}
    original_cited = {chunk_id for item in original.claims for chunk_id in item.cited_chunk_ids}
    revised_cited = {chunk_id for item in revised.claims for chunk_id in item.cited_chunk_ids}
    removed = sorted(original_claims - revised_claims)
    added = sorted(revised_claims - original_claims)
    challenged = [*review.recommended_changes, *review.unsupported_claims, *review.grounding_issues]
    remaining = []
    if review.status in {"REVISE", "ESCALATE"}:
        remaining.append(review.review_summary)
    original_action = original.proposed_action or " ".join(original.recommended_actions[:1])
    revised_action = revised.proposed_action or " ".join(revised.recommended_actions[:1])
    changed = []
    if original_action != revised_action:
        changed.append("Proposed action changed")
    if original.customer_response_draft != revised.customer_response_draft:
        changed.append("Customer draft changed")
    changed.extend(f"Added claim: {item}" for item in added[:4])
    changed.extend(f"Removed claim: {item}" for item in removed[:4])
    added_evidence = []
    if len(revised_cited) > len(original_cited):
        added_evidence.append("Revised draft cited additional retrieved evidence")
    return RevisionDelta(
        occurred=True,
        reviewer_challenged=[item for item in challenged if item][:8],
        changed=changed[:8],
        removed_unsupported_claims=removed[:8],
        added_evidence_requirement=added_evidence,
        remaining_concern=remaining,
        original_action=original_action or None,
        revised_action=revised_action or None,
    )


def _packet(
    *,
    ticket_subject: str,
    triage: TriageResult,
    resolution: ResolutionDraft,
    review: ReviewResult,
    retrieved: list[RetrievedChunk],
    outcome: str,
    gates: AssuranceGates,
    ledger: list[EvidenceLedgerEntry],
    gaps: list[EvidenceGap],
    conflicts: list[ValidatedConflict],
    risk_flags: list[str],
    revision_delta: RevisionDelta,
    abstention: AbstentionResult,
    prompt_versions: dict[str, int],
    provider_kind: str,
    model_deployment: str | None,
    embedding_model: str | None,
    run_id: str,
    revision_count: int,
    human_decision: str | None,
    human_decision_label: str | None,
) -> DecisionPacket:
    human_state = human_decision_label or (
        "awaiting human" if not human_decision else human_decision.replace("_", " ")
    )
    return DecisionPacket(
        case={
            "summary": triage.ticket_summary,
            "subject": ticket_subject,
            "category": triage.category,
            "severity": triage.severity,
        },
        ai_recommendation={
            "proposed_action": resolution.proposed_action
            or " ".join(resolution.recommended_actions[:1]),
            "customer_response_draft": resolution.customer_response_draft or None,
            "internal_summary": resolution.internal_summary,
            "abstained": abstention.abstained,
        },
        assurance_outcome=outcome,  # type: ignore[arg-type]
        assurance_gates=gates,
        evidence_ledger=ledger,
        evidence_gaps=gaps,
        conflicting_evidence=conflicts,
        risk_flags=risk_flags,
        independent_review={
            "verdict": review.status,
            "summary": review.review_summary,
            "findings": [
                *review.grounding_issues,
                *review.unsupported_claims,
                *review.recommended_changes,
            ],
        },
        revision_delta=revision_delta,
        abstention=abstention,
        human_decision={
            "state": human_state,
            "decision": human_decision,
        },
        audit={
            "run_id": run_id,
            "prompt_versions": prompt_versions,
            "provider": provider_kind,
            "model_display_name": _model_display(model_deployment),
            "embedding_model_display_name": _model_display(embedding_model),
            "retrieved_evidence_count": len(retrieved),
            "revision_count": revision_count,
        },
    )


def _model_display(value: str | None) -> str | None:
    if value == "gpt-5-mini":
        return "GPT 5 Mini"
    if value == "text-embedding-3-small":
        return "text embedding 3 small"
    return value


def update_packet_human_decision(
    report: dict, decision: str | None, label: str | None = None
) -> dict:
    copied = dict(report)
    packet = dict(copied.get("packet") or {})
    packet["human_decision"] = {
        "state": label or (decision.replace("_", " ") if decision else "awaiting human"),
        "decision": decision,
    }
    copied["packet"] = packet
    return copied
