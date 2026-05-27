from collections import Counter

import pytest

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import Exam, ExamProblem, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import DailyQuest, UserXP
from app.models.interactions import SavedItem, UserNote
from app.models.notifications import Notification
from app.models.professor import CourseOffering, LiveSession, ProfessorChangeRequest, ProfessorChatConversation, ProgramTrack
from app.models.users import User, UserSubjectEntitlement
from seed_burner_data import seed_all as seed_burner_all
from seed_kresco_v1 import seed_all as seed_kresco_v1_all
from seed_local_full import seed_full_local
from seed_safety import UnsafeSeedDatabaseError
from sqlalchemy import select


class _FakeBind:
    url = "postgresql+asyncpg://kresco:secret-password@db.example.com/kresco"


class _FakeSession:
    def get_bind(self):
        return _FakeBind()


class _LocalFakeBind:
    url = "sqlite+aiosqlite:///./shared-local.sqlite3"


class _LocalFakeSession:
    def get_bind(self):
        return _LocalFakeBind()


def test_full_local_seed_refuses_nonlocal_database_sessions(run_db):
    with pytest.raises(UnsafeSeedDatabaseError):
        run_db(seed_full_local(_FakeSession()))


def test_full_local_seed_requires_destructive_confirmation_for_local_sessions(run_db):
    with pytest.raises(UnsafeSeedDatabaseError, match="KRESCO_CONFIRM_DESTRUCTIVE_SEED"):
        run_db(seed_full_local(_LocalFakeSession()))


def test_burner_seed_requires_destructive_confirmation_for_local_sessions(run_db):
    with pytest.raises(UnsafeSeedDatabaseError, match="KRESCO_CONFIRM_DESTRUCTIVE_SEED"):
        run_db(seed_burner_all(_LocalFakeSession()))


def test_kresco_v1_seed_requires_destructive_confirmation_for_local_sessions(run_db):
    with pytest.raises(UnsafeSeedDatabaseError, match="KRESCO_CONFIRM_DESTRUCTIVE_SEED"):
        run_db(seed_kresco_v1_all(_LocalFakeSession()))


def test_full_local_seed_covers_core_validation_states(app_client, run_db):
    async def _seed_and_count():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await seed_full_local(db, destructive_confirmed=True)
            users = (await db.execute(select(User))).scalars().all()
            subjects = (await db.execute(select(Subject))).scalars().all()
            topics = (await db.execute(select(Topic))).scalars().all()
            topic_sections = (await db.execute(select(TopicSection))).scalars().all()
            topic_items = (await db.execute(select(TopicItem))).scalars().all()
            tabs = (await db.execute(select(TabContent))).scalars().all()
            exams = (await db.execute(select(Exam))).scalars().all()
            exam_problems = (await db.execute(select(ExamProblem))).scalars().all()
            tracks = (await db.execute(select(ProgramTrack))).scalars().all()
            offerings = (await db.execute(select(CourseOffering))).scalars().all()
            live_sessions = (await db.execute(select(LiveSession))).scalars().all()
            changes = (await db.execute(select(ProfessorChangeRequest))).scalars().all()
            conversations = (await db.execute(select(ProfessorChatConversation))).scalars().all()
            entitlements = (await db.execute(select(UserSubjectEntitlement))).scalars().all()
            notifications = (await db.execute(select(Notification))).scalars().all()
            notes = (await db.execute(select(UserNote))).scalars().all()
            saves = (await db.execute(select(SavedItem))).scalars().all()
            quests = (await db.execute(select(DailyQuest))).scalars().all()
            audits = (await db.execute(select(AdminAuditLog))).scalars().all()
            xp = (await db.execute(select(UserXP))).scalars().all()
            return {
                "users": len(users),
                "subjects": len(subjects),
                "topics": len(topics),
                "topic_sections": len(topic_sections),
                "topic_items": len(topic_items),
                "tabs": len(tabs),
                "exams": len(exams),
                "exam_problems": len(exam_problems),
                "tracks": len(tracks),
                "offerings": len(offerings),
                "live_statuses": Counter(row.status for row in live_sessions),
                "change_statuses": Counter(row.status for row in changes),
                "conversations": len(conversations),
                "entitlements": len(entitlements),
                "notifications": len(notifications),
                "notes": len(notes),
                "saves": len(saves),
                "quests": len(quests),
                "audits": len(audits),
                "xp": len(xp),
            }

    counts = run_db(_seed_and_count())
    assert counts["users"] >= 13
    assert counts["subjects"] >= 5
    assert counts["topics"] >= 10
    assert counts["topic_sections"] >= 40
    assert counts["topic_items"] >= 50
    assert counts["tabs"] >= 100
    assert counts["exams"] >= 10
    assert counts["exam_problems"] >= 10
    assert counts["tracks"] >= 6
    assert counts["offerings"] >= 3
    assert {"scheduled", "live", "completed", "cancelled"}.issubset(counts["live_statuses"])
    assert {"pending", "approved", "rejected"}.issubset(counts["change_statuses"])
    assert counts["conversations"] >= 2
    assert counts["entitlements"] >= 4
    assert counts["notifications"] >= 10
    assert counts["notes"] >= 2
    assert counts["saves"] >= 2
    assert counts["quests"] >= 3
    assert counts["audits"] >= 3
    assert counts["xp"] >= 10
