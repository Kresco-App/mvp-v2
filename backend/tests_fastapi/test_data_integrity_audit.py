from datetime import date

from app.database import get_session_factory
from app.models.courses import Chapter, Lesson, Subject
from app.models.gamification import ContentProgress, DailyQuest, LessonProgress, XPTransaction
from app.models.interactions import SavedItem
from app.models.users import User
from app.services.data_integrity import audit_data_integrity


def test_data_integrity_audit_reports_duplicate_state_groups(app_client, run_db):
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

            db.add_all([
                LessonProgress(user_id=user.id, lesson_id=lesson.id, watched_seconds=10),
                LessonProgress(user_id=user.id, lesson_id=lesson.id, watched_seconds=20),
                ContentProgress(user_id=user.id, item_type="section", item_id=lesson.id),
                ContentProgress(user_id=user.id, item_type="section", item_id=lesson.id),
                SavedItem(user_id=user.id, target_type="lesson", target_id=lesson.id, label="first"),
                SavedItem(user_id=user.id, target_type="lesson", target_id=lesson.id, label="second"),
                DailyQuest(
                    user_id=user.id,
                    quest_type="watch_video",
                    title="Watch",
                    target=1,
                    progress=0,
                    xp_reward=25,
                    date=date(2026, 5, 26),
                ),
                DailyQuest(
                    user_id=user.id,
                    quest_type="watch_video",
                    title="Watch again",
                    target=1,
                    progress=0,
                    xp_reward=25,
                    date=date(2026, 5, 26),
                ),
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
            ])
            await db.commit()

            findings = await audit_data_integrity(db)
            return user.id, lesson.id, findings

    user_id, lesson_id, findings = run_db(_seed_and_audit())
    by_check = {finding.check: finding for finding in findings if finding.key.get("user_id") == user_id}

    assert by_check["lesson_progress_duplicate_user_lesson"].key == {
        "user_id": user_id,
        "lesson_id": lesson_id,
    }
    assert by_check["lesson_progress_duplicate_user_lesson"].count == 2

    assert by_check["content_progress_duplicate_user_item"].key == {
        "user_id": user_id,
        "item_type": "section",
        "item_id": lesson_id,
    }
    assert by_check["saved_item_duplicate_user_target"].key == {
        "user_id": user_id,
        "target_type": "lesson",
        "target_id": lesson_id,
    }
    assert by_check["daily_quest_duplicate_user_type_date"].key == {
        "user_id": user_id,
        "quest_type": "watch_video",
        "date": date(2026, 5, 26),
    }
    assert "xp_transaction_duplicate_idempotency_key" not in by_check
