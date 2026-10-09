import re

from app.config import get_settings


def estimate_tokens(text: str) -> int:
    return max(1, len(text.split()))


def normalize_text(text: str) -> str:
    cleaned = text.replace("\x00", " ")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def split_into_chunks(text: str, target_tokens: int | None = None) -> list[tuple[str, str]]:
    settings = get_settings()
    target = target_tokens or settings.chunk_target_tokens
    overlap_tokens = max(20, int(target * settings.chunk_overlap_ratio))
    normalized = normalize_text(text)
    if not normalized:
        return []

    sections = _split_sections(normalized)
    chunks: list[tuple[str, str]] = []
    for section_title, section_body in sections:
        words = section_body.split()
        if not words:
            continue
        start = 0
        while start < len(words):
            end = min(len(words), start + target)
            piece = " ".join(words[start:end]).strip()
            if piece:
                chunks.append((section_title, piece))
            if end >= len(words):
                break
            start = max(end - overlap_tokens, start + 1)
    return chunks


def _split_sections(text: str) -> list[tuple[str, str]]:
    parts = re.split(r"(?m)^#{1,3} ", text)
    headings = re.findall(r"(?m)^#{1,3} (.+)$", text)
    if len(parts) <= 1:
        return [("Overview", text)]
    sections: list[tuple[str, str]] = []
    preamble = parts[0].strip()
    if preamble:
        sections.append(("Overview", preamble))
    for index, body in enumerate(parts[1:]):
        title = headings[index].strip() if index < len(headings) else f"Section {index + 1}"
        content = re.sub(r"^.*\n", "", body, count=1) if body.startswith(title) else body
        sections.append((title, content.strip()))
    return [(title, body) for title, body in sections if body]
