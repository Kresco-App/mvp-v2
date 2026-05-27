from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base
from app.models.courses import Chapter, ChapterSection, Lesson, Subject
from app.models.gamification import UserXP
from app.models.quizzes import Quiz, QuizOption, QuizQuestion
from app.models.users import User, UserSubjectEntitlement
from app.routers.users import _hash_password
from seed_professor_demo import DEMO_PASSWORD, seed_professor_demo
from seed_safety import require_destructive_seed_session


async def seed_e2e_database(db: AsyncSession, *, destructive_confirmed: bool = False) -> None:
    require_destructive_seed_session(
        db,
        "scripts.e2e_seed.seed_e2e_database",
        confirmed=destructive_confirmed,
    )
    await clear_database(db)
    await seed_professor_demo(db, destructive_confirmed=True)
    await seed_e2e_accounts_and_course_surfaces(db)
    await db.commit()


async def clear_database(db: AsyncSession) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        await db.execute(table.delete())
    await db.flush()


async def seed_e2e_accounts_and_course_surfaces(db: AsyncSession) -> None:
    student = await upsert_user(
        db,
        "student@kresco.local",
        "Kresco Student",
        role="student",
        tier="pro",
        niveau="2BAC",
        filiere="Sciences Math B",
        is_pro=True,
    )
    admin = await upsert_user(
        db,
        "admin@kresco.local",
        "Kresco Admin",
        role="admin",
        tier="platinum",
        niveau="",
        filiere="",
        is_pro=True,
        is_staff=True,
        is_superuser=True,
    )
    vip = await require_user(db, "vip@kresco.local")
    platinum = await require_user(db, "platinum@kresco.local")

    math = await require_subject(db, "Mathematics")
    await ensure_entitlement(db, student, math)
    await ensure_entitlement(db, vip, math)
    await ensure_entitlement(db, platinum, math)
    await ensure_entitlement(db, admin, math)
    await ensure_watch_flow(db, math)

    for user, xp in [(student, 1250), (vip, 2400), (platinum, 2600), (admin, 5000)]:
        await ensure_xp(db, user, total_xp=xp)

    await db.flush()


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
    user.password = _hash_password(DEMO_PASSWORD)
    user.updated_at = now()
    await db.flush()
    return user


async def require_user(db: AsyncSession, email: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        raise RuntimeError(f"Expected seeded user missing: {email}")
    return user


async def require_subject(db: AsyncSession, title: str) -> Subject:
    subject = await db.scalar(select(Subject).where(Subject.title == title))
    if subject is None:
        raise RuntimeError(f"Expected seeded subject missing: {title}")
    subject.is_published = True
    return subject


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
    entitlement.status = "active"
    entitlement.starts_at = now() - timedelta(days=1)
    entitlement.ends_at = now() + timedelta(days=365)
    entitlement.source = "e2e_seed"
    await db.flush()


async def ensure_watch_flow(db: AsyncSession, subject: Subject) -> None:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.subject_id == subject.id, Chapter.title == "E2E Watch Flow")
    )
    if chapter is None:
        chapter = Chapter(subject_id=subject.id, title="E2E Watch Flow")
        db.add(chapter)
    chapter.description = "Backend-backed browser fixture for watch progress."
    chapter.order = 900
    await db.flush()

    section = await db.scalar(
        select(ChapterSection).where(ChapterSection.chapter_id == chapter.id, ChapterSection.title == "E2E Watch Text Section")
    )
    if section is None:
        section = ChapterSection(chapter_id=chapter.id, title="E2E Watch Text Section", section_type="text")
        db.add(section)
    section.order = 1
    section.is_gating = False
    section.is_free_preview = True
    section.content = "<p>Backend-backed watch progress</p>"
    await db.flush()

    lesson = await db.scalar(select(Lesson).where(Lesson.chapter_id == chapter.id, Lesson.title == "E2E Exam Lesson"))
    if lesson is None:
        lesson = Lesson(chapter_id=chapter.id, title="E2E Exam Lesson")
        db.add(lesson)
    lesson.order = 1
    lesson.is_free_preview = True
    lesson.duration_seconds = 300
    await db.flush()

    quiz = await db.scalar(select(Quiz).where(Quiz.lesson_id == lesson.id))
    if quiz is None:
        quiz = Quiz(lesson_id=lesson.id, title="E2E Exam Quiz", pass_score=70)
        db.add(quiz)
    await db.flush()

    question = await db.scalar(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id, QuizQuestion.order == 1))
    if question is None:
        question = QuizQuestion(quiz_id=quiz.id, text="What is the E2E answer?", order=1)
        db.add(question)
    await db.flush()

    if not (await db.scalar(select(QuizOption).where(QuizOption.question_id == question.id))):
        db.add_all(
            [
                QuizOption(question_id=question.id, text="Correct", is_correct=True),
                QuizOption(question_id=question.id, text="Incorrect", is_correct=False),
            ]
        )
    await db.flush()


async def ensure_xp(db: AsyncSession, user: User, *, total_xp: int) -> None:
    xp = await db.scalar(select(UserXP).where(UserXP.user_id == user.id))
    if xp is None:
        xp = UserXP(user_id=user.id)
        db.add(xp)
    xp.total_xp = total_xp
    xp.streak_days = 5
    xp.last_active_date = date.today()
    xp.updated_at = now()
    await db.flush()


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)
