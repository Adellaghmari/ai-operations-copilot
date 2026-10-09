"""additive decision assurance fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-08
"""

from sqlalchemy import inspect

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    ticket_cols = {column["name"] for column in inspector.get_columns("tickets")}
    run_cols = {column["name"] for column in inspector.get_columns("ai_runs")}
    ticket_indexes = {index["name"] for index in inspector.get_indexes("tickets")}
    run_indexes = {index["name"] for index in inspector.get_indexes("ai_runs")}

    if "demo_scenario" not in ticket_cols:
        op.execute("ALTER TABLE tickets ADD COLUMN demo_scenario VARCHAR(80)")
    if "ix_tickets_demo_scenario" not in ticket_indexes:
        op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_demo_scenario ON tickets (demo_scenario)")

    additions = {
        "original_resolution_draft": "JSONB",
        "assurance_report": "JSONB",
        "assurance_outcome": "VARCHAR(60)",
        "abstained": "BOOLEAN NOT NULL DEFAULT FALSE",
        "supported_claim_count": "INTEGER NOT NULL DEFAULT 0",
        "unsupported_claim_count": "INTEGER NOT NULL DEFAULT 0",
        "conflict_count": "INTEGER NOT NULL DEFAULT 0",
        "missing_information_count": "INTEGER NOT NULL DEFAULT 0",
    }
    for name, ddl in additions.items():
        if name not in run_cols:
            op.execute(f"ALTER TABLE ai_runs ADD COLUMN {name} {ddl}")
    if "ix_ai_runs_assurance_outcome" not in run_indexes:
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_ai_runs_assurance_outcome ON ai_runs (assurance_outcome)"
        )
    if "ix_ai_runs_abstained" not in run_indexes:
        op.execute("CREATE INDEX IF NOT EXISTS ix_ai_runs_abstained ON ai_runs (abstained)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_ai_runs_abstained")
    op.execute("DROP INDEX IF EXISTS ix_ai_runs_assurance_outcome")
    op.execute("DROP INDEX IF EXISTS ix_tickets_demo_scenario")
    for name in (
        "missing_information_count",
        "conflict_count",
        "unsupported_claim_count",
        "supported_claim_count",
        "abstained",
        "assurance_outcome",
        "assurance_report",
        "original_resolution_draft",
    ):
        op.execute(f"ALTER TABLE ai_runs DROP COLUMN IF EXISTS {name}")
    op.execute("ALTER TABLE tickets DROP COLUMN IF EXISTS demo_scenario")
