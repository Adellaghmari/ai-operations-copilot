import pytest

from app.services.ingestion import sanitize_filename


def test_sanitize_rejects_traversal() -> None:
    assert sanitize_filename("../secret.txt") == "secret.txt"
    with pytest.raises(ValueError):
        sanitize_filename("..")
