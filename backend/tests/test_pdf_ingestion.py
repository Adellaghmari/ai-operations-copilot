from io import BytesIO

import pytest
from pypdf import PdfWriter

from app.services.ingestion import DocumentParseError, extract_text


def test_empty_text_file_is_rejected() -> None:
    with pytest.raises(DocumentParseError, match="empty"):
        extract_text("notes.txt", b"   ")


def test_corrupt_pdf_is_rejected() -> None:
    with pytest.raises(DocumentParseError, match="PDF"):
        extract_text("broken.pdf", b"not-a-pdf")


def test_blank_pdf_is_rejected() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = BytesIO()
    writer.write(buffer)
    with pytest.raises(DocumentParseError, match="no extractable text"):
        extract_text("blank.pdf", buffer.getvalue())


def test_markdown_extracts_text() -> None:
    assert "Refunds" in extract_text("billing.md", b"# Refunds\n\nRefunds require a human specialist.")
