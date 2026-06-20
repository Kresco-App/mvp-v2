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
from app.config import get_settings
from app.database import _build_async_url
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.exercises import (
    EXERCISE_ASSET_DIAGRAM,
    EXERCISE_DIFFICULTY_BAC,
    EXERCISE_DIFFICULTY_EASY,
    EXERCISE_DIFFICULTY_MEDIUM,
    EXERCISE_STATUS_PUBLISHED,
    Exercise,
    ExerciseAsset,
)
from app.models.professor import (
    CourseOffering,
    LiveSession,
    LiveSessionCheckpoint,
    LiveSessionInteraction,
    ProfessorChatConversation,
    ProfessorChatMessage,
    ProgramTrack,
)
from app.models.users import User, UserSubjectEntitlement

REQUIRED_CONFIRMATION = "true"
STAGING_MARKERS = ("kresco_staging", "staging")


def require_staging_seed_allowed(database_url: str, *, allow_confirmed: bool = False) -> None:
    if not allow_confirmed and os.getenv("KRESCO_ALLOW_STAGING_DEMO_SEED") != REQUIRED_CONFIRMATION:
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


async def upsert_topic_surface(db: AsyncSession, subject: Subject, offering: CourseOffering) -> Topic:
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
    return topic


async def upsert_exercise_bank_fixtures(db: AsyncSession, subject: Subject, topic: Topic) -> None:
    specs = [
        {
            "slug": "staging-demo-linear-equation",
            "title": "Linear equation warmup",
            "summary": "Solve a one-step equation and verify the result.",
            "statement_body": "Solve $x + 1 = 2$, then substitute your answer to check it.",
            "solution_body": "Subtract 1 from both sides: $x = 1$. Check: $1 + 1 = 2$.",
            "difficulty": EXERCISE_DIFFICULTY_EASY,
            "estimated_minutes": 4,
            "order": 1,
            "concept_slugs": ["linear-equations", "algebra-basics"],
            "is_free_preview": True,
        },
        {
            "slug": "staging-demo-factorized-limit",
            "title": "Factorized limit check",
            "summary": "Practice cancelling a removable discontinuity before evaluating a limit.",
            "statement_body": "Compute $\\lim_{x\\to 1} \\frac{x^2 - 1}{x - 1}$ and explain why direct substitution fails first.",
            "solution_body": "Factor the numerator: $x^2 - 1 = (x - 1)(x + 1)$. For $x \\ne 1$, the expression is $x + 1$, so the limit is $2$.",
            "difficulty": EXERCISE_DIFFICULTY_MEDIUM,
            "estimated_minutes": 8,
            "order": 2,
            "concept_slugs": ["limits", "factorization", "removable-discontinuity"],
            "is_free_preview": False,
            "asset": {
                "url": "/figma-assets/course-card-placeholder.png",
                "alt_text": "Placeholder graph for the removable discontinuity exercise",
                "caption": "Demo diagram asset for Exercise Bank rendering.",
            },
        },
        {
            "slug": "staging-demo-bac-function-study",
            "title": "Bac-style function variation",
            "summary": "Use a derivative sign table to justify monotonicity and an extremum.",
            "statement_body": "Let $f(x)=x^3-3x+1$. Study the sign of $f'(x)$ and identify the intervals where $f$ is increasing or decreasing.",
            "solution_body": "$f'(x)=3x^2-3=3(x-1)(x+1)$. The derivative is positive on $(-\\infty,-1)$ and $(1,+\\infty)$, and negative on $(-1,1)$. Therefore $f$ increases, then decreases, then increases again.",
            "difficulty": EXERCISE_DIFFICULTY_BAC,
            "estimated_minutes": 14,
            "order": 3,
            "concept_slugs": ["derivatives", "variation-table", "bac-practice"],
            "is_free_preview": False,
        },
    ]

    for spec in specs:
        exercise = await db.scalar(select(Exercise).where(Exercise.slug == spec["slug"]))
        if exercise is None:
            exercise = Exercise(subject_id=subject.id, slug=spec["slug"])
            db.add(exercise)

        exercise.subject_id = subject.id
        exercise.topic_id = topic.id
        exercise.title = spec["title"]
        exercise.summary = spec["summary"]
        exercise.statement_body = spec["statement_body"]
        exercise.solution_body = spec["solution_body"]
        exercise.solution_video_url = ""
        exercise.difficulty = spec["difficulty"]
        exercise.estimated_minutes = spec["estimated_minutes"]
        exercise.order = spec["order"]
        exercise.status = EXERCISE_STATUS_PUBLISHED
        exercise.source_type = "staging_demo_seed"
        exercise.concept_slugs = spec["concept_slugs"]
        exercise.metadata_json = {
            "source": "staging_demo_seed",
            "surface": "exercise_bank",
        }
        exercise.is_free_preview = bool(spec["is_free_preview"])
        await db.flush()

        asset = spec.get("asset")
        if not asset:
            continue
        exercise_asset = await db.scalar(
            select(ExerciseAsset).where(
                ExerciseAsset.exercise_id == exercise.id,
                ExerciseAsset.url == asset["url"],
            )
        )
        if exercise_asset is None:
            exercise_asset = ExerciseAsset(exercise_id=exercise.id, url=asset["url"])
            db.add(exercise_asset)
        exercise_asset.asset_type = EXERCISE_ASSET_DIAGRAM
        exercise_asset.alt_text = asset["alt_text"]
        exercise_asset.caption = asset["caption"]
        exercise_asset.metadata_json = {"source": "staging_demo_seed"}
        exercise_asset.order = 1
        await db.flush()


async def upsert_live_and_chat_surface(
    db: AsyncSession,
    *,
    offering: CourseOffering,
    professor: User,
    student: User,
) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    live_session = await db.scalar(
        select(LiveSession).where(
            LiveSession.course_offering_id == offering.id,
            LiveSession.title == "Staging demo live session",
        )
    )
    if live_session is None:
        live_session = LiveSession(
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            title="Staging demo live session",
            starts_at=now - timedelta(minutes=10),
            ends_at=now + timedelta(hours=1),
        )
        db.add(live_session)
    live_session.professor_user_id = professor.id
    live_session.description = "Staging demo live session for authenticated load evidence."
    live_session.starts_at = now - timedelta(minutes=10)
    live_session.ends_at = now + timedelta(hours=1)
    live_session.status = "live"
    live_session.vdocipher_live_id = "demo-staging-live-session"
    live_session.stream_ingest_url = "rtmp://example.invalid/kresco-staging"
    live_session.stream_key = "staging-demo-stream-key"
    live_session.provider_payload_json = {"source": "staging_demo_seed"}
    await db.flush()
    live_session.join_url = f"/live/{live_session.id}"

    checkpoint = await db.scalar(
        select(LiveSessionCheckpoint).where(
            LiveSessionCheckpoint.live_session_id == live_session.id,
            LiveSessionCheckpoint.title == "Staging demo checkpoint",
        )
    )
    if checkpoint is None:
        checkpoint = LiveSessionCheckpoint(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            title="Staging demo checkpoint",
        )
        db.add(checkpoint)
    checkpoint.course_offering_id = offering.id
    checkpoint.professor_user_id = professor.id
    checkpoint.prompt = "Confirm the limit exists."
    checkpoint.checkpoint_type = "prompt"
    checkpoint.status = "active"

    interaction = await db.scalar(
        select(LiveSessionInteraction).where(
            LiveSessionInteraction.live_session_id == live_session.id,
            LiveSessionInteraction.student_user_id == student.id,
            LiveSessionInteraction.body == "Staging demo live question",
        )
    )
    if interaction is None:
        interaction = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=student.id,
            body="Staging demo live question",
        )
        db.add(interaction)
    interaction.course_offering_id = offering.id
    interaction.professor_user_id = professor.id
    interaction.kind = "question"
    interaction.status = "answered"
    interaction.answer = "Use the continuity definition around the point."
    interaction.answered_by_user_id = professor.id
    interaction.answered_at = now
    interaction.deleted_at = None

    conversation = await db.scalar(
        select(ProfessorChatConversation).where(
            ProfessorChatConversation.course_offering_id == offering.id,
            ProfessorChatConversation.student_user_id == student.id,
        )
    )
    if conversation is None:
        conversation = ProfessorChatConversation(
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=student.id,
        )
        db.add(conversation)
    conversation.professor_user_id = professor.id
    conversation.status = "open"
    conversation.last_message_preview = "Staging demo professor chat message"
    conversation.unread_for_professor = 0
    conversation.unread_for_student = 0
    conversation.is_pinned_by_professor = True
    conversation.last_message_at = now
    await db.flush()

    message = await db.scalar(
        select(ProfessorChatMessage).where(
            ProfessorChatMessage.conversation_id == conversation.id,
            ProfessorChatMessage.body == "Staging demo professor chat message",
        )
    )
    if message is None:
        message = ProfessorChatMessage(
            conversation_id=conversation.id,
            sender_user_id=student.id,
            body="Staging demo professor chat message",
        )
        db.add(message)
    message.sender_user_id = student.id
    message.status = "sent"
    message.read_at = now
    await db.flush()


def resolve_seed_database_config() -> tuple[str, str | None]:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if database_url:
        return database_url, os.environ.get("PGSSLROOTCERT")

    settings = get_settings()
    return settings.database_url, settings.pgsslrootcert


async def seed_staging_demo(
    database_url: str,
    *,
    pgsslrootcert: str | None = None,
    allow_confirmed: bool = False,
) -> None:
    require_staging_seed_allowed(database_url, allow_confirmed=allow_confirmed)
    async_url, connect_args = _build_async_url(database_url, pgsslrootcert)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with session_factory() as db:
        professor = await upsert_user(db, "professor@example.com", "Pr Ahmed Kamil", role="professor", tier="basic")
        vip_student = await upsert_user(
            db,
            "vip@example.com",
            "Sara Benali",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere="Sciences Math B",
            is_pro=True,
        )
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
            vip_student,
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
            ),
        ]
        subject = await upsert_subject(db)
        track = await upsert_track(db)
        offering = await upsert_offering(db, subject, track, professor)
        for user in [professor, *users]:
            await ensure_entitlement(db, user, subject)
        topic = await upsert_topic_surface(db, subject, offering)
        await upsert_exercise_bank_fixtures(db, subject, topic)
        await upsert_live_and_chat_surface(db, offering=offering, professor=professor, student=vip_student)
        await db.commit()

    await engine.dispose()
    print("Seeded staging demo accounts: student@example.com, vip@example.com, platinum@example.com, basic@example.com, professor@example.com, admin@example.com")


def main() -> None:
    database_url, pgsslrootcert = resolve_seed_database_config()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required.")
    asyncio.run(seed_staging_demo(database_url, pgsslrootcert=pgsslrootcert))


if __name__ == "__main__":
    main()
