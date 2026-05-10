"""Seed realistic local-only burner data for UI review.

This does not change schema. It fills the local database with enough subjects,
topics, workspace items, tabs, progress, notes, saves, exams, leaderboard users,
notifications, and comments to exercise the main Kresco components.

Usage:
    cd backend
    set DATABASE_URL=sqlite+aiosqlite:///./db.sqlite3
    python seed_burner_data.py
"""

from __future__ import annotations

import asyncio
import hashlib
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.database import _build_async_url
from app.models import calendar, courses, gamification, interactions, notifications, quizzes, users  # noqa: F401
from app.models.base import Base
from app.models.calendar import CalendarEvent
from app.models.courses import (
    ConceptTag,
    Exam,
    ExamProblem,
    Resource,
    Subject,
    TabContent,
    Topic,
    TopicItem,
    TopicSection,
)
from app.models.gamification import ActivityEvent, DailyQuest, QuizAttempt, TopicItemProgress, UserXP, XPTransaction
from app.models.interactions import Comment, SavedItem, UserNote
from app.models.notifications import Notification
from app.models.users import User


DEMO_EMAIL = "student@kresco.local"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(plain: str) -> str:
    salt = b"kresco-local-burner"
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
    return salt.hex() + ":" + dk.hex()


def slugify(value: str) -> str:
    replacements = {
        " ": "-",
        "'": "",
        "é": "e",
        "è": "e",
        "ê": "e",
        "à": "a",
        "ç": "c",
        "î": "i",
        "ï": "i",
        "ô": "o",
        "ù": "u",
        "É": "e",
    }
    out = value.lower()
    for old, new in replacements.items():
        out = out.replace(old, new)
    return "".join(ch for ch in out if ch.isalnum() or ch == "-").strip("-")


def question_set(topic: str) -> list[dict[str, Any]]:
    return [
        {
            "id": "q1",
            "type": "multiple_choice",
            "prompt": f"What is the first reliable move when solving {topic}?",
            "options": ["Identify givens", "Skip units", "Guess the graph", "Copy the final line"],
            "answer": "Identify givens",
        },
        {
            "id": "q2",
            "type": "true_false",
            "prompt": f"{topic} questions often require checking domain conditions before applying a formula.",
            "options": ["true", "false"],
            "answer": "true",
        },
        {
            "id": "q3",
            "type": "short_answer",
            "prompt": "Write one keyword you must include in a clean Bac conclusion.",
            "answer": "unit",
        },
    ]


WAVE_PERIODICITY_ANIMATED_COURSE: dict[str, Any] = {
    "version": 1,
    "course_type": "animated_lesson",
    "locale": "fr-MA",
    "title": "Periodicite temporelle et spatiale d'une onde",
    "estimated_minutes": 7,
    "summary": "Animated Bac physics lesson for reading T, f, lambda, and celerity from a wave.",
    "objectives": [
        "Distinguish temporal periodicity from spatial periodicity.",
        "Read period T and wavelength lambda from an animation or graph.",
        "Use f = 1 / T and v = lambda * f with correct units.",
    ],
    "initial_state": {
        "period_s": 0.20,
        "frequency_hz": 5.0,
        "wavelength_m": 0.40,
        "celerity_m_s": 2.0,
        "amplitude_cm": 2.0,
        "phase_offset_deg": 0,
    },
    "scenes": [
        {
            "id": "temporal-period",
            "heading": "Follow one point of the medium",
            "animation": "wave_point_timer",
            "duration_seconds": 90,
            "narration": "A fixed point repeats the same motion after one period T.",
            "controls": [
                {"key": "period_s", "type": "slider", "min": 0.05, "max": 1.00, "step": 0.05, "default": 0.20},
                {"key": "amplitude_cm", "type": "slider", "min": 0.5, "max": 5.0, "step": 0.5, "default": 2.0},
            ],
            "callouts": [
                {"target": "timer", "text": "T is measured in seconds."},
                {"target": "marker", "text": "Same position and same direction of motion means one cycle."},
            ],
        },
        {
            "id": "spatial-period",
            "heading": "Measure one repeated shape",
            "animation": "wavelength_ruler",
            "duration_seconds": 80,
            "narration": "At a fixed instant, two consecutive crests are separated by one wavelength lambda.",
            "controls": [
                {"key": "wavelength_m", "type": "slider", "min": 0.10, "max": 1.20, "step": 0.05, "default": 0.40},
            ],
            "callouts": [
                {"target": "crest_a", "text": "Crest A"},
                {"target": "crest_b", "text": "Crest B"},
                {"target": "ruler", "text": "lambda is measured in meters."},
            ],
        },
        {
            "id": "speed-relation",
            "heading": "Connect the three quantities",
            "animation": "formula_balance",
            "duration_seconds": 100,
            "narration": "Wave speed is the distance advanced by the pattern per second: v = lambda * f.",
            "formula": "v = lambda * f = lambda / T",
            "worked_example": {
                "given": {"T_s": 0.20, "lambda_m": 0.40},
                "steps": ["f = 1 / T = 5.0 Hz", "v = lambda * f = 0.40 * 5.0 = 2.0 m/s"],
                "answer": "2.0 m/s",
            },
        },
    ],
    "checkpoints": [
        {
            "id": "wave-periodicity-check",
            "type": "numeric_answer",
            "prompt": "If T = 0.25 s and lambda = 0.50 m, calculate v in m/s.",
            "answer": "2",
            "tolerance": 0.01,
        }
    ],
}


NUCLEUS_COMPOSITION_ANIMATED_COURSE: dict[str, Any] = {
    "version": 1,
    "course_type": "animated_lesson",
    "locale": "fr-MA",
    "title": "Composition du noyau et notation nucleaire",
    "estimated_minutes": 6,
    "summary": "Animated Bac physics lesson for linking A, Z, protons, neutrons, and isotopes.",
    "objectives": [
        "Identify Z as the number of protons.",
        "Calculate neutrons with N = A - Z.",
        "Compare isotopes of the same element.",
    ],
    "initial_state": {
        "element_symbol": "C",
        "mass_number_A": 14,
        "atomic_number_Z": 6,
        "protons": 6,
        "neutrons": 8,
        "electrons": 6,
        "show_electron_cloud": False,
    },
    "scenes": [
        {
            "id": "build-nucleus",
            "heading": "Build the nucleus from Z and A",
            "animation": "nucleon_counter",
            "duration_seconds": 90,
            "narration": "Z fixes the element. A counts all nucleons in the nucleus.",
            "formula": "A = Z + N",
            "controls": [
                {"key": "atomic_number_Z", "type": "stepper", "min": 1, "max": 20, "default": 6},
                {"key": "mass_number_A", "type": "stepper", "min": 1, "max": 40, "default": 14},
            ],
            "callouts": [
                {"target": "protons", "text": "6 protons means carbon."},
                {"target": "neutrons", "text": "N = 14 - 6 = 8 neutrons."},
            ],
        },
        {
            "id": "isotope-compare",
            "heading": "Compare carbon isotopes",
            "animation": "isotope_slider",
            "duration_seconds": 80,
            "narration": "Isotopes have the same Z but different N, so A changes.",
            "examples": [
                {"symbol": "C-12", "Z": 6, "A": 12, "N": 6, "stable": True},
                {"symbol": "C-14", "Z": 6, "A": 14, "N": 8, "stable": False},
            ],
        },
        {
            "id": "conservation",
            "heading": "Prepare nuclear reaction balancing",
            "animation": "conservation_balance",
            "duration_seconds": 90,
            "narration": "In Bac exercises, conserve total A and total Z across a nuclear equation.",
            "worked_example": {
                "equation_template": "A/Z X -> 14/6 C + 0/-1 e",
                "checks": ["Mass numbers are conserved.", "Atomic numbers are conserved."],
            },
        },
    ],
    "checkpoints": [
        {
            "id": "nucleus-composition-check",
            "type": "numeric_answer",
            "prompt": "How many neutrons are in a nucleus with A = 23 and Z = 11?",
            "answer": "12",
            "tolerance": 0,
        }
    ],
}


def animated_course_for_title(title: str) -> tuple[str, dict[str, Any]] | None:
    normalized = slugify(title)
    if "ondes-mecaniques-periodiques" in normalized:
        return "periodicite_interactive_course", WAVE_PERIODICITY_ANIMATED_COURSE
    if "transformations-nucleaires" in normalized:
        return "nucleus_composition_interactive_course", NUCLEUS_COMPOSITION_ANIMATED_COURSE
    return None


async def get_or_create_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    *,
    total_xp: int,
    streak_days: int,
    is_demo: bool = False,
) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    timestamp = now_utc()
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            avatar_url="",
            role="student",
            niveau="2bac",
            filiere="Bac Sciences Physiques",
            is_pro=True,
            is_active=True,
            is_email_verified=True,
            password=hash_password("kresco123") if is_demo else "!",
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(user)
        await db.flush()
    else:
        user.full_name = full_name
        user.role = "student"
        user.niveau = "2bac"
        user.filiere = "Bac Sciences Physiques"
        user.is_pro = True
        user.is_active = True
        user.is_email_verified = True
        if is_demo:
            user.password = hash_password("kresco123")
        user.updated_at = timestamp

    xp = (await db.execute(select(UserXP).where(UserXP.user_id == user.id))).scalar_one_or_none()
    if xp is None:
        xp = UserXP(user_id=user.id, total_xp=total_xp, streak_days=streak_days, last_active_date=date.today(), updated_at=timestamp)
        db.add(xp)
    else:
        xp.total_xp = total_xp
        xp.streak_days = streak_days
        xp.last_active_date = date.today()
        xp.updated_at = timestamp
    return user


async def get_or_create_subject(db: AsyncSession, title: str, description: str, order: int) -> Subject:
    subject = (await db.execute(select(Subject).where(Subject.title == title))).scalar_one_or_none()
    if subject is None:
        subject = Subject(title=title, description=description, thumbnail_url="", is_published=True, order=order, created_at=now_utc())
        db.add(subject)
        await db.flush()
    else:
        subject.description = description
        subject.is_published = True
        subject.order = order
    return subject


async def ensure_tags(db: AsyncSession, labels: list[str]) -> list[str]:
    slugs: list[str] = []
    for label in labels:
        slug = slugify(label)
        tag = (await db.execute(select(ConceptTag).where(ConceptTag.slug == slug))).scalar_one_or_none()
        if tag is None:
            db.add(ConceptTag(slug=slug, label=label, tag_type="concept", created_at=now_utc()))
        else:
            tag.label = label
        slugs.append(slug)
    return slugs


async def rebuild_topic(
    db: AsyncSession,
    subject: Subject,
    *,
    title: str,
    description: str,
    order: int,
    concepts: list[str],
    progress: str,
) -> Topic:
    slug = f"{slugify(subject.title)}-{slugify(title)}"
    exam_title = f"National Bac {2022 + (order % 4)} - {subject.title}"
    old_exam_ids = [
        row[0]
        for row in (
            await db.execute(select(Exam.id).where(Exam.subject_id == subject.id, Exam.title == exam_title))
        ).all()
    ]
    if old_exam_ids:
        await db.execute(delete(ExamProblem).where(ExamProblem.exam_id.in_(old_exam_ids)))
        await db.execute(delete(Exam).where(Exam.id.in_(old_exam_ids)))

    existing = (await db.execute(select(Topic).where(Topic.slug == slug))).scalar_one_or_none()
    if existing is not None:
        old_item_ids = [
            row[0]
            for row in (
                await db.execute(select(TopicItem.id).where(TopicItem.topic_id == existing.id))
            ).all()
        ]
        if old_item_ids:
            await db.execute(delete(TabContent).where(TabContent.topic_item_id.in_(old_item_ids)))
            await db.execute(delete(TopicItemProgress).where(TopicItemProgress.topic_item_id.in_(old_item_ids)))
            await db.execute(delete(QuizAttempt).where(QuizAttempt.topic_item_id.in_(old_item_ids)))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.topic_item_id.in_(old_item_ids)))
            await db.execute(delete(UserNote).where(UserNote.topic_item_id.in_(old_item_ids)))
            await db.execute(delete(SavedItem).where(SavedItem.topic_item_id.in_(old_item_ids)))
            await db.execute(delete(Comment).where(Comment.target_type == "topic_item", Comment.target_id.in_(old_item_ids)))
        await db.execute(delete(ExamProblem).where(ExamProblem.topic_id == existing.id))
        await db.execute(delete(TopicItem).where(TopicItem.topic_id == existing.id))
        await db.execute(delete(TopicSection).where(TopicSection.topic_id == existing.id))
        await db.execute(delete(Resource).where(Resource.topic_id == existing.id))
        await db.delete(existing)
        await db.flush()

    tag_slugs = await ensure_tags(db, concepts)
    topic = Topic(
        subject_id=subject.id,
        slug=slug,
        title=title,
        description=description,
        status="published",
        order=order,
        is_free_preview=order <= 2,
        progress_weight_main=75,
        created_at=now_utc(),
    )
    db.add(topic)
    await db.flush()

    resources = [
        Resource(
            topic_id=topic.id,
            title=f"{title} intro video",
            resource_type="video",
            provider="mock_youtube",
            provider_resource_id=f"yt-{slug}-intro",
            summary="Embedded local preview video for workspace review.",
            is_free_preview=True,
            created_at=now_utc(),
        ),
        Resource(
            topic_id=topic.id,
            title=f"{title} method sheet",
            resource_type="summary",
            url=f"/mock-resources/{slug}-method.pdf",
            summary="One-page method sheet with Bac-style steps and traps.",
            is_free_preview=True,
            created_at=now_utc(),
        ),
        Resource(
            topic_id=topic.id,
            title=f"{title} worksheet",
            resource_type="worksheet",
            url=f"/mock-resources/{slug}-worksheet.pdf",
            summary="Practice worksheet with progressive exercises.",
            created_at=now_utc(),
        ),
        Resource(
            topic_id=topic.id,
            title=f"{title} Bac correction video",
            resource_type="video",
            provider="mock_youtube",
            provider_resource_id=f"yt-{slug}-bac",
            summary="Mock Bac correction video for the final problem.",
            created_at=now_utc(),
        ),
    ]
    db.add_all(resources)
    await db.flush()

    lessons = TopicSection(topic_id=topic.id, title="Lesson", section_type="lessons", order=1)
    exercises = TopicSection(topic_id=topic.id, title="Exercise", section_type="exercises", order=2)
    homework = TopicSection(topic_id=topic.id, title="Homework", section_type="homework", order=3)
    bac = TopicSection(topic_id=topic.id, title="National Exam Example", section_type="bac_examples", order=4)
    db.add_all([lessons, exercises, homework, bac])
    await db.flush()

    intro = TopicItem(
        topic_id=topic.id,
        section_id=lessons.id,
        primary_resource_id=resources[0].id,
        title="Introduction and core vocabulary",
        description="Start here, then use the tabs to practice the concept.",
        item_type="lesson_video",
        renderer_key="youtube_embed",
        duration_seconds=720,
        order=1,
        completion_policy="watched_80",
        is_free_preview=True,
        concept_slugs=tag_slugs,
        created_at=now_utc(),
    )
    checkpoint = TopicItem(
        topic_id=topic.id,
        section_id=lessons.id,
        title="Checkpoint quiz",
        description="Quick check before the guided application.",
        item_type="checkpoint_quiz",
        duration_seconds=420,
        order=2,
        completion_policy="quiz_submitted",
        concept_slugs=tag_slugs[:3],
        created_at=now_utc(),
    )
    guided = TopicItem(
        topic_id=topic.id,
        section_id=exercises.id,
        primary_resource_id=resources[0].id,
        title="Guided application exercise",
        description="A solved exercise with method notes and traps.",
        item_type="exercise_solution_video",
        renderer_key="youtube_embed",
        duration_seconds=840,
        order=1,
        completion_policy="watched_80",
        concept_slugs=tag_slugs,
        created_at=now_utc(),
    )
    practice = TopicItem(
        topic_id=topic.id,
        section_id=homework.id,
        title="Autonomous practice set",
        description="Timed practice with immediate correction hints.",
        item_type="practice_set",
        duration_seconds=1200,
        order=1,
        completion_policy="manual",
        concept_slugs=tag_slugs,
        created_at=now_utc(),
    )
    exam = TopicItem(
        topic_id=topic.id,
        section_id=bac.id,
        primary_resource_id=resources[3].id,
        title="National Bac problem",
        description="Topic-relevant Bac example with written and video correction.",
        item_type="bac_example",
        renderer_key="youtube_embed",
        duration_seconds=960,
        order=1,
        completion_policy="manual",
        concept_slugs=tag_slugs,
        created_at=now_utc(),
    )
    db.add_all([intro, checkpoint, guided, practice, exam])
    await db.flush()

    q = question_set(title)
    animated_course = animated_course_for_title(title)
    lab_label = "Animated Course" if animated_course else "Lab"
    lab_type = "interactive" if animated_course else "lab"
    lab_config = animated_course[1] if animated_course else {}
    lab_renderer = animated_course[0] if animated_course else ("continuity_graph_lab" if "continu" in slug else "wave_simulator")
    lab_content = lab_config.get("summary", "Interactive local lab data for manipulating parameters and observing the rule.")
    tab_rows = [
        (intro, "Course", "course", 1, f"## {title}\n\nA clean Bac explanation with definitions, required conditions, and a worked micro-example.", {}, "", True, None),
        (intro, lab_label, lab_type, 2, lab_content, lab_config, lab_renderer, True, None),
        (intro, "Quiz", "quiz", 3, "", {"pass_score": 70, "questions": q}, "", True, None),
        (intro, "Summary", "summary", 4, "Condensed notes: definitions, method, common mistakes, and final answer format.", {}, "", False, resources[1]),
        (intro, "Resources", "resources", 5, "Worksheet, correction sheet, and optional recap video.", {}, "", False, resources[2]),
        (intro, "Notes", "notes", 6, "Personal note surface for this lesson.", {}, "", False, None),
        (checkpoint, "Quiz", "quiz", 1, "", {"pass_score": 70, "questions": q}, "", True, None),
        (checkpoint, "Notes", "notes", 2, "", {}, "", False, None),
        (guided, "Statement", "course", 1, "Try the exercise first, then compare each step with the correction.", {}, "", True, None),
        (guided, "Quiz", "quiz", 2, "", {"pass_score": 70, "questions": q[:2]}, "", False, None),
        (guided, "Notes", "notes", 3, "", {}, "", False, None),
        (practice, "Practice", "course", 1, "Three progressively harder tasks with final answer checks.", {}, "", True, None),
        (practice, "Resources", "resources", 2, "Extra exercises and teacher correction.", {}, "", False, resources[2]),
        (practice, "Notes", "notes", 3, "", {}, "", False, None),
        (exam, "Problem", "exam_problem", 1, "Bac statement preview with known values and expected reasoning.", {}, "", True, None),
        (exam, "Correction", "course", 2, "Written correction scaffold with examiner-style conclusion.", {}, "", False, None),
        (exam, "Notes", "notes", 3, "", {}, "", False, None),
    ]
    for item, label, tab_type, tab_order, content, config, renderer, recommended, resource in tab_rows:
        db.add(TabContent(
            topic_item_id=item.id,
            resource_id=resource.id if resource else None,
            label=label,
            tab_type=tab_type,
            content=content,
            config_json=config,
            renderer_key=renderer,
            order=tab_order,
            status="published",
            is_recommended=recommended,
            concept_slugs=tag_slugs,
        ))

    exam_row = Exam(
        subject_id=subject.id,
        title=exam_title,
        year=2022 + (order % 4),
        session="Normal",
        statement_url=f"/mock-exams/{slug}.pdf",
        status="published",
    )
    db.add(exam_row)
    await db.flush()
    db.add(ExamProblem(
        exam_id=exam_row.id,
        topic_id=topic.id,
        video_resource_id=resources[3].id,
        title=f"{title} - complete Bac problem",
        statement=f"Analyze a realistic Bac situation involving {', '.join(concepts[:3])}.",
        written_solution="1. Extract givens. 2. State the theorem or relation. 3. Substitute carefully. 4. Conclude with units and interpretation.",
        written_solution_url=f"/mock-exams/{slug}-solution.pdf",
        order=1,
        difficulty="bac",
        status="published",
        concept_slugs=tag_slugs,
    ))

    topic._burner_progress = progress  # type: ignore[attr-defined]
    return topic


async def seed_progress_and_surfaces(db: AsyncSession, user: User, topics: list[Topic]) -> None:
    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    await db.execute(delete(UserNote).where(UserNote.user_id == user.id))
    await db.execute(delete(SavedItem).where(SavedItem.user_id == user.id))
    await db.execute(delete(DailyQuest).where(DailyQuest.user_id == user.id))
    await db.execute(delete(QuizAttempt).where(QuizAttempt.user_id == user.id))
    await db.execute(delete(TopicItemProgress).where(TopicItemProgress.user_id == user.id))
    await db.execute(delete(XPTransaction).where(XPTransaction.user_id == user.id))

    base_time = now_utc()
    for index, topic in enumerate(topics):
        progress = getattr(topic, "_burner_progress", "new")
        sections = (await db.execute(select(TopicSection).where(TopicSection.topic_id == topic.id).order_by(TopicSection.order))).scalars().all()
        items = []
        for section in sections:
            items.extend((await db.execute(select(TopicItem).where(TopicItem.section_id == section.id).order_by(TopicItem.order))).scalars().all())

        complete_count = {"done": len(items), "progress": 2, "warm": 1, "new": 0}.get(progress, 0)
        for item_index, item in enumerate(items):
            if item_index < complete_count:
                db.add(TopicItemProgress(
                    user_id=user.id,
                    topic_id=topic.id,
                    topic_item_id=item.id,
                    status="completed",
                    watched_seconds=item.duration_seconds or 600,
                    best_score=86 if "quiz" in item.item_type else None,
                    latest_score=86 if "quiz" in item.item_type else None,
                    completed_at=base_time - timedelta(days=index, hours=item_index),
                    updated_at=base_time - timedelta(days=index, minutes=item_index * 11),
                ))
                db.add(XPTransaction(
                    user_id=user.id,
                    amount=20 if "quiz" in item.item_type else 10,
                    reason="quiz_pass" if "quiz" in item.item_type else "lesson_complete",
                    description=f"Completed {item.title}",
                    created_at=base_time - timedelta(days=index, minutes=item_index * 7),
                ))

        active_item = items[min(complete_count, len(items) - 1)] if items else None
        if active_item:
            tab = (await db.execute(select(TabContent).where(TabContent.topic_item_id == active_item.id).order_by(TabContent.order))).scalars().first()
            db.add(UserNote(
                user_id=user.id,
                topic_id=topic.id,
                topic_item_id=active_item.id,
                tab_content_id=tab.id if tab else None,
                body=f"Review {topic.title}: write the condition first, then calculate. Watch for unit conversion and final wording.",
                created_at=base_time - timedelta(days=index, hours=1),
                updated_at=base_time - timedelta(days=index),
            ))
            db.add(SavedItem(
                user_id=user.id,
                target_type="topic_item",
                target_id=active_item.id,
                topic_id=topic.id,
                topic_item_id=active_item.id,
                label=f"Revisit: {active_item.title}",
                created_at=base_time - timedelta(days=index, minutes=18),
            ))

    quests = [
        ("lesson", "Complete 1 Mathematics Lesson", 1, 1, 25),
        ("quiz", "Score 14/20 or higher in 2 exercises", 2, 1, 35),
        ("study_time", "Spend 15min studying Physics", 15, 9, 20),
    ]
    for quest_type, title, target, progress, reward in quests:
        db.add(DailyQuest(
            user_id=user.id,
            quest_type=quest_type,
            title=title,
            target=target,
            progress=progress,
            xp_reward=reward,
            date=date.today(),
            completed=progress >= target,
        ))

    notifications_data = [
        ("xp", "Progress saved", "Your workspace progress is ready for review."),
        ("quest", "Daily quest almost done", "One more quiz will complete today's quest."),
        ("badge", "Continuity streak", "You kept a two-day study streak."),
        ("system", "Burner data loaded", "Local demo data is seeded for component review."),
    ]
    for idx, (kind, title, body) in enumerate(notifications_data):
        db.add(Notification(
            user_id=user.id,
            type=kind,
            title=title,
            body=body,
            is_read=idx > 1,
            created_at=base_time - timedelta(minutes=idx * 23),
        ))


async def seed_leaderboard(db: AsyncSession) -> None:
    rows = [
        ("ahmed.malik@kresco.local", "Ahmed Malik", 542541, 18),
        ("fatima.ansari@kresco.local", "Fatima Ansari", 541135, 17),
        ("yasmine.elidrissi@kresco.local", "Yasmine El Idrissi", 518220, 16),
        ("omar.tazi@kresco.local", "Omar Tazi", 492870, 15),
        ("salma.bennani@kresco.local", "Salma Bennani", 455430, 14),
        ("amine.lahlou@kresco.local", "Amine Lahlou", 431780, 12),
        ("nora.sabri@kresco.local", "Nora Sabri", 398125, 11),
    ]
    for email, name, xp, streak in rows:
        await get_or_create_user(db, email, name, total_xp=xp, streak_days=streak)


async def seed_comments(db: AsyncSession, user: User, topics: list[Topic]) -> None:
    await db.execute(delete(Comment).where(Comment.target_type == "topic_item"))
    peers = (await db.execute(select(User).where(User.email != DEMO_EMAIL).limit(4))).scalars().all()
    if not peers:
        return
    for topic in topics[:4]:
        item = (
            await db.execute(
                select(TopicItem)
                .where(TopicItem.topic_id == topic.id)
                .order_by(TopicItem.order)
            )
        ).scalars().first()
        if item is None:
            continue
        db.add_all([
            Comment(user_id=peers[0].id, target_type="topic_item", target_id=item.id, body="This example finally made the method click for me.", created_at=now_utc() - timedelta(hours=3), updated_at=now_utc() - timedelta(hours=3)),
            Comment(user_id=peers[1].id, target_type="topic_item", target_id=item.id, body="Can someone explain why the condition is checked before substituting?", created_at=now_utc() - timedelta(hours=2), updated_at=now_utc() - timedelta(hours=2)),
            Comment(user_id=user.id, target_type="topic_item", target_id=item.id, body="For Bac correction, I would write the theorem first and then the numeric step.", created_at=now_utc() - timedelta(hours=1), updated_at=now_utc() - timedelta(hours=1)),
        ])


async def seed_calendar_events(db: AsyncSession, topics: list[Topic]) -> None:
    await db.execute(delete(CalendarEvent))
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    by_title = {topic.title.lower(): topic for topic in topics}

    def topic_contains(fragment: str) -> Topic | None:
        return next((topic for title, topic in by_title.items() if fragment in title), None)

    def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
        return datetime.combine(monday + timedelta(days=day_offset), datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=hour, minutes=minute)

    math_topic = topic_contains("continu")
    physics_topic = topic_contains("ondes")
    philosophy_topic = topic_contains("conscience")
    biology_topic = topic_contains("genetique")
    english_topic = topic_contains("writing")

    events = [
        CalendarEvent(event_type="live_session", title="Live: Mathematics - Limits and Continuity", subtitle="Mathematics", teacher_name="Pr Ahmed Kamil", subject_id=math_topic.subject_id if math_topic else None, topic_id=math_topic.id if math_topic else None, starts_at=at(0, 4), ends_at=at(0, 5, 30), description="Prepare continuity definitions and bring two questions from the checkpoint quiz.", preparation_href=f"/topics/{math_topic.id}" if math_topic else "/courses"),
        CalendarEvent(event_type="study_block", title="Study Block: Physics wave speed", subtitle="Physics", teacher_name="Personal study", subject_id=physics_topic.subject_id if physics_topic else None, topic_id=physics_topic.id if physics_topic else None, starts_at=at(1, 10, 30), ends_at=at(1, 12, 30), description="Review period, frequency, wavelength, and the relation v = lambda f.", preparation_href=f"/topics/{physics_topic.id}" if physics_topic else "/courses", color="#29aee4"),
        CalendarEvent(event_type="live_session", title="Live: Physics - Mechanical Waves", subtitle="Physics", teacher_name="Pr Salma Rami", subject_id=physics_topic.subject_id if physics_topic else None, topic_id=physics_topic.id if physics_topic else None, starts_at=at(2, 3), ends_at=at(2, 6, 30), description="A Bac-focused live correction on periodic mechanical waves.", preparation_href=f"/topics/{physics_topic.id}" if physics_topic else "/courses"),
        CalendarEvent(event_type="study_block", title="Study Block: Philosophy outline", subtitle="Philosophy", teacher_name="Personal study", subject_id=philosophy_topic.subject_id if philosophy_topic else None, topic_id=philosophy_topic.id if philosophy_topic else None, starts_at=at(3, 14), ends_at=at(3, 15), description="Draft a clean argument outline for conscience and freedom.", preparation_href=f"/topics/{philosophy_topic.id}" if philosophy_topic else "/courses", color="#f5900b"),
        CalendarEvent(event_type="live_session", title="Live: Biology - Genetic reasoning", subtitle="Biology", teacher_name="Pr Nadia Idrissi", subject_id=biology_topic.subject_id if biology_topic else None, topic_id=biology_topic.id if biology_topic else None, starts_at=at(4, 16), ends_at=at(4, 17, 30), description="Pedigree analysis and probability reasoning for Bac-style problems.", preparation_href=f"/topics/{biology_topic.id}" if biology_topic else "/courses"),
        CalendarEvent(event_type="study_block", title="Study Block: English essay practice", subtitle="English", teacher_name="Personal study", subject_id=english_topic.subject_id if english_topic else None, topic_id=english_topic.id if english_topic else None, starts_at=at(5, 9), ends_at=at(5, 10), description="Write one short essay introduction and compare it with the method notes.", preparation_href=f"/topics/{english_topic.id}" if english_topic else "/courses", color="#16a34a"),
    ]
    db.add_all(events)


async def seed_all(db: AsyncSession) -> None:
    demo = await get_or_create_user(db, DEMO_EMAIL, "Kresco Student", total_xp=1840, streak_days=6, is_demo=True)
    await seed_leaderboard(db)

    await db.execute(update(Subject).values(is_published=False))
    subjects = [
        ("Math", "Bac mathematics with guided lessons, labs, quizzes, and national exam practice.", 1),
        ("Physics", "Physics workspaces focused on video, concepts, and Bac problems.", 2),
        ("Philosophy", "Philosophy topics for concepts, text analysis, and guided writing.", 3),
        ("Biology", "Biology topics for diagrams, definitions, and exam reasoning.", 4),
        ("English", "English language practice for grammar, writing, and exam communication.", 5),
    ]
    subject_rows = {title: await get_or_create_subject(db, title, description, order) for title, description, order in subjects}

    topic_specs = [
        (subject_rows["Math"], "Limites et Continuite", "Master continuity at a point, interval images, and extension by continuity.", 1, ["continuite", "limites", "prolongement", "valeurs intermediaires", "fonction"], "done"),
        (subject_rows["Math"], "Les suites numeriques", "Arithmetic and geometric sequences, monotonicity, and Bac recurrence proofs.", 2, ["suite arithmetique", "suite geometrique", "recurrence", "limite"], "progress"),
        (subject_rows["Math"], "Derivation et etude des fonctions", "Derivative sign tables, tangent lines, and complete variation studies.", 3, ["derivee", "tangente", "variation", "extremum"], "warm"),
        (subject_rows["Math"], "Logarithme neperien", "Properties of ln, equations, inequalities, and graph interpretation.", 4, ["logarithme", "equation", "inequation", "domaine"], "new"),
        (subject_rows["Physics"], "Ondes mecaniques periodiques", "Period, frequency, wavelength, propagation speed, and stroboscopic reading.", 5, ["periode", "frequence", "longueur onde", "celerite", "onde"], "progress"),
        (subject_rows["Physics"], "Transformations nucleaires", "Radioactive decay, conservation laws, activity, and half-life calculations.", 6, ["noyau", "radioactivite", "demi-vie", "activite"], "warm"),
        (subject_rows["Physics"], "Electricite RC", "Charging and discharging curves, differential equation, and time constant.", 7, ["condensateur", "constante de temps", "tension", "courant"], "new"),
        (subject_rows["Physics"], "Chimie acide-base", "pH, titration curves, equivalence, and species distribution.", 8, ["ph", "dosage", "equivalence", "acide", "base"], "new"),
        (subject_rows["Philosophy"], "Conscience et liberte", "Core philosophy concepts for text analysis and structured argumentation.", 9, ["conscience", "liberte", "argumentation", "texte"], "new"),
        (subject_rows["Biology"], "Genetique humaine", "Pedigree analysis, allele notation, and inheritance probability.", 10, ["gene", "allele", "pedigree", "probabilite"], "new"),
        (subject_rows["English"], "Writing Skills", "Essay structure, argument flow, and grammar review for exam writing.", 11, ["essay", "grammar", "argument", "writing"], "new"),
    ]
    topics = [
        await rebuild_topic(db, subject, title=title, description=description, order=order, concepts=concepts, progress=progress)
        for subject, title, description, order, concepts, progress in topic_specs
    ]

    await seed_progress_and_surfaces(db, demo, topics)
    await seed_comments(db, demo, topics)
    await seed_calendar_events(db, topics)
    await db.commit()


async def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./db.sqlite3")
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with session_factory() as db:
        await seed_all(db)
    await engine.dispose()
    print("Burner data seeded.")
    print("Login: student@kresco.local / kresco123")


if __name__ == "__main__":
    asyncio.run(main())
