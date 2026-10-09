from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AppMode = Literal["local", "test", "foundry"]

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILES = (str(_REPO_ROOT / ".env"), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES, env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "AI Operations Copilot"
    app_env: str = "development"
    app_mode: AppMode = "local"
    log_level: str = "INFO"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173"

    database_url: str = "postgresql+asyncpg://copilot:copilot@localhost:5432/ai_operations_copilot"
    database_url_sync: str = (
        "postgresql+psycopg://copilot:copilot@localhost:5432/ai_operations_copilot"
    )

    foundry_project_endpoint: str = ""
    foundry_model: str = "gpt-5-mini"
    foundry_api_key: str = ""
    foundry_models_endpoint: str = ""
    foundry_models_api_key: str = ""
    foundry_embedding_model: str = "text-embedding-3-small"
    foundry_embedding_dimensions: int = 1536

    retrieval_top_k: int = 6
    retrieval_min_score: float = 0.22
    retrieval_rrf_k: int = 60
    chunk_target_tokens: int = 800
    chunk_overlap_ratio: float = 0.15

    max_ticket_chars: int = 8000
    max_upload_bytes: int = 5_242_880
    # gpt-5-mini reasoning tokens count against max_output_tokens. Live Foundry
    # ResolutionDraft JSON truncated at 2400 and 4096; 16384 is the smallest bound
    # that completed structured Resolution + claims without cutting off mid-object.
    max_model_output_tokens: int = 16384
    ai_request_timeout_seconds: int = 60
    daily_demo_ai_run_limit: int = 40
    demo_max_tickets: int = 250
    demo_guest_cookie_name: str = "aoc_demo_guest"

    otel_service_name: str = "ai-operations-copilot"
    otel_exporter_otlp_endpoint: str = ""
    enable_sensitive_telemetry: bool = False

    demo_public: bool = True
    demo_disable_full_eval: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def foundry_configured(self) -> bool:
        return bool(self.foundry_project_endpoint and self.foundry_models_endpoint)

    @property
    def uses_foundry(self) -> bool:
        return self.app_mode == "foundry" and self.foundry_configured

    @model_validator(mode="after")
    def reject_test_fixtures_in_production(self) -> Self:
        if self.app_env == "production" and self.app_mode == "test":
            raise ValueError(
                "APP_ENV=production cannot use APP_MODE=test. Deterministic fixtures are forbidden in production."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
