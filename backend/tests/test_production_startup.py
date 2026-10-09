import inspect
from pathlib import Path

from app.main import lifespan


def test_production_startup_skips_schema_and_seed() -> None:
    source = inspect.getsource(lifespan)
    assert 'settings.app_env != "production"' in source
    assert "create_schema" in source
    assert "seed_database" in source


def test_backend_dockerfile_starts_uvicorn_only() -> None:
    dockerfile = Path(__file__).resolve().parents[2] / "docker" / "backend.Dockerfile"
    text = dockerfile.read_text(encoding="utf-8")
    assert 'CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]' in text
    assert "scripts.seed" not in text
    assert "alembic upgrade" not in text.split("CMD", 1)[1]
