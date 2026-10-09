from app.ai.assurance.engine import DecisionAssuranceEngine
from app.ai.assurance.replay import compare_runs
from app.ai.citations import bind_citations_to_retrieved
from app.schemas.ai import (
    ClaimEvidenceAssessment,
    PotentialConflict,
    ResolutionClaim,
    ResolutionDraft,
    RetrievedChunk,
    ReviewResult,
    SourceCitation,
    TriageResult,
)


def _chunk(chunk_id: str, name: str, section: str, body: str, score: float = 0.9) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id=f"doc-{chunk_id}",
        document_name=name,
        section=section,
        body=body,
        retrieval_score=score,
    )


def _triage(**overrides: object) -> TriageResult:
    payload = {
        "ticket_summary": "Synthetic case",
        "category": "billing",
        "severity": "P3",
        "urgency": "normal",
        "sentiment": "neutral",
        "retrieval_query": "refund policy",
        "requires_human_attention": True,
        "reasoning_summary": "Fixture triage",
    }
    payload.update(overrides)
    return TriageResult.model_validate(payload)


def _draft(**overrides: object) -> ResolutionDraft:
    payload = {
        "internal_summary": "Internal note",
        "recommended_actions": ["Ask a human to review"],
        "customer_response_draft": "A specialist will review.",
        "escalation_required": False,
        "proposed_action": "Ask a human to review",
        "claims": [],
    }
    payload.update(overrides)
    return ResolutionDraft.model_validate(payload)


def _review(**overrides: object) -> ReviewResult:
    payload = {"status": "PASS", "review_summary": "Grounded against retrieved sources."}
    payload.update(overrides)
    return ReviewResult.model_validate(payload)


def _evaluate(**kwargs: object):
    engine = DecisionAssuranceEngine()
    defaults = {
        "ticket_subject": "Case",
        "ticket_body": "How do I export tickets?",
        "triage": _triage(category="how_to", severity="P4"),
        "retrieved": [
            _chunk(
                "11111111-1111-1111-1111-111111111111",
                "How to export tickets",
                "Exports",
                "Admins can export tickets from Reports > Exports.",
            )
        ],
        "resolution": _draft(
            proposed_action="Point the admin to Reports > Exports.",
            claims=[
                ResolutionClaim(
                    claim_id="c1",
                    text="Admins can export tickets from Reports > Exports.",
                    category="procedure",
                    requires_evidence=True,
                    cited_chunk_ids=["11111111-1111-1111-1111-111111111111"],
                )
            ],
            source_citations=[
                SourceCitation(
                    chunk_id="11111111-1111-1111-1111-111111111111",
                    document_id="doc-11111111-1111-1111-1111-111111111111",
                    document_name="How to export tickets",
                    section="Exports",
                    snippet="Admins can export tickets from Reports > Exports.",
                )
            ],
        ),
        "review": _review(),
        "original_resolution": None,
        "revision_count": 0,
        "forced_human_escalation": False,
        "min_retrieval_score": 0.22,
        "prompt_versions": {"resolution": 2, "review": 2},
        "provider_kind": "test_fixture",
        "model_deployment": "gpt-5-mini",
        "embedding_model": "text-embedding-3-small",
        "run_id": "run-1",
    }
    defaults.update(kwargs)
    return engine.evaluate(**defaults)  # type: ignore[arg-type]


def test_supported_claim_maps_to_retrieved_chunk() -> None:
    report, _ = _evaluate()
    assert report.ledger[0].support_state == "SUPPORTED"
    assert report.ledger[0].chunk_ids == ["11111111-1111-1111-1111-111111111111"]
    assert report.coverage.display == "1 of 1 claims supported"
    assert report.outcome == "READY_FOR_HUMAN_REVIEW"
    assert report.gates.human_control.state == "HUMAN_REQUIRED"


def test_unsupported_claim_has_no_invented_evidence() -> None:
    report, _ = _evaluate(
        resolution=_draft(
            proposed_action="Support may temporarily disable MFA.",
            claims=[
                ResolutionClaim(
                    claim_id="bad",
                    text="Support may temporarily disable MFA.",
                    category="action",
                    requires_evidence=True,
                    cited_chunk_ids=["99999999-9999-9999-9999-999999999999"],
                )
            ],
        )
    )
    assert report.ledger[0].support_state == "UNSUPPORTED"
    assert report.ledger[0].chunk_ids == []
    assert report.gates.evidence_support.state == "BLOCKED"
    assert report.gates.unsupported_action.state == "BLOCKED"


def test_partial_support_is_warning_not_confidence() -> None:
    report, _ = _evaluate(
        review=_review(
            claim_assessments=[
                ClaimEvidenceAssessment(
                    claim_id="c1",
                    support_state="PARTIALLY_SUPPORTED",
                    valid_chunk_ids=["11111111-1111-1111-1111-111111111111"],
                    issue="Only the export location is supported.",
                    materiality="LOW",
                )
            ]
        )
    )
    assert report.ledger[0].support_state == "PARTIALLY_SUPPORTED"
    assert report.gates.evidence_support.state == "WARNING"
    assert "confidence" not in report.coverage.display.lower()


def test_invalid_chunk_ids_are_dropped_before_ledger() -> None:
    retrieved = [
        _chunk(
            "11111111-1111-1111-1111-111111111111",
            "How to export tickets",
            "Exports",
            "Admins can export tickets from Reports > Exports.",
        )
    ]
    draft = _draft(
        claims=[
            ResolutionClaim(
                claim_id="c1",
                text="Admins can export tickets.",
                cited_chunk_ids=[
                    "11111111-1111-1111-1111-111111111111",
                    "deadbeef-dead-dead-dead-deadbeefdead",
                ],
            )
        ],
        source_citations=[
            SourceCitation(
                chunk_id="deadbeef-dead-dead-dead-deadbeefdead",
                document_id="invented",
                document_name="Invented",
                section="None",
                snippet="fake",
            )
        ],
    )
    bound = bind_citations_to_retrieved(draft, retrieved)
    assert bound.source_citations == []
    assert bound.claims[0].cited_chunk_ids == ["11111111-1111-1111-1111-111111111111"]


def test_missing_critical_information_abstains_and_clears_customer_draft() -> None:
    report, resolution = _evaluate(
        ticket_subject="Transfer ownership",
        ticket_body=(
            "Change the account owner and grant me production admin. Transfer ownership now."
        ),
        triage=_triage(
            category="account_access", severity="P2", missing_information=["affected account email"]
        ),
        retrieved=[
            _chunk(
                "22222222-2222-2222-2222-222222222222",
                "Domain ownership and access changes",
                "Identity verification",
                "Identity verification is required before transferring workspace ownership.",
            )
        ],
        resolution=_draft(
            customer_response_draft="We transferred ownership as requested.",
            proposed_action="Transfer production ownership now.",
            claims=[
                ResolutionClaim(
                    claim_id="own",
                    text="Support can transfer ownership without verification.",
                    category="action",
                    requires_evidence=True,
                    cited_chunk_ids=[],
                )
            ],
        ),
    )
    assert report.abstention.abstained is True
    assert report.outcome == "ABSTAINED"
    assert resolution.customer_response_draft == ""
    assert report.gates.missing_information.state == "HUMAN_REQUIRED"
    assert any(item.concept == "identity verification" for item in report.gaps)


def test_material_policy_conflict_uses_two_real_chunks() -> None:
    general = _chunk(
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "Billing, invoices, and refunds",
        "Refunds",
        "Eligible refunds apply only to unused prepaid months and exclude usage overages.",
    )
    enterprise = _chunk(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "Enterprise refund policy",
        "Finance approval",
        "Enterprise refunds require written finance approval. "
        "Support must not issue an immediate refund.",
    )
    report, _ = _evaluate(
        ticket_subject="Immediate Enterprise refund",
        ticket_body=(
            "We are on Enterprise. Please refund the last unused month "
            "immediately to the card on file."
        ),
        triage=_triage(category="billing", severity="P2"),
        retrieved=[general, enterprise],
        resolution=_draft(
            proposed_action="Issue the refund immediately.",
            claims=[
                ResolutionClaim(
                    claim_id="r1",
                    text="Eligible refunds apply to unused prepaid months.",
                    category="policy",
                    cited_chunk_ids=[general.chunk_id],
                ),
                ResolutionClaim(
                    claim_id="r2",
                    text="Issue an immediate Enterprise refund.",
                    category="action",
                    cited_chunk_ids=[enterprise.chunk_id],
                ),
            ],
        ),
        review=_review(
            potential_conflicts=[
                PotentialConflict(
                    chunk_a=general.chunk_id,
                    chunk_b=enterprise.chunk_id,
                    summary="General refunds and Enterprise finance approval disagree.",
                    materiality="MATERIAL",
                    impact="Do not refund immediately.",
                )
            ]
        ),
    )
    assert len(report.conflicts) >= 1
    conflict = report.conflicts[0]
    assert conflict.label == "POTENTIAL_CONFLICT"
    assert {conflict.chunk_a, conflict.chunk_b} == {general.chunk_id, enterprise.chunk_id}
    assert report.gates.conflicting_evidence.state != "PASS"
    assert report.outcome in {"ABSTAINED", "BLOCKED_BY_EVIDENCE", "NEEDS_ATTENTION"}


def test_invented_conflict_chunk_ids_are_rejected() -> None:
    retrieved = [
        _chunk(
            "11111111-1111-1111-1111-111111111111",
            "How to export tickets",
            "Exports",
            "Export CSV.",
        )
    ]
    report, _ = _evaluate(
        retrieved=retrieved,
        review=_review(
            potential_conflicts=[
                PotentialConflict(
                    chunk_a="00000000-0000-0000-0000-000000000000",
                    chunk_b="11111111-1111-1111-1111-111111111111",
                    summary="Invented conflict",
                    materiality="BLOCKING",
                    impact="Should not appear",
                )
            ]
        ),
    )
    assert report.conflicts == []
    assert report.gates.conflicting_evidence.state == "PASS"


def test_low_retrieval_scores_cause_true_abstention() -> None:
    report, resolution = _evaluate(
        retrieved=[
            _chunk(
                "11111111-1111-1111-1111-111111111111",
                "How to export tickets",
                "Exports",
                "Admins can export tickets.",
                score=0.01,
            )
        ],
        ticket_body="How do I reset cafeteria firmware?",
    )
    assert report.abstention.abstained is True
    assert report.outcome == "ABSTAINED"
    assert resolution.customer_response_draft == ""


def test_revision_delta_records_removed_unsupported_claim() -> None:
    original = _draft(
        proposed_action="Disable MFA now.",
        claims=[
            ResolutionClaim(
                claim_id="bad",
                text="Support may temporarily disable MFA.",
                category="action",
                cited_chunk_ids=[],
            )
        ],
    )
    revised = _draft(
        proposed_action="Escalate to security. Do not disable MFA.",
        claims=[
            ResolutionClaim(
                claim_id="good",
                text="Support must not disable MFA.",
                category="policy",
                cited_chunk_ids=["11111111-1111-1111-1111-111111111111"],
            )
        ],
    )
    report, _ = _evaluate(
        resolution=revised,
        original_resolution=original,
        revision_count=1,
        review=_review(
            status="PASS",
            recommended_changes=["Remove the MFA bypass"],
            unsupported_claims=["Support may temporarily disable MFA."],
        ),
        ticket_body="Please disable MFA and skip Okta.",
        triage=_triage(category="security", severity="P1"),
    )
    assert report.revision_delta.occurred is True
    assert any(
        "Support may temporarily disable MFA." in item
        for item in report.revision_delta.removed_unsupported_claims
    )
    assert report.revision_delta.original_action == "Disable MFA now."


def test_forced_escalation_after_failed_revision() -> None:
    report, _ = _evaluate(
        review=_review(status="REVISE", review_summary="Still unsupported after revision."),
        revision_count=1,
        forced_human_escalation=True,
        original_resolution=_draft(proposed_action="Guess a refund amount."),
    )
    assert report.outcome == "ESCALATION_REQUIRED"
    assert report.revision_delta.remaining_concern


def test_decision_packet_contains_inspectable_trail() -> None:
    report, _ = _evaluate()
    packet = report.packet
    assert packet.case["category"] == "how_to"
    assert packet.assurance_outcome == "READY_FOR_HUMAN_REVIEW"
    assert packet.audit["model_display_name"] == "GPT 5 Mini"
    assert packet.audit["embedding_model_display_name"] == "text embedding 3 small"
    assert packet.human_decision["state"] == "awaiting human"
    assert packet.evidence_ledger[0].support_state == "SUPPORTED"


def test_decision_replay_detects_evidence_and_recommendation_change() -> None:
    report_a, _ = _evaluate()
    general = _chunk(
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "Billing, invoices, and refunds",
        "Refunds",
        "Refunds require a human billing specialist.",
    )
    enterprise = _chunk(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "Enterprise refund policy",
        "Finance approval",
        "Enterprise refunds require written finance approval.",
    )
    report_b, _ = _evaluate(
        ticket_body="We are on Enterprise. Please refund immediately.",
        triage=_triage(category="billing", severity="P2"),
        retrieved=[general, enterprise],
        resolution=_draft(
            proposed_action="Finance approval required",
            claims=[
                ResolutionClaim(
                    claim_id="ent",
                    text="Enterprise refunds require finance approval.",
                    cited_chunk_ids=[enterprise.chunk_id],
                )
            ],
        ),
    )
    left = {
        "id": "run-a",
        "assurance_report": report_a.model_dump(),
        "retrieval_result": {
            "chunks": [
                item.model_dump()
                for item in [
                    _chunk(
                        "11111111-1111-1111-1111-111111111111",
                        "How to export tickets",
                        "Exports",
                        "Export CSV.",
                    )
                ]
            ]
        },
        "review_result": {"status": "PASS"},
        "human_decision": None,
        "prompt_versions": {"resolution": 2},
        "revision_count": 0,
        "triage_result": {"category": "how_to", "severity": "P4"},
        "resolution_draft": {"proposed_action": "Point the admin to Reports > Exports."},
    }
    right = {
        "id": "run-b",
        "assurance_report": report_b.model_dump(),
        "retrieval_result": {"chunks": [general.model_dump(), enterprise.model_dump()]},
        "review_result": {"status": "PASS"},
        "human_decision": "escalate",
        "prompt_versions": {"resolution": 2},
        "revision_count": 0,
        "triage_result": {"category": "billing", "severity": "P2"},
        "resolution_draft": {"proposed_action": "Finance approval required"},
    }
    comparison = compare_runs(left, right)
    assert comparison.identical is False
    assert "Enterprise refund policy" in comparison.evidence_added
    assert comparison.recommendation.changed is True
    assert comparison.assurance.changed is True


def test_identical_runs_are_not_manufactured_as_different() -> None:
    report, _ = _evaluate()
    payload = {
        "id": "run-a",
        "assurance_report": report.model_dump(),
        "retrieval_result": {"chunks": []},
        "review_result": {"status": "PASS"},
        "human_decision": None,
        "prompt_versions": {"resolution": 2},
        "revision_count": 0,
        "triage_result": {"category": "how_to", "severity": "P4"},
        "resolution_draft": {"proposed_action": "Point the admin to Reports > Exports."},
    }
    comparison = compare_runs(payload, {**payload, "id": "run-b"})
    assert comparison.identical is True
    assert "effectively identical" in comparison.summary
