from sqlalchemy import UniqueConstraint

from app.database import get_session_factory
from app.models.gamification import DailyQuest, TopicItemProgress, XPTransaction
from app.models.interactions import SavedItem
from app.models.users import User
from app.services.data_integrity import audit_data_integrity


def test_current_integrity_models_have_database_uniqueness_guards():
    saved_constraints = {c.name for c in SavedItem.__table__.constraints if isinstance(c, UniqueConstraint)}
    daily_constraints = {c.name for c in DailyQuest.__table__.constraints if isinstance(c, UniqueConstraint)}
    progress_constraints = {c.name for c in TopicItemProgress.__table__.constraints if isinstance(c, UniqueConstraint)}

    assert "uq_saved_items_user_target" in saved_constraints
    assert "uq_daily_quests_user_type_date" in daily_constraints
    assert "uq_topic_item_progress_user_item" in progress_constraints


def test_data_integrity_audit_reports_duplicate_xp_keys_across_users(run_db):
    async def _seed_and_audit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user_one = User(email="audit-one@example.com", role="student", password="x", is_active=True)
            user_two = User(email="audit-two@example.com", role="student", password="x", is_active=True)
            db.add_all([user_one, user_two])
            await db.flush()
            await db.execute(
                XPTransaction.__table__.insert(),
                [
                    {"user_id": user_one.id, "amount": 1, "reason": "test", "idempotency_key": "shared-key"},
                    {"user_id": user_two.id, "amount": 1, "reason": "test", "idempotency_key": "shared-key"},
                    {"user_id": user_one.id, "amount": 1, "reason": "test", "idempotency_key": ""},
                ],
            )
            findings = await audit_data_integrity(db)
            await db.rollback()
            return findings

    checks = {finding.check: finding for finding in run_db(_seed_and_audit())}

    assert checks["xp_transaction_duplicate_idempotency_key"].key == {"idempotency_key": "shared-key"}
