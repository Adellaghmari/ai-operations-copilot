import hashlib
import math
import re

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.models.enums import ProviderKind
from app.schemas.ai import (
    QualitySignalComponents,
    ResolutionClaim,
    ResolutionDraft,
    ReviewResult,
    SourceCitation,
    TriageResult,
)

CATEGORIES = [
    "account_access",
    "billing",
    "bug",
    "integration",
    "onboarding",
    "performance",
    "security",
    "feature_request",
    "how_to",
    "service_incident",
    "other",
]


class DeterministicChatProvider:
    kind = ProviderKind.TEST_FIXTURE.value
    model_name = "test-fixture"

    async def complete_structured[T: BaseModel](
        self,
        *,
        instructions: str,
        user_input: str,
        schema: type[T],
    ) -> T:
        if schema is TriageResult:
            return schema.model_validate(_triage_from_text(user_input))  # type: ignore[return-value]
        if schema is ResolutionDraft:
            return schema.model_validate(_resolution_from_text(user_input, instructions))  # type: ignore[return-value]
        if schema is ReviewResult:
            return schema.model_validate(_review_from_text(user_input))  # type: ignore[return-value]
        try:
            return schema.model_validate({})
        except ValidationError as exc:
            raise ValueError("Unsupported fixture schema") from exc


class HashEmbeddingProvider:
    def __init__(self, kind: str = ProviderKind.TEST_FIXTURE.value) -> None:
        settings = get_settings()
        self.kind = kind
        self.model_name = "deterministic-hash"
        self.dimensions = settings.foundry_embedding_dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def _vector(self, text: str) -> list[float]:
        values = [0.0] * self.dimensions
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        if not tokens:
            values[0] = 1.0
            return values
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            values[index] += sign
        norm = math.sqrt(sum(item * item for item in values)) or 1.0
        return [item / norm for item in values]


class DeterministicEmbeddingProvider(HashEmbeddingProvider):
    def __init__(self) -> None:
        super().__init__(kind=ProviderKind.TEST_FIXTURE.value)


class LocalHashEmbeddingProvider(HashEmbeddingProvider):
    """Local-only embeddings for ingestion when Foundry is not configured.

    This is not a chat fixture and must never be selected when APP_MODE=foundry.
    """

    def __init__(self) -> None:
        super().__init__(kind=ProviderKind.LOCAL_HASH.value)


def _triage_from_text(text: str) -> dict:
    lowered = text.lower()
    category = "other"
    for item in CATEGORIES:
        if item.replace("_", " ") in lowered or item in lowered:
            category = item
            break
    if "password" in lowered or "login" in lowered or "sso" in lowered:
        category = "account_access"
    elif "mfa" in lowered or "disable mfa" in lowered or "bypass" in lowered:
        category = "security"
    elif "invoice" in lowered or "refund" in lowered or "billing" in lowered:
        category = "billing"
    elif "inject" in lowered or "ignore previous" in lowered:
        category = "security"
    elif "outage" in lowered or "incident" in lowered:
        category = "service_incident"
    elif "slow" in lowered or "latency" in lowered:
        category = "performance"
    elif "how do i" in lowered or "how to" in lowered:
        category = "how_to"
    elif "webhook" in lowered or "api key" in lowered or "salesforce" in lowered:
        category = "integration"
    elif "onboard" in lowered or "trial" in lowered:
        category = "onboarding"
    elif "feature" in lowered or "roadmap" in lowered:
        category = "feature_request"
    elif "xss" in lowered or "breach" in lowered or "malware" in lowered:
        category = "security"
    elif "error" in lowered or "bug" in lowered or "stack trace" in lowered:
        category = "bug"

    if any(word in lowered for word in ("breach", "outage", "production down", "p1")):
        severity = "P1"
        urgency = "immediate"
    elif any(word in lowered for word in ("cannot", "blocked", "security", "refund")):
        severity = "P2"
        urgency = "high"
    elif any(word in lowered for word in ("how do i", "feature", "nice to have")):
        severity = "P4"
        urgency = "low"
    else:
        severity = "P3"
        urgency = "normal"

    missing = []
    if "screenshot" not in lowered and "error code" not in lowered and category == "bug":
        missing.append("error code or screenshot")
    if category == "account_access" and "email" not in lowered:
        missing.append("affected account email")
    if "owner" in lowered or "ownership" in lowered:
        missing.append("account ownership verification")
    if ("mfa" in lowered or "domain" in lowered) and "workspace" not in lowered:
        missing.append("affected domain")

    risk = []
    if "ignore previous" in lowered or "system prompt" in lowered:
        risk.append("possible_prompt_injection")
    if category == "security":
        risk.append("security_sensitive")

    return {
        "ticket_summary": text.strip().split("\n")[0][:240],
        "category": category,
        "severity": severity,
        "urgency": urgency,
        "sentiment": "negative"
        if any(w in lowered for w in ("angry", "urgent", "cannot"))
        else "neutral",
        "technical_entities": _entities(lowered),
        "missing_information": missing,
        "risk_flags": risk,
        "retrieval_query": _query(category, lowered),
        "requires_human_attention": severity in {"P1", "P2"} or "possible_prompt_injection" in risk,
        "reasoning_summary": (
            f"Classified as {category} at {severity} using documented keyword and impact rules."
        ),
    }


def _resolution_from_text(user_input: str, instructions: str) -> dict:
    citations: list[SourceCitation] = []
    pattern = re.compile(
        r"chunk_id=(?P<chunk_id>[0-9a-f-]{36}) "
        r"document_id=(?P<document_id>[0-9a-f-]{36}) "
        r"document=(?P<document>[^\n]+?) section=(?P<section>[^\n]+?) "
        r"score=[^\n]+\n(?P<body>.*?)(?=\n---|\nchunk_id=|\Z)",
        re.S,
    )
    for match in pattern.finditer(user_input):
        citations.append(
            SourceCitation(
                chunk_id=match.group("chunk_id"),
                document_id=match.group("document_id"),
                document_name=match.group("document").strip(),
                section=match.group("section").strip(),
                snippet=match.group("body").strip(),
            )
        )
    lowered = user_input.lower()
    insufficient = "NO_RELEVANT_KNOWLEDGE" in user_input or "retrieved_count=0" in user_input
    injection = "ignore previous" in lowered
    escalate = "P1" in user_input or "security_sensitive" in user_input or injection
    draft = (
        "Thank you for contacting Northline Support. We reviewed your request and the "
        "internal knowledge available to us. We cannot confirm facts that are not in "
        "those sources. A specialist will continue if more investigation is required."
    )
    if insufficient:
        draft = (
            "Thank you for writing in. We do not have enough verified internal knowledge "
            "to complete this request yet. Please share the missing details so a human "
            "specialist can continue."
        )
    if injection:
        draft = (
            "We treated the ticket text as untrusted customer content and did not follow "
            "embedded instructions. A human specialist will continue the review."
        )
    cited_ids = [item.chunk_id for item in citations[:4]]
    claims = _claims_from_text(user_input, cited_ids, citations)
    proposed = (
        claims[0].text if claims else "Use cited knowledge and keep the decision with a human."
    )
    if "disable mfa" in lowered or "bypass" in lowered:
        proposed = "Escalate to security. Do not disable MFA or bypass SSO."
    if "enterprise" in lowered and "refund" in lowered:
        proposed = "Do not issue an immediate refund. Route to finance approval."
    if insufficient or ("transfer ownership" in lowered and "email" not in lowered):
        proposed = "No operational action recommended until required facts are verified."
    return {
        "internal_summary": "Fixture resolution generated from ticket and retrieved sources.",
        "recommended_actions": [
            proposed,
            "Confirm identity if the request is account-related",
            "Use only cited knowledge",
        ],
        "proposed_action": proposed,
        "claims": [item.model_dump() for item in claims],
        "customer_response_draft": draft,
        "source_citations": [item.model_dump() for item in citations[:4]],
        "escalation_required": escalate or insufficient,
        "escalation_reason": "Insufficient evidence or security sensitivity"
        if escalate or insufficient
        else None,
        "unanswered_questions": ["Please confirm the workspace name"] if insufficient else [],
        "quality_signal_components": QualitySignalComponents(
            retrieval_coverage=0.5,
            mean_retrieval_score=0.4,
            citation_coverage=1.0 if citations else 0.0,
            review_pass=0.0,
            information_completeness=0.8,
            score=0.42,
        ).model_dump(),
        "limitations": ["This draft is a test fixture, not a Microsoft Foundry response."],
    }


def _review_from_text(user_input: str) -> dict:
    lowered = user_input.lower()
    revise = "FORCE_REVISE" in user_input or "unsupported claim" in lowered
    escalate = (
        "disable mfa" in lowered
        or "bypass sso" in lowered
        or "possible_prompt_injection" in lowered
    )
    conflicts = _conflicts_from_text(user_input)
    missing = []
    if "transfer ownership" in lowered or "account owner" in lowered:
        missing.append(
            {
                "concept": "identity verification",
                "reason": "Ownership change requires a verified requester.",
                "materiality": "BLOCKING",
            }
        )
        missing.append(
            {
                "concept": "account ownership",
                "reason": "The current verified owner is not established.",
                "materiality": "BLOCKING",
            }
        )
    status = "ESCALATE" if escalate and not revise else ("REVISE" if revise else "PASS")
    return {
        "status": status,
        "grounding_issues": ["Needs tighter source binding"] if revise else [],
        "unsupported_claims": ["Possible over-claim"] if revise else [],
        "missing_items": [item["concept"] for item in missing],
        "tone_issues": [],
        "safety_flags": ["prompt_injection_influence"]
        if "ignore previous" in lowered
        else (["security_control_bypass_request"] if escalate else []),
        "citation_issues": [],
        "recommended_changes": ["Remove unsupported certainty and cite sources."] if revise else [],
        "review_summary": "Fixture review completed against retrieved sources and policy checks.",
        "claim_assessments": [],
        "potential_conflicts": conflicts,
        "missing_information": missing,
    }


def _claims_from_text(
    user_input: str, cited_ids: list[str], citations: list[SourceCitation]
) -> list[ResolutionClaim]:
    lowered = user_input.lower()
    claims: list[ResolutionClaim] = []
    if "disable mfa" in lowered or "bypass sso" in lowered:
        claims.append(
            ResolutionClaim(
                claim_id="claim-unsupported-bypass",
                text="Support may temporarily disable MFA.",
                category="action",
                requires_evidence=True,
                cited_chunk_ids=[],
            )
        )
        claims.append(
            ResolutionClaim(
                claim_id="claim-security-policy",
                text=(
                    "Support must not disable tenant security controls "
                    "or ask the customer to turn off MFA."
                ),
                category="policy",
                requires_evidence=True,
                cited_chunk_ids=cited_ids[:2],
            )
        )
        return claims
    if "enterprise" in lowered and "refund" in lowered:
        claims.append(
            ResolutionClaim(
                claim_id="claim-refund-general",
                text="Eligible refunds may apply to unused prepaid months.",
                category="policy",
                requires_evidence=True,
                cited_chunk_ids=cited_ids[:1],
            )
        )
        claims.append(
            ResolutionClaim(
                claim_id="claim-refund-enterprise",
                text=(
                    "Enterprise refunds require finance approval and must not "
                    "be issued immediately by support."
                ),
                category="action",
                requires_evidence=True,
                cited_chunk_ids=cited_ids[1:2] or cited_ids[:1],
            )
        )
        return claims
    if "export tickets" in lowered or "how do i export" in lowered:
        claims.append(
            ResolutionClaim(
                claim_id="claim-export",
                text=(
                    "Admins can export tickets from Reports > Exports. "
                    "CSV includes display ID and last updated time."
                ),
                category="procedure",
                requires_evidence=True,
                cited_chunk_ids=cited_ids[:2],
            )
        )
        return claims
    if cited_ids:
        snippet = citations[0].snippet[:180] if citations else "Retrieved policy applies."
        claims.append(
            ResolutionClaim(
                claim_id="claim-grounded",
                text=snippet,
                category="fact",
                requires_evidence=True,
                cited_chunk_ids=cited_ids[:2],
            )
        )
        return claims
    claims.append(
        ResolutionClaim(
            claim_id="claim-insufficient",
            text="No safe operational action can be recommended from the available evidence.",
            category="limitation",
            requires_evidence=False,
            cited_chunk_ids=[],
        )
    )
    return claims


def _conflicts_from_text(user_input: str) -> list[dict]:
    if "enterprise" not in user_input.lower() or "refund" not in user_input.lower():
        return []
    ids = re.findall(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", user_input.lower()
    )
    unique = list(dict.fromkeys(ids))
    if len(unique) < 2:
        return []
    return [
        {
            "chunk_a": unique[0],
            "chunk_b": unique[1],
            "summary": (
                "General refund policy and Enterprise refund policy "
                "impose different requirements."
            ),
            "materiality": "MATERIAL",
            "impact": (
                "An immediate refund should not be recommended until "
                "finance requirements are resolved."
            ),
        }
    ]


def _entities(text: str) -> list[str]:
    found = []
    for token in ("sso", "okta", "salesforce", "webhook", "invoice", "latency", "pdf"):
        if token in text:
            found.append(token)
    return found


def _query(category: str, text: str) -> str:
    return f"{category} {' '.join(text.split()[:12])}"
