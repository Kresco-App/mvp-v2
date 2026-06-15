from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.models  # noqa: F401
from app.database import _build_async_url
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.professor import CourseOffering, ProgramTrack
from app.models.users import User, UserSubjectEntitlement
from app.security.passwords import hash_password

DEMO_PASSWORD = "kresco123"
REQUIRED_CONFIRMATION = "true"
STAGING_MARKERS = ("kresco_staging", "staging")


def require_staging_seed_allowed(database_url: str) -> None:
    if os.getenv("KRESCO_ALLOW_STAGING_DEMO_SEED") != REQUIRED_CONFIRMATION:
        raise RuntimeError("Set KRESCO_ALLOW_STAGING_DEMO_SEED=true to seed staging demo accounts.")

    lowered = database_url.lower()
    if not any(marker in lowered for marker in STAGING_MARKERS):
        raise RuntimeError("Refusing to seed a database URL that does not look like staging.")


async def upsert_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    *,
    role: str,
    tier: str,
    niveau: str = "",
    filiere: str = "",
    is_pro: bool = False,
    is_staff: bool = False,
    is_superuser: bool = False,
) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        db.add(user)

    user.full_name = full_name
    user.role = role
    user.tier = tier
    user.niveau = niveau
    user.filiere = filiere
    user.is_pro = is_pro
    user.is_active = True
    user.is_email_verified = True
    user.is_staff = is_staff
    user.is_superuser = is_superuser
    user.password = hash_password(DEMO_PASSWORD)
    user.password_changed_at = datetime.now(timezone.utc)
    user.auth_token_version = (user.auth_token_version or 0) + 1
    await db.flush()
    return user


async def upsert_subject(db: AsyncSession) -> Subject:
    subject = await db.scalar(select(Subject).where(Subject.title == "Mathematics"))
    if subject is None:
        subject = Subject(title="Mathematics")
        db.add(subject)
    subject.description = "2BAC Sciences Math B mathematics program"
    subject.thumbnail_url = ""
    subject.is_published = True
    subject.order = 1
    await db.flush()
    return subject


async def upsert_track(db: AsyncSession) -> ProgramTrack:
    track = await db.scalar(
        select(ProgramTrack).where(
            ProgramTrack.niveau == "2BAC",
            ProgramTrack.filiere == "Sciences Math B",
        )
    )
    if track is None:
        track = ProgramTrack(niveau="2BAC", filiere="Sciences Math B")
        db.add(track)
    track.title = "2BAC Sciences Math B"
    track.status = "active"
    await db.flush()
    return track


async def upsert_offering(db: AsyncSession, subject: Subject, track: ProgramTrack, professor: User) -> CourseOffering:
    offering = await db.scalar(
        select(CourseOffering).where(
            CourseOffering.subject_id == subject.id,
            CourseOffering.track_id == track.id,
        )
    )
    if offering is None:
        offering = CourseOffering(subject_id=subject.id, track_id=track.id)
        db.add(offering)
    offering.professor_user_id = professor.id
    offering.title = "Mathematics - 2BAC Sciences Math B"
    offering.status = "active"
    await db.flush()
    return offering


async def ensure_entitlement(db: AsyncSession, user: User, subject: Subject) -> None:
    entitlement = await db.scalar(
        select(UserSubjectEntitlement).where(
            UserSubjectEntitlement.user_id == user.id,
            UserSubjectEntitlement.subject_id == subject.id,
        )
    )
    if entitlement is None:
        entitlement = UserSubjectEntitlement(user_id=user.id, subject_id=subject.id)
        db.add(entitlement)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    entitlement.status = "active"
    entitlement.starts_at = now - timedelta(days=1)
    entitlement.ends_at = now + timedelta(days=365)
    entitlement.source = "staging_demo_seed"
    await db.flush()


async def upsert_topic_surface(db: AsyncSession, subject: Subject, offering: CourseOffering) -> None:
    topic = await db.scalar(select(Topic).where(Topic.slug == "staging-demo-limits-continuity"))
    if topic is None:
        topic = Topic(subject_id=subject.id, slug="staging-demo-limits-continuity")
        db.add(topic)
    topic.subject_id = subject.id
    topic.course_offering_id = offering.id
    topic.title = "Limits and Continuity"
    topic.description = "Staging demo topic for login, topic workspace, and progress verification."
    topic.status = "published"
    topic.order = 1
    topic.is_free_preview = True
    await db.flush()

    section = await db.scalar(select(TopicSection).where(TopicSection.topic_id == topic.id, TopicSection.title == "Lessons"))
    if section is None:
        section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lesson")
        db.add(section)
    section.order = 1
    await db.flush()

    resource = await db.scalar(select(Resource).where(Resource.topic_id == topic.id, Resource.title == "Limits demo video"))
    if resource is None:
        resource = Resource(topic_id=topic.id, title="Limits demo video", resource_type="video")
        db.add(resource)
    resource.provider = "vdocipher"
    resource.provider_resource_id = "demo-staging-limits-continuity"
    resource.status = "published"
    resource.is_free_preview = True
    await db.flush()

    item = await db.scalar(select(TopicItem).where(TopicItem.topic_id == topic.id, TopicItem.title == "Limits checkpoint"))
    if item is None:
        item = TopicItem(topic_id=topic.id, section_id=section.id, title="Limits checkpoint", item_type="lesson")
        db.add(item)
    item.section_id = section.id
    item.primary_resource_id = resource.id
    item.description = "Staging demo checkpoint."
    item.status = "published"
    item.duration_seconds = 0
    item.order = 1
    item.is_free_preview = True
    await db.flush()

    tab = await db.scalar(select(TabContent).where(TabContent.topic_item_id == item.id, TabContent.label == "Course"))
    if tab is None:
        tab = TabContent(topic_item_id=item.id, label="Course", tab_type="course")
        db.add(tab)
    tab.content = "Staging demo course content."
    tab.config_json = {}
    tab.status = "published"
    tab.order = 1
    await db.flush()

    item.primary_tab_content_id = tab.id
    await db.flush()


async def seed_staging_demo(database_url: str) -> None:
    require_staging_seed_allowed(database_url)
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with session_factory() as db:
        professor = await upsert_user(db, "professor@example.com", "Pr Ahmed Kamil", role="professor", tier="basic")
        users = [
            await upsert_user(
                db,
                "student@example.com",
                "Kresco Student",
                role="student",
                tier="pro",
                niveau="2BAC",
                filiere="Sciences Math B",
                is_pro=True,
            ),
            await upsert_user(
                db,
                "vip@example.com",
                "Sara Benali",
                role="student",
                tier="vip",
                niveau="2BAC",
                filiere="Sciences Math B",
                is_pro=True,
            ),
            await upsert_user(
                db,
                "platinum@example.com",
                "Youssef El Idrissi",
                role="student",
                tier="platinum",
                niveau="2BAC",
                filiere="Sciences Math B",
                is_pro=True,
            ),
            await upsert_user(
                db,
                "basic@example.com",
                "Nora Basic",
                role="student",
                tier="basic",
                niveau="2BAC",
                filiere="Sciences Math B",
            ),
            await upsert_user(
                db,
                "admin@example.com",
                "Kresco Admin",
                role="admin",
                tier="platinum",
                is_pro=True,
                is_staff=True,
                is_superuser=True,
            ),
        ]
        subject = await upsert_subject(db)
        track = await upsert_track(db)
        offering = await upsert_offering(db, subject, track, professor)
        for user in [professor, *users]:
            await ensure_entitlement(db, user, subject)
        await upsert_topic_surface(db, subject, offering)
        await db.commit()

    await engine.dispose()
    print("Seeded staging demo accounts: student@example.com, vip@example.com, platinum@example.com, basic@example.com, professor@example.com, admin@example.com")


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required.")
    asyncio.run(seed_staging_demo(database_url))


if __name__ == "__main__":
    main()
