"""Rebuild the local Kresco database with full validation/demo state.

This is the main local seed entrypoint for broad QA. It intentionally does not
change schema; it drops/recreates the configured local database and then seeds
student workspace, Moroccan Bac curriculum surfaces, professor workflows,
access-control states, and login accounts.

Usage:
    cd backend
    set DATABASE_URL=sqlite+aiosqlite:///./db.sqlite3
    set KRESCO_CONFIRM_DESTRUCTIVE_SEED=seed_local_full.py:sqlite+aiosqlite:///./db.sqlite3
    python seed_local_full.py

All seeded accounts use password: kresco123
"""

from __future__ import annotations

import asyncio
import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401
from app.database import _build_async_url
from app.models.admin_audit import AdminAuditLog
from app.models.base import Base
from app.models.calendar import CalendarEvent
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem
from app.models.gamification import DailyQuest, UserXP, XPTransaction
from app.models.interactions import SavedItem, UserNote
from app.models.notifications import Notification
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User, UserSubjectEntitlement
from app.routers.users import _hash_password
from seed_safety import require_destructive_seed_database_url, require_destructive_seed_session
from seed_burner_data import DEMO_EMAIL as BURNER_STUDENT_EMAIL
from seed_burner_data import seed_all as seed_burner_all
from seed_professor_demo import DEMO_PASSWORD, seed_professor_demo


LOCAL_DATABASE_URL = "sqlite+aiosqlite:///./db.sqlite3"
EXTRA_ACCOUNT_EMAILS = {
    "admin": "admin@kresco.local",
    "free": "free@kresco.local",
    "subject_only": "subject-only@kresco.local",
    "expired": "expired@kresco.local",
    "unverified": "unverified@kresco.local",
    "inactive": "inactive@kresco.local",
    "wrong_track": "wrong-track@kresco.local",
}


async def main() -> None:
    database_url = os.environ.get("DATABASE_URL", LOCAL_DATABASE_URL)
    require_destructive_seed_database_url(database_url, "seed_local_full.py")
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as db:
        await seed_full_local(db, destructive_confirmed=True)

    await engine.dispose()
    print_summary(database_url)


async def seed_full_local(db: AsyncSession, *, destructive_confirmed: bool = False) -> None:
    require_destructive_seed_session(
        db,
        "seed_local_full.seed_full_local",
        confirmed=destructive_confirmed,
    )
    await clear_database(db)
    await seed_burner_all(db, destructive_confirmed=True)
    await seed_professor_demo(db, destructive_confirmed=True)
    await normalize_core_accounts(db)
    await seed_tracks_offerings_and_access(db)
    await seed_account_state_surfaces(db)
    await seed_admin_audit_examples(db)
    await db.commit()


async def clear_database(db: AsyncSession) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        await db.execute(table.delete())
    await db.flush()


async def normalize_core_accounts(db: AsyncSession) -> None:
    rows = [
        ("student@kresco.local", "Kresco Student", "student", "pro", "2bac", "Bac Sciences Physiques", True, True, False, False),
        ("basic@kresco.local", "Nora Basic", "student", "basic", "2BAC", "Sciences Math B", True, True, False, False),
        ("vip@kresco.local", "Sara Benali", "student", "vip", "2BAC", "Sciences Math B", True, True, False, False),
        ("platinum@kresco.local", "Youssef El Idrissi", "student", "platinum", "2BAC", "Sciences Math B", True, True, False, False),
        ("professor@kresco.local", "Pr Ahmed Kamil", "professor", "basic", "", "", True, True, False, False),
        ("physics.professor@kresco.local", "Pr Lina Amrani", "professor", "basic", "", "", True, True, False, False),
        (EXTRA_ACCOUNT_EMAILS["admin"], "Kresco Admin", "admin", "platinum", "", "", True, True, True, True),
        (EXTRA_ACCOUNT_EMAILS["free"], "Free Preview Student", "student", "basic", "2bac", "Bac Sciences Physiques", True, True, False, False),
        (EXTRA_ACCOUNT_EMAILS["subject_only"], "Subject Scoped Student", "student", "pro", "2bac", "Bac Sciences Physiques", True, True, False, False),
        (EXTRA_ACCOUNT_EMAILS["expired"], "Expired Access Student", "student", "pro", "2bac", "Bac Sciences Physiques", True, True, False, False),
        (EXTRA_ACCOUNT_EMAILS["unverified"], "Unverified Student", "student", "pro", "2bac", "Bac Sciences Physiques", True, False, False, False),
        (EXTRA_ACCOUNT_EMAILS["inactive"], "Inactive Student", "student", "pro", "2bac", "Bac Sciences Physiques", False, True, False, False),
        (EXTRA_ACCOUNT_EMAILS["wrong_track"], "Wrong Track Student", "student", "vip", "2BAC", "Sciences Physiques", True, True, False, False),
    ]
    for email, name, role, tier, niveau, filiere, active, verified, staff, superuser in rows:
        user = await upsert_user(db, email)
        user.full_name = name
        user.role = role
        user.tier = tier
        user.niveau = niveau
        user.filiere = filiere
        user.is_pro = tier in {"pro", "vip", "platinum"}
        user.is_active = active
        user.is_email_verified = verified
        user.is_staff = staff
        user.is_superuser = superuser
        user.password = _hash_password(DEMO_PASSWORD)
        user.updated_at = now()
        await ensure_xp(db, user, total_xp=2400 if tier in {"vip", "platinum"} else 620, streak_days=5 if active else 0)
    await db.flush()


async def seed_tracks_offerings_and_access(db: AsyncSession) -> None:
    tracks = [
        ("2bac", "Bac Sciences Physiques", "2BAC Sciences Physiques"),
        ("2BAC", "Sciences Math B", "2BAC Sciences Math B"),
        ("2BAC", "Sciences Math A", "2BAC Sciences Math A"),
        ("2BAC", "Sciences SVT", "2BAC Sciences de la Vie et de la Terre"),
        ("2BAC", "Sciences Economiques", "2BAC Sciences Economiques"),
        ("1BAC", "Sciences Experimentales", "1BAC Sciences Experimentales"),
    ]
    track_rows = {f"{niveau}:{filiere}": await upsert_track(db, niveau, filiere, title) for niveau, filiere, title in tracks}
    subjects = {subject.title: subject for subject in (await db.execute(select(Subject))).scalars().all()}
    math_subject = subjects.get("Math") or subjects.get("Mathematics")
    physics_subject = subjects.get("Physics")
    philosophy_subject = subjects.get("Philosophy")
    biology_subject = subjects.get("Biology")
    english_subject = subjects.get("English")
    professor = await require_user(db, "professor@kresco.local")
    physics_professor = await require_user(db, "physics.professor@kresco.local")

    if math_subject:
        await upsert_offering(db, math_subject, track_rows["2BAC:Sciences Math B"], professor, "Mathematics - 2BAC Sciences Math B")
        await upsert_offering(db, math_subject, track_rows["2BAC:Sciences Math A"], professor, "Mathematics - 2BAC Sciences Math A")
    if physics_subject:
        physics_offering = await upsert_offering(db, physics_subject, track_rows["2bac:Bac Sciences Physiques"], physics_professor, "Physics - 2BAC Sciences Physiques")
        await attach_topics_to_offering(db, physics_subject.id, physics_offering.id)
    for subject in [math_subject, philosophy_subject, biology_subject, english_subject]:
        if subject:
            await apply_locked_access_examples(db, subject)

    await seed_entitlements(db, subjects)


async def seed_account_state_surfaces(db: AsyncSession) -> None:
    free_user = await require_user(db, EXTRA_ACCOUNT_EMAILS["free"])
    subject_user = await require_user(db, EXTRA_ACCOUNT_EMAILS["subject_only"])
    expired_user = await require_user(db, EXTRA_ACCOUNT_EMAILS["expired"])
    for user in [free_user, subject_user, expired_user]:
        await db.execute(delete(Notification).where(Notification.user_id == user.id))
        db.add_all(
            [
                Notification(user_id=user.id, type="system", title="Welcome to Kresco", body="Your local QA account is ready.", is_read=False),
                Notification(user_id=user.id, type="xp", title="Progress check", body="Use this account to validate locked and unlocked states.", is_read=True),
                DailyQuest(user_id=user.id, quest_type="lesson", title="Finish one Bac lesson", target=1, progress=0, xp_reward=25, date=date.today(), completed=False),
            ]
        )
    topics = (await db.execute(select(Topic).order_by(Topic.order).limit(3))).scalars().all()
    if topics:
        first_item = await db.scalar(select(TopicItem).where(TopicItem.topic_id == topics[0].id).order_by(TopicItem.order))
        first_tab = None
        if first_item:
            first_tab = await db.scalar(select(TabContent).where(TabContent.topic_item_id == first_item.id).order_by(TabContent.order))
            db.add(UserNote(user_id=free_user.id, topic_id=topics[0].id, topic_item_id=first_item.id, tab_content_id=first_tab.id if first_tab else None, body="Free-account note for validating notes persistence."))
            db.add(SavedItem(user_id=free_user.id, target_type="topic_item", target_id=first_item.id, topic_id=topics[0].id, topic_item_id=first_item.id, label="Free preview saved item"))
    await db.flush()


async def seed_admin_audit_examples(db: AsyncSession) -> None:
    await db.execute(delete(AdminAuditLog))
    db.add_all(
        [
            AdminAuditLog(action="create", model_name="Subject", object_repr="Physics", changed_data={"is_published": True}, request_path="/admin/subject/create", client_host="127.0.0.1", note="Local full seed audit example."),
            AdminAuditLog(action="update", model_name="ProfessorChangeRequest", object_repr="Limits and Continuity", changed_data={"status": ["pending", "approved"]}, request_path="/api/admin/professor-change-requests/1", client_host="127.0.0.1", note="Approval audit example."),
            AdminAuditLog(action="login", model_name="User", object_repr="admin@kresco.local", changed_data={}, request_path="/admin/login", client_host="127.0.0.1", note="Admin login audit example."),
        ]
    )
    await db.flush()


async def apply_locked_access_examples(db: AsyncSession, subject: Subject) -> None:
    topics = (await db.execute(select(Topic).where(Topic.subject_id == subject.id).order_by(Topic.order))).scalars().all()
    for index, topic in enumerate(topics):
        if index == 0:
            topic.is_free_preview = True
            topic.required_tier = ""
            topic.required_feature_key = ""
        elif index == 1:
            topic.required_tier = "pro"
            topic.required_feature_key = "downloads"
        elif index == 2:
            topic.required_tier = "vip"
            topic.required_feature_key = "teacher_chat"
        items = (await db.execute(select(TopicItem).where(TopicItem.topic_id == topic.id).order_by(TopicItem.order))).scalars().all()
        for item_index, item in enumerate(items):
            if item_index == 0:
                item.is_free_preview = True
            elif item_index == 1:
                item.required_feature_key = "advanced_quizzes"
            elif item_index >= 2:
                item.required_tier = topic.required_tier or "pro"
        resources = (await db.execute(select(Resource).where(Resource.topic_id == topic.id))).scalars().all()
        for resource in resources:
            if resource.resource_type in {"worksheet", "summary"}:
                resource.required_feature_key = "downloads"
        await db.flush()


async def seed_entitlements(db: AsyncSession, subjects: dict[str, Subject]) -> None:
    await db.execute(delete(UserSubjectEntitlement))
    student = await require_user(db, BURNER_STUDENT_EMAIL)
    subject_user = await require_user(db, EXTRA_ACCOUNT_EMAILS["subject_only"])
    expired_user = await require_user(db, EXTRA_ACCOUNT_EMAILS["expired"])
    free_user = await require_user(db, EXTRA_ACCOUNT_EMAILS["free"])
    now_value = now()
    active_subjects = [subject for title, subject in subjects.items() if title in {"Math", "Physics", "Mathematics"}]
    for subject in active_subjects:
        db.add(UserSubjectEntitlement(user_id=student.id, subject_id=subject.id, starts_at=now_value - timedelta(days=30), ends_at=now_value + timedelta(days=365), source="local_full_seed", status="active"))
    if subjects.get("Physics"):
        db.add(UserSubjectEntitlement(user_id=subject_user.id, subject_id=subjects["Physics"].id, starts_at=now_value - timedelta(days=7), ends_at=now_value + timedelta(days=30), source="local_full_seed", status="active"))
        db.add(UserSubjectEntitlement(user_id=expired_user.id, subject_id=subjects["Physics"].id, starts_at=now_value - timedelta(days=60), ends_at=now_value - timedelta(days=1), source="local_full_seed", status="active"))
        db.add(UserSubjectEntitlement(user_id=free_user.id, subject_id=subjects["Physics"].id, starts_at=now_value - timedelta(days=1), ends_at=now_value + timedelta(days=1), source="local_full_seed", status="cancelled"))
    await db.flush()


async def attach_topics_to_offering(db: AsyncSession, subject_id: int, offering_id: int) -> None:
    topics = (await db.execute(select(Topic).where(Topic.subject_id == subject_id))).scalars().all()
    for topic in topics:
        topic.course_offering_id = offering_id
    await db.flush()


async def upsert_user(db: AsyncSession, email: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        db.add(user)
        await db.flush()
    return user


async def require_user(db: AsyncSession, email: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        raise RuntimeError(f"Expected seeded user missing: {email}")
    return user


async def ensure_xp(db: AsyncSession, user: User, *, total_xp: int, streak_days: int) -> None:
    xp = await db.scalar(select(UserXP).where(UserXP.user_id == user.id))
    if xp is None:
        db.add(UserXP(user_id=user.id, total_xp=total_xp, streak_days=streak_days, last_active_date=date.today(), updated_at=now()))
    else:
        xp.total_xp = total_xp
        xp.streak_days = streak_days
        xp.last_active_date = date.today()
        xp.updated_at = now()
    db.add(XPTransaction(user_id=user.id, amount=10, reason="local_seed", description="Local validation seed baseline", idempotency_key=f"local-full-seed:{user.email}:{date.today().isoformat()}"))


async def upsert_track(db: AsyncSession, niveau: str, filiere: str, title: str) -> ProgramTrack:
    track = await db.scalar(select(ProgramTrack).where(ProgramTrack.niveau == niveau, ProgramTrack.filiere == filiere))
    if track is None:
        track = ProgramTrack(niveau=niveau, filiere=filiere)
        db.add(track)
    track.title = title
    track.status = "active"
    await db.flush()
    return track


async def upsert_offering(db: AsyncSession, subject: Subject, track: ProgramTrack, professor: User, title: str) -> CourseOffering:
    offering = await db.scalar(select(CourseOffering).where(CourseOffering.subject_id == subject.id, CourseOffering.track_id == track.id))
    if offering is None:
        offering = CourseOffering(subject_id=subject.id, track_id=track.id)
        db.add(offering)
    offering.professor_user_id = professor.id
    offering.title = title
    offering.status = "active"
    await db.flush()
    return offering


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def print_summary(database_url: str) -> None:
    accounts = [
        "student@kresco.local",
        "free@kresco.local",
        "subject-only@kresco.local",
        "expired@kresco.local",
        "basic@kresco.local",
        "vip@kresco.local",
        "platinum@kresco.local",
        "wrong-track@kresco.local",
        "professor@kresco.local",
        "physics.professor@kresco.local",
        "admin@kresco.local",
        "unverified@kresco.local",
        "inactive@kresco.local",
    ]
    print("Full local Kresco seed complete.")
    print(f"Database: {database_url}")
    print(f"Password for all seeded accounts: {DEMO_PASSWORD}")
    print("Accounts:")
    for account in accounts:
        print(f"  - {account}")
    print("Seeded states: free preview, pro unlocks, VIP/platinum chat, wrong-track lock, inactive/unverified auth, admin/staff, professor live/change/chat, calendar, notes, saved items, quests, XP, notifications, exams.")


if __name__ == "__main__":
    asyncio.run(main())
