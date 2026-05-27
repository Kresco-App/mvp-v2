"""
Seed a rich local professor-platform demo.

Usage:
  cd backend
  set DATABASE_URL=sqlite+aiosqlite:///./professor_demo.sqlite3
  set KRESCO_CONFIRM_DESTRUCTIVE_SEED=seed_professor_demo.py:sqlite+aiosqlite:///./professor_demo.sqlite3
  python seed_professor_demo.py

Demo accounts:
  professor@kresco.local / kresco123
  physics.professor@kresco.local / kresco123
  vip@kresco.local / kresco123
  platinum@kresco.local / kresco123
  basic@kresco.local / kresco123
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import init_engine, reset_engine
from app.models import admin_audit, calendar, courses, gamification, interactions, notifications, professor, quizzes, users  # noqa: F401
from app.models.base import Base
from app.models.calendar import CalendarEvent
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.notifications import Notification
from app.models.professor import (
    CourseOffering,
    LiveSession,
    ProfessorChangeRequest,
    ProfessorChatConversation,
    ProfessorChatMessage,
    ProgramTrack,
)
from app.models.users import User
from app.routers.users import _hash_password
from seed_safety import require_destructive_seed_database_url, require_destructive_seed_session

DEMO_PASSWORD = "kresco123"
DEMO_DATABASE_URL = "sqlite+aiosqlite:///./professor_demo.sqlite3"


async def main() -> None:
    await reset_engine()
    database_url = os.getenv("DATABASE_URL", DEMO_DATABASE_URL)
    require_destructive_seed_database_url(database_url, "seed_professor_demo.py")
    engine, session_factory = init_engine(database_url, is_lambda=False)
    assert isinstance(session_factory, async_sessionmaker)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as db:
        await seed_professor_demo(db, destructive_confirmed=True)

    await reset_engine()
    print("Professor demo data is ready.")
    print(f"Database: {database_url}")
    print(f"Professor: professor@kresco.local / {DEMO_PASSWORD}")
    print(f"VIP student: vip@kresco.local / {DEMO_PASSWORD}")
    print(f"Platinum student: platinum@kresco.local / {DEMO_PASSWORD}")
    print(f"Basic student: basic@kresco.local / {DEMO_PASSWORD}")


async def seed_professor_demo(db: AsyncSession, *, destructive_confirmed: bool = False) -> None:
    require_destructive_seed_session(
        db,
        "seed_professor_demo.seed_professor_demo",
        confirmed=destructive_confirmed,
    )
    math_professor = await upsert_user(
        db,
        "professor@kresco.local",
        "Pr Ahmed Kamil",
        role="professor",
        tier="basic",
        niveau="",
        filiere="",
    )
    physics_professor = await upsert_user(
        db,
        "physics.professor@kresco.local",
        "Pr Lina Amrani",
        role="professor",
        tier="basic",
        niveau="",
        filiere="",
    )
    vip_student = await upsert_user(
        db,
        "vip@kresco.local",
        "Sara Benali",
        role="student",
        tier="vip",
        niveau="2BAC",
        filiere="Sciences Math B",
        is_pro=True,
    )
    platinum_student = await upsert_user(
        db,
        "platinum@kresco.local",
        "Youssef El Idrissi",
        role="student",
        tier="platinum",
        niveau="2BAC",
        filiere="Sciences Math B",
        is_pro=True,
    )
    basic_student = await upsert_user(
        db,
        "basic@kresco.local",
        "Nora Basic",
        role="student",
        tier="basic",
        niveau="2BAC",
        filiere="Sciences Math B",
    )

    math = await upsert_subject(db, "Mathematics", "2BAC Sciences Math B mathematics program")
    physics_subject = await upsert_subject(db, "Physics", "2BAC Sciences Physiques physics program")
    math_track = await upsert_track(db, "2BAC", "Sciences Math B", "2BAC Sciences Math B")
    physics_track = await upsert_track(db, "2BAC", "Sciences Physiques", "2BAC Sciences Physiques")

    math_offering = await upsert_offering(
        db,
        math,
        math_track,
        math_professor,
        "Mathematics - 2BAC Sciences Math B",
    )
    await upsert_offering(
        db,
        physics_subject,
        physics_track,
        physics_professor,
        "Physics - 2BAC Sciences Physiques",
    )

    limits_topic = await upsert_topic(
        db,
        math,
        math_offering,
        "professor-demo-limits-continuity",
        "Limits and Continuity",
        "Exam-ready limits, continuity, and proof techniques.",
        1,
    )
    derivatives_topic = await upsert_topic(
        db,
        math,
        math_offering,
        "professor-demo-derivatives",
        "Derivatives and Function Study",
        "Derivative rules, variations, and optimisation.",
        2,
    )
    limits_item, limits_tab = await upsert_topic_content(db, limits_topic)
    derivatives_item, derivatives_tab = await upsert_topic_content(db, derivatives_topic)

    demo_students = [vip_student, platinum_student, basic_student]
    await clear_professor_demo_rows(db, math_offering, demo_students)
    await seed_live_sessions(db, math_offering, math_professor, limits_topic)
    await seed_live_notifications(db, demo_students)
    await seed_change_requests(
        db,
        math_offering,
        math_professor,
        limits_topic,
        derivatives_topic,
        limits_item,
        derivatives_item,
        limits_tab,
        derivatives_tab,
    )
    await seed_conversations(db, math_offering, math_professor, vip_student, platinum_student)

    await db.commit()
    print("Seeded professor dashboard, live sessions, change requests, and chat threads.")
    print(f"Basic student remains non-eligible for VIP chat: {basic_student.email}")


async def upsert_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    *,
    role: str,
    tier: str,
    niveau: str,
    filiere: str,
    is_pro: bool = False,
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
    user.is_staff = False
    user.is_superuser = False
    user.password = _hash_password(DEMO_PASSWORD)
    await db.flush()
    return user


async def upsert_subject(db: AsyncSession, title: str, description: str) -> Subject:
    subject = await db.scalar(select(Subject).where(Subject.title == title))
    if subject is None:
        subject = Subject(title=title)
        db.add(subject)
    subject.description = description
    subject.is_published = True
    subject.thumbnail_url = ""
    await db.flush()
    return subject


async def upsert_track(db: AsyncSession, niveau: str, filiere: str, title: str) -> ProgramTrack:
    track = await db.scalar(select(ProgramTrack).where(ProgramTrack.niveau == niveau, ProgramTrack.filiere == filiere))
    if track is None:
        track = ProgramTrack(niveau=niveau, filiere=filiere)
        db.add(track)
    track.title = title
    track.status = "active"
    await db.flush()
    return track


async def upsert_offering(db: AsyncSession, subject: Subject, track: ProgramTrack, teacher: User, title: str) -> CourseOffering:
    offering = await db.scalar(
        select(CourseOffering).where(CourseOffering.subject_id == subject.id, CourseOffering.track_id == track.id)
    )
    if offering is None:
        offering = CourseOffering(subject_id=subject.id, track_id=track.id)
        db.add(offering)
    offering.professor_user_id = teacher.id
    offering.title = title
    offering.status = "active"
    await db.flush()
    return offering


async def upsert_topic(
    db: AsyncSession,
    subject: Subject,
    offering: CourseOffering,
    slug: str,
    title: str,
    description: str,
    order: int,
) -> Topic:
    topic = await db.scalar(select(Topic).where(Topic.slug == slug))
    if topic is None:
        topic = Topic(subject_id=subject.id, slug=slug)
        db.add(topic)
    topic.subject_id = subject.id
    topic.course_offering_id = offering.id
    topic.title = title
    topic.description = description
    topic.status = "published"
    topic.order = order
    await db.flush()
    return topic


async def upsert_topic_content(db: AsyncSession, topic: Topic) -> tuple[TopicItem, TabContent]:
    section = await db.scalar(select(TopicSection).where(TopicSection.topic_id == topic.id, TopicSection.title == "Lessons"))
    if section is None:
        section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lesson", order=1)
        db.add(section)
        await db.flush()

    resource = await db.scalar(select(Resource).where(Resource.topic_id == topic.id, Resource.title == f"{topic.title} video"))
    if resource is None:
        resource = Resource(topic_id=topic.id, title=f"{topic.title} video", resource_type="video")
        db.add(resource)
    resource.provider = "vdocipher"
    resource.provider_resource_id = f"demo-{topic.slug}"
    resource.summary = f"Mock VdoCipher resource for {topic.title}."
    await db.flush()

    item = await db.scalar(select(TopicItem).where(TopicItem.topic_id == topic.id, TopicItem.title == f"{topic.title} checkpoint"))
    if item is None:
        item = TopicItem(topic_id=topic.id, section_id=section.id, title=f"{topic.title} checkpoint", item_type="video")
        db.add(item)
    item.section_id = section.id
    item.primary_resource_id = resource.id
    item.description = "Professor-editable demo item with course and quiz tabs."
    item.status = "published"
    item.duration_seconds = 960
    await db.flush()

    tab = await db.scalar(select(TabContent).where(TabContent.topic_item_id == item.id, TabContent.label == "Quiz"))
    if tab is None:
        tab = TabContent(topic_item_id=item.id, label="Quiz", tab_type="quiz")
        db.add(tab)
    tab.content = "Demo quiz tab: limits, continuity, and justification steps."
    tab.config_json = {
        "questions": [
            {
                "text": "Which theorem justifies continuity on a closed interval?",
                "options": ["Intermediate value theorem", "Pythagoras", "Gauss law", "Newton law"],
                "answer": 0,
            }
        ]
    }
    await db.flush()
    item.primary_tab_content_id = tab.id
    await db.flush()
    return item, tab


async def clear_professor_demo_rows(db: AsyncSession, offering: CourseOffering, students: list[User]) -> None:
    conversations = (
        await db.execute(
            select(ProfessorChatConversation.id).where(
                ProfessorChatConversation.course_offering_id == offering.id,
                ProfessorChatConversation.student_user_id.in_([student.id for student in students]),
            )
        )
    ).scalars().all()
    if conversations:
        await db.execute(delete(ProfessorChatMessage).where(ProfessorChatMessage.conversation_id.in_(conversations)))
        await db.execute(delete(ProfessorChatConversation).where(ProfessorChatConversation.id.in_(conversations)))
    live_calendar_ids = (
        await db.execute(select(LiveSession.calendar_event_id).where(LiveSession.course_offering_id == offering.id))
    ).scalars().all()
    await db.execute(delete(LiveSession).where(LiveSession.course_offering_id == offering.id))
    if live_calendar_ids:
        await db.execute(delete(CalendarEvent).where(CalendarEvent.id.in_([event_id for event_id in live_calendar_ids if event_id])))
    await db.execute(delete(Notification).where(Notification.user_id.in_([student.id for student in students]), Notification.type == "live_session"))
    await db.execute(delete(ProfessorChangeRequest).where(ProfessorChangeRequest.course_offering_id == offering.id))
    await db.flush()


async def seed_live_notifications(db: AsyncSession, students: list[User]) -> None:
    for student in students:
        db.add_all([
            Notification(
                user_id=student.id,
                type="live_session",
                title="Live correction scheduled",
                body="Limits national exam correction was added to your calendar.",
            ),
            Notification(
                user_id=student.id,
                type="live_session",
                title="Live Q&A is active",
                body="Open Q&A: continuity and IVT is live now.",
            ),
        ])
    await db.flush()


async def seed_live_sessions(db: AsyncSession, offering: CourseOffering, teacher: User, topic: Topic) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    rows = [
        ("Live correction: limits national exam", "scheduled", "sent", now + timedelta(hours=2), 75),
        ("Open Q&A: continuity and IVT", "live", "live", now - timedelta(minutes=20), 80),
        ("Recorded recap: function domains", "completed", "sent", now - timedelta(days=1, hours=2), 60),
        ("Cancelled extra office hour", "cancelled", "not_sent", now + timedelta(days=2), 45),
    ]
    for title, status, notification_status, starts_at, minutes in rows:
        event = CalendarEvent(
            event_type="live_session",
            title=title,
            subtitle=offering.title,
            teacher_name=teacher.full_name,
            subject_id=offering.subject_id,
            topic_id=topic.id,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=minutes),
            description="Demo calendar event for professor live workflow.",
            join_url="https://live.kresco.local/demo",
            status=status,
            color="#453dee",
        )
        db.add(event)
        await db.flush()
        db.add(
            LiveSession(
                course_offering_id=offering.id,
                professor_user_id=teacher.id,
                calendar_event_id=event.id,
                title=title,
                description="Bring your notes, checkpoint quiz, and two questions.",
                starts_at=starts_at,
                ends_at=starts_at + timedelta(minutes=minutes),
                status=status,
                notification_status=notification_status,
                join_url="https://live.kresco.local/demo",
                vdocipher_live_id=f"vdo-demo-{status}-{event.id}",
            )
        )
    await db.flush()


async def seed_change_requests(
    db: AsyncSession,
    offering: CourseOffering,
    teacher: User,
    limits_topic: Topic,
    derivatives_topic: Topic,
    limits_item: TopicItem,
    derivatives_item: TopicItem,
    limits_tab: TabContent,
    derivatives_tab: TabContent,
) -> None:
    rows = [
        ("topic", limits_topic.id, "pending", {"title": "Limits and Continuity - National Focus"}),
        ("topic_item", limits_item.id, "pending", {"title": "Continuity proof walkthrough", "duration_seconds": 1200}),
        ("tab_content", limits_tab.id, "pending", {"label": "Quiz", "content": "Add one harder proof question."}),
        ("topic", derivatives_topic.id, "approved", {"title": "Derivatives and variations"}),
        ("topic_item", derivatives_item.id, "rejected", {"title": "Remove optimisation checkpoint"}),
        ("tab_content", derivatives_tab.id, "approved", {"content": "Add tangent-line example."}),
    ]
    reviewed_at = datetime.now(timezone.utc) - timedelta(hours=4)
    for target_type, target_id, status, patch in rows:
        db.add(
            ProfessorChangeRequest(
                course_offering_id=offering.id,
                professor_user_id=teacher.id,
                target_type=target_type,
                target_id=target_id,
                change_type="update_fields",
                proposed_patch_json=patch,
                current_snapshot_json={"source": "professor_demo_seed"},
                status=status,
                admin_note="" if status == "pending" else f"Demo {status} admin note",
                reviewed_at=None if status == "pending" else reviewed_at,
            )
        )
    await db.flush()


async def seed_conversations(
    db: AsyncSession,
    offering: CourseOffering,
    teacher: User,
    vip_student: User,
    platinum_student: User,
) -> None:
    vip_conversation = ProfessorChatConversation(
        course_offering_id=offering.id,
        professor_user_id=teacher.id,
        student_user_id=vip_student.id,
        status="open",
        last_message_preview="Can you review my final proof step?",
        unread_for_professor=2,
        unread_for_student=0,
        is_pinned_by_professor=True,
        last_message_at=datetime.now(timezone.utc) - timedelta(minutes=8),
    )
    platinum_conversation = ProfessorChatConversation(
        course_offering_id=offering.id,
        professor_user_id=teacher.id,
        student_user_id=platinum_student.id,
        status="open",
        last_message_preview="Thanks, I will try the variation table again.",
        unread_for_professor=0,
        unread_for_student=1,
        is_pinned_by_professor=False,
        last_message_at=datetime.now(timezone.utc) - timedelta(minutes=23),
    )
    db.add_all([vip_conversation, platinum_conversation])
    await db.flush()
    messages = [
        (vip_conversation.id, vip_student.id, "Can you explain why the final limit is not zero?", 36),
        (vip_conversation.id, teacher.id, "Check the dominant term before cancelling. The denominator wins here.", 28),
        (vip_conversation.id, vip_student.id, "I still get stuck at the conjugate step.", 15),
        (vip_conversation.id, vip_student.id, "Can you review my final proof step?", 8),
        (platinum_conversation.id, platinum_student.id, "Is the variation table required for the national solution?", 55),
        (platinum_conversation.id, teacher.id, "Yes. Include sign, monotonicity, and the final extremum.", 44),
        (platinum_conversation.id, platinum_student.id, "Thanks, I will try the variation table again.", 23),
    ]
    now = datetime.now(timezone.utc)
    for conversation_id, sender_id, body, minutes_ago in messages:
        db.add(
            ProfessorChatMessage(
                conversation_id=conversation_id,
                sender_user_id=sender_id,
                body=body,
                created_at=now - timedelta(minutes=minutes_ago),
            )
        )
    await db.flush()


if __name__ == "__main__":
    asyncio.run(main())
