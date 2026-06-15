import importlib.util
import asyncio
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import UniqueConstraint

from app.database import get_session_factory
from app.models.gamification import DailyQuest, QuizAttempt, TopicItemProgress, XPDailyCapUsage, XPTransaction
from app.models.interactions import SavedItem
from app.models.quizzes import QuestionSet
from app.models.users import User
from app.services.data_integrity import audit_data_integrity
from app.services.xp import XP_DAILY_CAPS

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
AUDIT_SCRIPT_PATH = BACKEND_ROOT / "scripts" / "audit_data_integrity.py"


def _load_data_integrity_audit_script():
    spec = importlib.util.spec_from_file_location(
        "audit_data_integrity_for_tests",
        AUDIT_SCRIPT_PATH,
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_current_integrity_models_have_database_uniqueness_guards():
    saved_constraints = {c.name for c in SavedItem.__table__.constraints if isinstance(c, UniqueConstraint)}
    daily_constraints = {c.name for c in DailyQuest.__table__.constraints if isinstance(c, UniqueConstraint)}
    question_set_constraints = {c.name for c in QuestionSet.__table__.constraints if isinstance(c, UniqueConstraint)}
    quiz_attempt_constraints = {c.name for c in QuizAttempt.__table__.constraints if isinstance(c, UniqueConstraint)}
    progress_constraints = {c.name for c in TopicItemProgress.__table__.constraints if isinstance(c, UniqueConstraint)}

    assert "uq_saved_items_user_target" in saved_constraints
    assert "uq_daily_quests_user_type_date" in daily_constraints
    assert "uq_question_sets_tab_content" in question_set_constraints
    assert "uq_quiz_attempts_user_set_attempt_number" in quiz_attempt_constraints
    assert "uq_topic_item_progress_user_item" in progress_constraints


def test_topic_item_progress_has_cascading_topic_item_foreign_key():
    foreign_keys = {
        tuple(constraint.column_keys): (constraint.referred_table.name, constraint.ondelete)
        for constraint in TopicItemProgress.__table__.foreign_key_constraints
    }

    assert foreign_keys[("topic_item_id",)] == ("topic_items", "CASCADE")


def test_topic_item_progress_fk_migration_cleans_dangling_rows_first():
    migration_source = (
        BACKEND_ROOT
        / "alembic"
        / "versions"
        / "0046_topic_item_progress_topic_item_fk.py"
    ).read_text(encoding="utf-8")

    assert "DELETE FROM topic_item_progress" in migration_source
    assert "op.create_foreign_key" in migration_source
    assert 'ondelete="CASCADE"' in migration_source


def test_data_integrity_audit_reports_orphan_topic_item_progress(run_db):
    audit_script = _load_data_integrity_audit_script()

    async def _seed_and_audit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            fixture = await audit_script.seed_integrity_audit_fixture(db)
            findings = await audit_data_integrity(db)
            await db.rollback()
            return fixture, findings

    fixture, findings = run_db(_seed_and_audit())

    matches = [
        finding
        for finding in findings
        if finding.check == "topic_item_progress_orphan_topic_item"
        and finding.key == {"topic_item_id": fixture.orphan_topic_item_id}
    ]
    assert len(matches) == 1
    assert matches[0].count == 1


def test_data_integrity_audit_does_not_report_xp_keys_shared_across_users(run_db):
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

    findings = run_db(_seed_and_audit())

    assert not any(
        finding.check == "xp_transaction_duplicate_idempotency_key"
        and finding.key.get("idempotency_key") == "shared-key"
        for finding in findings
    )


def test_data_integrity_audit_reports_xp_daily_cap_violations(run_db):
    async def _seed_and_audit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = User(email="audit-xp-cap@example.com", role="student", password="x", is_active=True)
            db.add(user)
            await db.flush()
            await db.execute(
                XPTransaction.__table__.insert(),
                [
                    {
                        "user_id": user.id,
                        "amount": XP_DAILY_CAPS["quiz_correct"],
                        "requested_amount": XP_DAILY_CAPS["quiz_correct"],
                        "reason": "quiz_correct",
                        "idempotency_key": "cap-a",
                        "daily_cap_category": "quiz_correct",
                        "daily_cap_date": date(2031, 6, 1),
                    },
                    {
                        "user_id": user.id,
                        "amount": 1,
                        "requested_amount": 1,
                        "reason": "quiz_correct",
                        "idempotency_key": "cap-b",
                        "daily_cap_category": "quiz_correct",
                        "daily_cap_date": date(2031, 6, 1),
                    },
                ],
            )
            findings = await audit_data_integrity(db)
            await db.rollback()
            return user.id, findings

    user_id, findings = run_db(_seed_and_audit())
    matches = [finding for finding in findings if finding.check == "xp_daily_cap_exceeded"]

    assert len(matches) == 1
    assert matches[0].key == {
        "user_id": user_id,
        "daily_cap_date": date(2031, 6, 1),
        "daily_cap_category": "quiz_correct",
        "limit": XP_DAILY_CAPS["quiz_correct"],
    }
    assert matches[0].count == XP_DAILY_CAPS["quiz_correct"] + 1


def test_data_integrity_audit_reports_xp_daily_cap_usage_drift(run_db):
    async def _seed_and_audit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = User(email="audit-xp-cap-usage@example.com", role="student", password="x", is_active=True)
            db.add(user)
            await db.flush()
            db.add(
                XPDailyCapUsage(
                    user_id=user.id,
                    award_date=date(2031, 6, 2),
                    category="quiz_correct",
                    amount_awarded=12,
                )
            )
            await db.execute(
                XPTransaction.__table__.insert(),
                [
                    {
                        "user_id": user.id,
                        "amount": 5,
                        "requested_amount": 5,
                        "reason": "quiz_correct",
                        "idempotency_key": "usage-a",
                        "daily_cap_category": "quiz_correct",
                        "daily_cap_date": date(2031, 6, 2),
                    },
                ],
            )
            findings = await audit_data_integrity(db)
            await db.rollback()
            return user.id, findings

    user_id, findings = run_db(_seed_and_audit())
    matches = [finding for finding in findings if finding.check == "xp_daily_cap_usage_mismatch"]

    assert len(matches) == 1
    assert matches[0].key == {
        "user_id": user_id,
        "daily_cap_date": date(2031, 6, 2),
        "daily_cap_category": "quiz_correct",
        "usage_amount": 12,
        "transaction_amount": 5,
        "limit": XP_DAILY_CAPS["quiz_correct"],
    }
    assert matches[0].count == 7


def test_data_integrity_audit_fixture_self_test_exercises_duplicate_and_orphan_checks(
    run_db,
    test_settings,
):
    audit_script = _load_data_integrity_audit_script()

    result = run_db(audit_script.run_fixture_self_test(test_settings.database_url))

    assert result["ok"] is True
    assert result["missing_expected_findings"] == []
    for expected in result["expected_findings"]:
        assert any(
            finding["check"] == expected["check"]
            and finding["key"] == expected["key"]
            and finding["count"] == expected["count"]
            for finding in result["findings"]
        )


def test_data_integrity_audit_fixture_self_test_prepares_fresh_sqlite_schema(tmp_path):
    audit_script = _load_data_integrity_audit_script()
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'integrity-self-test.db'}"

    result = asyncio.run(audit_script.run_fixture_self_test(database_url))

    assert result["ok"] is True
    assert result["missing_expected_findings"] == []


def test_backend_ci_runs_data_integrity_fixture_self_test():
    workflow = (REPO_ROOT / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")

    assert 'DATABASE_URL="$CI_POSTGRES_DATABASE_URL" python scripts/audit_data_integrity.py' in workflow
    assert (
        'DATABASE_URL="$CI_POSTGRES_DATABASE_URL" '
        "python scripts/audit_data_integrity.py --fixture-self-test"
    ) in workflow
