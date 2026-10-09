from app.ai.retrieval.chunking import normalize_text, split_into_chunks


def test_normalize_strips_nulls() -> None:
    assert "\x00" not in normalize_text("hello\x00world")


def test_split_keeps_headings() -> None:
    text = "# Title\n\n" + ("word " * 200) + "\n\n# Second\n\n" + ("other " * 200)
    chunks = split_into_chunks(text, target_tokens=80)
    assert chunks
    assert all(body for _, body in chunks)
    assert any(title == "Second" for title, _ in chunks)
