"""payment method: cash or Wish"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Every payment made before this version was cash. Added in place, so the append-only
    # triggers on the table are left alone.
    op.execute(
        "ALTER TABLE payments ADD COLUMN method VARCHAR NOT NULL DEFAULT 'cash'"
        " CONSTRAINT ck_payments_method CHECK (method IN ('cash', 'wish'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE payments DROP COLUMN method")
