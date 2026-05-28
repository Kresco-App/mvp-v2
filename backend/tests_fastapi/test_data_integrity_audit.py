from pathlib import Path

from sqlalchemy import CheckConstraint

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.base import Base
from app.models.courses import Chapter, Lesson, Subject
from app.models.gamification import XPTransaction
from app.models.gamification import DailyQuest, UserXP
from app.models.notifications import Notification
from app.models.professor import ProfessorChatConversation, RealtimeOutbox
import app.models.professor  # noqa: F401
from app.models.quizzes import Question, QuestionSet
from app.models.users import User
from app.services.data_integrity import audit_data_integrity


BACKEND_ROOT = Path(__file__).resolve().parents[1]


PROFESSOR_USER_FK_TABLES = (
    "course_offerings",
    "professor_change_requests",
    "live_sessions",
    "live_session_checkpoints",
    "live_session_interactions",
    "professor_chat_conversations",
)


GAMIFICATION_CONTEXT_FKS = {
    "xp_transactions": {
        "topic_section_id": "topic_sections.id",
        "topic_item_id": "topic_items.id",
        "question_set_id": "question_sets.id",
        "question_id": "questions.id",
        "quiz_attempt_id": "quiz_attempts.id",
        "question_attempt_id": "question_attempts.id",
    },
    "quiz_attempts": {
        "topic_section_id": "topic_sections.id",
        "topic_item_id": "topic_items.id",
        "tab_content_id": "tab_contents.id",
    },
    "question_attempts": {
        "topic_section_id": "topic_sections.id",
        "topic_item_id": "topic_items.id",
        "tab_content_id": "tab_contents.id",
    },
}


def test_professor_user_foreign_keys_cascade_in_model_metadata():
    for table_name in PROFESSOR_USER_FK_TABLES:
        table = Base.metadata.tables[table_name]
        column = table.c.professor_user_id
        assert len(column.foreign_keys) == 1
        fk = next(iter(column.foreign_keys))
        assert fk.target_fullname == "users.id"
        assert fk.ondelete == "CASCADE"


def test_professor_user_fk_cascade_migration_declares_required_constraints():
    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0036_professor_user_fk_cascade.py"
    ).read_text(encoding="utf-8")

    assert 'down_revision: Union[str, None] = "0035_interaction_context_foreign_keys"' in migration_text
    assert 'ondelete="CASCADE"' in migration_text
    for table_name in PROFESSOR_USER_FK_TABLES:
        assert table_name in migration_text


def test_admin_audit_rate_limit_index_exists_in_model_and_migration():
    indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in AdminAuditLog.__table__.indexes
    }
    assert indexes["ix_admin_audit_professor_rate_limit"] == ("note", "request_path", "created_at")
    assert indexes["ix_admin_audit_created_at"] == ("created_at",)

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0037_admin_audit_rate_limit_index.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0036_professor_user_fk_cascade"' in migration_text
    assert "ix_admin_audit_professor_rate_limit" in migration_text
    assert '"note", "request_path", "created_at"' in migration_text

    filter_migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0039_hot_filter_indexes.py"
    ).read_text(encoding="utf-8")
    assert "ix_admin_audit_created_at" in filter_migration_text
    assert '"created_at"' in filter_migration_text


def test_gamification_context_foreign_keys_and_indexes_exist_in_model_and_migration():
    for table_name, columns in GAMIFICATION_CONTEXT_FKS.items():
        table = Base.metadata.tables[table_name]
        index_columns = {tuple(column.name for column in index.columns) for index in table.indexes}
        for column_name, target in columns.items():
            column = table.c[column_name]
            assert len(column.foreign_keys) == 1
            fk = next(iter(column.foreign_keys))
            assert fk.target_fullname == target
            assert fk.ondelete == "SET NULL"
            assert (column_name,) in index_columns

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0038_gamification_context_foreign_keys.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0037_admin_audit_rate_limit_index"' in migration_text
    assert 'ondelete="SET NULL"' in migration_text
    for table_name, columns in GAMIFICATION_CONTEXT_FKS.items():
        assert table_name in migration_text
        for column_name in columns:
            assert column_name in migration_text


def test_hot_path_defaults_exist_in_models_and_migration():
    assert User.__table__.c.is_active.server_default is not None
    assert User.__table__.c.is_staff.server_default is not None
    assert User.__table__.c.auth_token_version.server_default is not None
    assert Notification.__table__.c.is_read.server_default is not None
    assert UserXP.__table__.c.total_xp.server_default is not None
    assert DailyQuest.__table__.c.completed.server_default is not None
    assert RealtimeOutbox.__table__.c.status.server_default is not None
    assert RealtimeOutbox.__table__.c.attempts.server_default is not None

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0043_server_defaults_for_hot_path_columns.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0042_xp_transaction_user_scoped_idempotency"' in migration_text
    assert 'batch_op.alter_column("is_active"' in migration_text
    assert 'batch_op.alter_column("is_staff"' in migration_text
    assert 'batch_op.alter_column("auth_token_version"' in migration_text
    assert 'batch_op.alter_column("is_read"' in migration_text
    assert 'batch_op.alter_column("total_xp"' in migration_text
    assert 'batch_op.alter_column("completed"' in migration_text
    assert 'batch_op.alter_column("status"' in migration_text
    assert 'batch_op.alter_column("attempts"' in migration_text


def test_low_priority_integrity_guards_exist_in_models_and_migration():
    question_column = Question.__table__.c.external_id
    assert question_column.nullable is True
    assert question_column.default is None
    assert question_column.server_default is None

    professor_chat_checks = _check_constraint_names(ProfessorChatConversation)
    user_xp_checks = _check_constraint_names(UserXP)
    xp_transaction_checks = _check_constraint_names(XPTransaction)

    assert ProfessorChatConversation.__table__.c.unread_for_professor.server_default is not None
    assert ProfessorChatConversation.__table__.c.unread_for_student.server_default is not None
    assert "ck_professor_chat_unread_for_professor_nonnegative" in professor_chat_checks
    assert "ck_professor_chat_unread_for_student_nonnegative" in professor_chat_checks
    assert UserXP.__table__.c.streak_days.server_default is not None
    assert "ck_user_xp_total_xp_nonnegative" in user_xp_checks
    assert "ck_user_xp_streak_days_nonnegative" in user_xp_checks
    assert "ck_xp_transactions_amount_nonnegative" in xp_transaction_checks

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0045_low_priority_integrity_guards.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0044_topic_item_progress_user_item_status_index"' in migration_text
    assert "ck_professor_chat_unread_for_professor_nonnegative" in migration_text
    assert "ck_user_xp_total_xp_nonnegative" in migration_text
    assert "ck_xp_transactions_amount_nonnegative" in migration_text
    assert "external_id" in migration_text


def test_questions_allow_multiple_null_external_ids(app_client, run_db):
    async def _insert_questions():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = QuestionSet(
                title="Nullable external IDs",
                source_type="test",
                pass_score=70,
                status="published",
            )
            db.add(question_set)
            await db.flush()

            db.add_all([
                Question(
                    question_set_id=question_set.id,
                    external_id=None,
                    type="multiple_choice",
                    prompt="First generated question",
                    order=1,
                ),
                Question(
                    question_set_id=question_set.id,
                    external_id=None,
                    type="multiple_choice",
                    prompt="Second generated question",
                    order=2,
                ),
            ])
            await db.commit()

    run_db(_insert_questions())


def test_data_integrity_audit_ignores_null_xp_idempotency_keys(app_client, run_db):
    async def _seed_and_audit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = User(
                email="integrity-audit@example.com",
                full_name="Integrity Audit",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            subject = Subject(title="Integrity", description="", is_published=True, order=1)
            db.add_all([user, subject])
            await db.flush()

            chapter = Chapter(subject_id=subject.id, title="Chapter", description="", order=1)
            db.add(chapter)
            await db.flush()

            lesson = Lesson(chapter_id=chapter.id, title="Lesson", order=1)
            db.add(lesson)
            await db.flush()

            db.add_all(
                [
                    XPTransaction(
                        user_id=user.id,
                        amount=1,
                        reason="test",
                        description="Null idempotency keys are intentionally ignored",
                        idempotency_key=None,
                    ),
                    XPTransaction(
                        user_id=user.id,
                        amount=1,
                        reason="test",
                        description="Null idempotency keys are intentionally ignored",
                        idempotency_key=None,
                    ),
                ]
            )
            await db.commit()

            findings = await audit_data_integrity(db)
            return user.id, findings

    user_id, findings = run_db(_seed_and_audit())
    by_check = {finding.check: finding for finding in findings if finding.key.get("user_id") == user_id}

    assert "saved_item_duplicate_user_target" not in by_check
    assert "lesson_progress_duplicate_user_lesson" not in by_check
    assert "content_progress_duplicate_user_item" not in by_check
    assert "daily_quest_duplicate_user_type_date" not in by_check
    assert "xp_transaction_duplicate_idempotency_key" not in by_check


def _check_constraint_names(model) -> set[str]:
    return {
        constraint.name
        for constraint in model.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }
