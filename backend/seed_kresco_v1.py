"""Seed Kresco v1 local Bac content.

Usage:
    cd backend
    set DATABASE_URL=sqlite+aiosqlite:///./db.sqlite3
    set KRESCO_CONFIRM_DESTRUCTIVE_SEED=seed_kresco_v1.py:sqlite+aiosqlite:///./db.sqlite3
    python seed_kresco_v1.py

The script is intentionally local-friendly: it defaults to SQLite and uses
placeholder provider IDs instead of requiring VdoCipher/Stripe/email secrets.
"""
import asyncio
import hashlib
import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.database import _build_async_url
from app.models import calendar, courses, gamification, interactions, notifications, quizzes, users  # noqa: F401
from app.models.base import Base
from app.models.calendar import CalendarEvent
from app.models.courses import (
    ConceptTag, Exam, ExamProblem, Resource, Subject, TabContent, Topic, TopicItem,
    TopicSection,
)
from app.models.gamification import UserXP
from app.models.users import User
from seed_safety import require_destructive_seed_database_url, require_destructive_seed_session


def hash_password(plain: str) -> str:
    salt = b"kresco-local-seed"
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
    return salt.hex() + ":" + dk.hex()


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace(" ", "-")
        .replace("'", "")
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("ç", "c")
    )


PHYSICS_QUESTIONS = [
    {"id": "q1", "type": "multiple_choice", "prompt": "A wave period is measured in:", "options": ["Hz", "s", "m", "m/s"], "answer": "s"},
    {"id": "q2", "type": "true_false", "prompt": "Frequency and period satisfy f = 1 / T.", "options": ["true", "false"], "answer": "true"},
    {"id": "q3", "type": "numeric_answer", "prompt": "If T = 0.02 s, what is f in Hz?", "answer": "50"},
    {"id": "q4", "type": "multi_select", "prompt": "Select wave quantities measured from a graph.", "options": ["period", "wavelength", "mass", "frequency"], "answer": ["period", "wavelength"]},
    {"id": "q5", "type": "matching", "prompt": "Match quantity to unit.", "answer": {"T": "s", "f": "Hz", "lambda": "m"}},
    {"id": "q6", "type": "ordering", "prompt": "Order the method.", "items": ["read T", "calculate f", "calculate v"], "answer": ["read T", "calculate f", "calculate v"]},
    {"id": "q7", "type": "fill_in_blank", "prompt": "Complete: v = lambda x __.", "answer": "f"},
    {"id": "q8", "type": "drag_and_drop", "prompt": "Classify quantities.", "items": [{"id": "period", "label": "T"}, {"id": "lambda", "label": "lambda"}], "zones": ["time", "space"], "answer": {"period": "time", "lambda": "space"}},
    {"id": "q9", "type": "interactive_checkpoint", "prompt": "Type done after testing the simulator.", "answer": "done"},
]

MATH_QUESTIONS = [
    {"id": "q1", "type": "multiple_choice", "prompt": "A function is continuous at a when:", "options": ["lim f(x)=f(a)", "f(a)=0", "lim f(x)=0", "f is increasing"], "answer": "lim f(x)=f(a)"},
    {"id": "q2", "type": "true_false", "prompt": "A removable discontinuity can be fixed by redefining the value at one point.", "options": ["true", "false"], "answer": "true"},
    {"id": "q3", "type": "short_answer", "prompt": "Name the theorem used to prove a root exists on an interval.", "answer": "intermediate value theorem"},
    {"id": "q4", "type": "multi_select", "prompt": "Select checks before applying continuity.", "options": ["domain", "left limit", "favorite color", "function value"], "answer": ["domain", "left limit", "function value"]},
    {"id": "q5", "type": "matching", "prompt": "Match object to role.", "answer": {"domain": "where f is defined", "limit": "near a", "image": "output set"}},
    {"id": "q6", "type": "ordering", "prompt": "Order the proof.", "items": ["state theorem", "verify conditions", "conclude"], "answer": ["state theorem", "verify conditions", "conclude"]},
    {"id": "q7", "type": "fill_in_blank", "prompt": "A continuous graph has no vertical ____.", "answer": "jump"},
    {"id": "q8", "type": "drag_and_drop", "prompt": "Classify terms.", "items": [{"id": "x", "label": "x"}, {"id": "f(x)", "label": "f(x)"}], "zones": ["input", "output"], "answer": {"x": "input", "f(x)": "output"}},
    {"id": "q9", "type": "interactive_checkpoint", "prompt": "Type done after moving the graph control.", "answer": "done"},
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


async def get_or_create_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == "student@kresco.local"))
    user = result.scalar_one_or_none()
    if user:
        return user
    now = datetime.now(timezone.utc)
    user = User(
        email="student@kresco.local",
        full_name="Kresco Student",
        password=hash_password("kresco123"),
        is_email_verified=True,
        is_active=True,
        is_pro=True,
        niveau="2bac",
        filiere="Bac Sciences Physiques",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    await db.flush()
    db.add(UserXP(user_id=user.id, total_xp=0, streak_days=0, last_active_date=date.today(), updated_at=now))
    return user


async def seed_topic(db: AsyncSession, subject: Subject, title: str, description: str, concepts: list[str], is_physics: bool) -> Topic:
    slug = f"{slugify(subject.title)}-{slugify(title)}"
    existing = (await db.execute(select(Topic).where(Topic.slug == slug))).scalar_one_or_none()
    if existing:
        return existing

    topic = Topic(subject_id=subject.id, slug=slug, title=title, description=description, is_free_preview=True, order=subject.order)
    db.add(topic)
    await db.flush()

    tag_rows = []
    for concept in concepts:
        tag_slug = slugify(concept)
        tag = (await db.execute(select(ConceptTag).where(ConceptTag.slug == tag_slug))).scalar_one_or_none()
        if tag is None:
            tag = ConceptTag(slug=tag_slug, label=concept)
            db.add(tag)
        tag_rows.append(tag_slug)

    resources = {
        "intro_video": Resource(
            topic_id=topic.id,
            title=f"{title} - introduction video",
            resource_type="video",
            provider="mock_vdocipher",
            provider_resource_id=f"mock-{slug}-intro",
            summary="Placeholder video resource for local validation.",
            is_free_preview=True,
        ),
        "summary": Resource(
            topic_id=topic.id,
            title=f"{title} summary sheet",
            resource_type="summary",
            url=f"/mock-resources/{slug}-summary.pdf",
            summary="Downloadable local placeholder summary.",
            is_free_preview=True,
        ),
        "worksheet": Resource(
            topic_id=topic.id,
            title=f"{title} worksheet",
            resource_type="worksheet",
            url=f"/mock-resources/{slug}-worksheet.pdf",
            summary="Practice worksheet placeholder.",
        ),
        "exam_video": Resource(
            topic_id=topic.id,
            title=f"{title} Bac correction video",
            resource_type="video",
            provider="mock_vdocipher",
            provider_resource_id=f"mock-{slug}-bac",
            summary="Placeholder exam correction video.",
        ),
    }
    db.add_all(resources.values())
    await db.flush()

    lessons = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
    exercises = TopicSection(topic_id=topic.id, title="Exercises", section_type="exercises", order=2)
    bac = TopicSection(topic_id=topic.id, title="Bac Examples", section_type="bac_examples", order=3)
    db.add_all([lessons, exercises, bac])
    await db.flush()

    questions = PHYSICS_QUESTIONS if is_physics else MATH_QUESTIONS
    renderer_key = "wave_simulator" if is_physics else "continuity_graph_lab"
    intro = TopicItem(
        topic_id=topic.id,
        section_id=lessons.id,
        primary_resource_id=resources["intro_video"].id,
        title="Introduction and core vocabulary",
        description="Start here, then use the tabs to practice the concept.",
        item_type="lesson_video",
        duration_seconds=720,
        order=1,
        completion_policy="watched_80",
        is_free_preview=True,
        concept_slugs=tag_rows,
    )
    checkpoint = TopicItem(
        topic_id=topic.id,
        section_id=lessons.id,
        title="Checkpoint quiz",
        description="Quick diagnosis before moving to exercises.",
        item_type="checkpoint_quiz",
        order=2,
        completion_policy="quiz_submitted",
        concept_slugs=tag_rows[:2],
    )
    exercise = TopicItem(
        topic_id=topic.id,
        section_id=exercises.id,
        primary_resource_id=resources["intro_video"].id,
        title="Guided application exercise",
        description="A solved exercise with reusable method notes.",
        item_type="exercise_solution_video",
        duration_seconds=640,
        order=1,
        completion_policy="watched_80",
        concept_slugs=tag_rows,
    )
    bac_item = TopicItem(
        topic_id=topic.id,
        section_id=bac.id,
        primary_resource_id=resources["exam_video"].id,
        title="National Bac problem",
        description="Topic-relevant Bac example with written and video correction.",
        item_type="bac_example",
        duration_seconds=900,
        order=1,
        completion_policy="manual",
        concept_slugs=tag_rows,
    )
    db.add_all([intro, checkpoint, exercise, bac_item])
    await db.flush()

    animated_course = animated_course_for_title(title)
    lab_label = "Animated Course" if animated_course else "Lab"
    lab_type = "interactive" if animated_course else "lab"
    lab_config = animated_course[1] if animated_course else {}
    lab_renderer = animated_course[0] if animated_course else renderer_key
    lab_content = lab_config.get("summary", "Interactive component registered locally by key.")
    intro_course_tab = TabContent(topic_item_id=intro.id, label="Course", tab_type="course", order=1, content=f"## {title}\n\nKey Bac definitions, formulas, and method steps for this lesson.", concept_slugs=tag_rows)
    checkpoint_quiz_tab = TabContent(topic_item_id=checkpoint.id, label="Quiz", tab_type="quiz", order=1, config_json={"pass_score": 70, "questions": questions}, concept_slugs=tag_rows)
    exercise_statement_tab = TabContent(topic_item_id=exercise.id, label="Statement", tab_type="course", order=1, content="Solve the exercise before watching the correction.")
    bac_problem_tab = TabContent(topic_item_id=bac_item.id, label="Problem", tab_type="exam_problem", order=1, content="Bac statement preview and expected reasoning.")
    db.add_all([
        intro_course_tab,
        TabContent(topic_item_id=intro.id, label=lab_label, tab_type=lab_type, order=2, renderer_key=lab_renderer, config_json=lab_config, content=lab_content, concept_slugs=tag_rows[:2]),
        TabContent(topic_item_id=intro.id, label="Quiz", tab_type="quiz", order=3, config_json={"pass_score": 70, "questions": questions}, concept_slugs=tag_rows),
        TabContent(topic_item_id=intro.id, resource_id=resources["summary"].id, label="Summary", tab_type="summary", order=4, content="Open the summary sheet and mark it reviewed.", concept_slugs=tag_rows),
        TabContent(topic_item_id=intro.id, resource_id=resources["worksheet"].id, label="Resources", tab_type="resources", order=5, content="Worksheet and extra practice resources.", concept_slugs=tag_rows),
        TabContent(topic_item_id=intro.id, label="Notes", tab_type="notes", order=6, content="Personal notes are stored per topic item."),
        TabContent(topic_item_id=intro.id, label="Discussion", tab_type="comments", order=7),
        checkpoint_quiz_tab,
        TabContent(topic_item_id=checkpoint.id, label="Notes", tab_type="notes", order=2),
        TabContent(topic_item_id=checkpoint.id, label="Discussion", tab_type="comments", order=3),
        exercise_statement_tab,
        TabContent(topic_item_id=exercise.id, label="Quiz", tab_type="quiz", order=2, config_json={"pass_score": 70, "questions": questions[:2]}, concept_slugs=tag_rows),
        TabContent(topic_item_id=exercise.id, label="Notes", tab_type="notes", order=3),
        bac_problem_tab,
        TabContent(topic_item_id=bac_item.id, label="Correction", tab_type="course", order=2, content="Written correction scaffold for local validation."),
        TabContent(topic_item_id=bac_item.id, label="Notes", tab_type="notes", order=3),
    ])
    await db.flush()
    intro.primary_tab_content_id = intro_course_tab.id
    checkpoint.primary_tab_content_id = checkpoint_quiz_tab.id
    exercise.primary_tab_content_id = exercise_statement_tab.id
    bac_item.primary_tab_content_id = bac_problem_tab.id

    exam = Exam(subject_id=subject.id, title=f"National Bac {2024 if is_physics else 2023} - {subject.title}", year=2024 if is_physics else 2023, session="Normal")
    db.add(exam)
    await db.flush()
    db.add(ExamProblem(
        exam_id=exam.id,
        topic_id=topic.id,
        video_resource_id=resources["exam_video"].id,
        title=f"{title} problem",
        statement=f"Analyze a Bac-style situation involving {', '.join(concepts[:2])}.",
        written_solution="Step 1: identify known quantities. Step 2: apply the core relation. Step 3: conclude with units.",
        order=1,
        concept_slugs=tag_rows,
    ))
    return topic


async def ensure_animated_course_tab(db: AsyncSession, topic: Topic) -> None:
    animated_course = animated_course_for_title(topic.title)
    if animated_course is None:
        return

    renderer_key, config_json = animated_course
    intro = (
        await db.execute(
            select(TopicItem)
            .where(TopicItem.topic_id == topic.id, TopicItem.item_type == "lesson_video")
            .order_by(TopicItem.order)
        )
    ).scalars().first()
    if intro is None:
        return

    tabs = (
        await db.execute(
            select(TabContent)
            .where(TabContent.topic_item_id == intro.id)
            .order_by(TabContent.order)
        )
    ).scalars().all()
    target = next(
        (
            tab
            for tab in tabs
            if tab.renderer_key == renderer_key
            or tab.label == "Animated Course"
            or (tab.order == 2 and tab.tab_type in {"lab", "interactive"})
        ),
        None,
    )
    if target is None:
        target = TabContent(
            topic_item_id=intro.id,
            label="Animated Course",
            tab_type="interactive",
            content=config_json["summary"],
            config_json=config_json,
            renderer_key=renderer_key,
            order=2,
            status="published",
            concept_slugs=intro.concept_slugs,
        )
        db.add(target)

    target.label = "Animated Course"
    target.tab_type = "interactive"
    target.content = config_json["summary"]
    target.config_json = config_json
    target.renderer_key = renderer_key
    target.status = "published"
    target.concept_slugs = intro.concept_slugs
    await db.flush()
    intro.primary_tab_content_id = target.id


async def seed_all(db: AsyncSession, *, destructive_confirmed: bool = False) -> None:
    require_destructive_seed_session(
        db,
        "seed_kresco_v1.seed_all",
        confirmed=destructive_confirmed,
    )
    await get_or_create_user(db)
    await db.execute(update(Subject).values(is_published=False))
    subjects = [
        ("Math", "Bac mathematics with guided lessons, quizzes, and exam examples.", 1),
        ("Physics", "Bac physics focused on exam mastery.", 2),
        ("Philosophy", "Philosophy concepts, text analysis, and guided writing.", 3),
        ("Biology", "Biology concepts, diagrams, and exam reasoning.", 4),
        ("English", "English grammar, writing, and communication practice.", 5),
    ]
    subject_rows = {}
    for title, description, order in subjects:
        subject = (await db.execute(select(Subject).where(Subject.title == title))).scalar_one_or_none()
        if subject is None:
            subject = Subject(title=title, description=description, thumbnail_url="", is_published=True, order=order)
            db.add(subject)
            await db.flush()
        subject_rows[title] = subject

    physics_topic = await seed_topic(
        db,
        subject_rows["Physics"],
        "Ondes mecaniques periodiques",
        "A video-first Bac workspace for period, frequency, wavelength, and wave speed.",
        ["periodicite", "frequence", "periode", "longueur onde", "relation v lambda f", "bac"],
        True,
    )
    nuclear_topic = await seed_topic(
        db,
        subject_rows["Physics"],
        "Transformations nucleaires",
        "A Bac workspace for nuclear notation, isotope reasoning, activity, and half-life.",
        ["noyau", "proton", "neutron", "isotope", "nombre de masse", "radioactivite", "bac"],
        True,
    )
    math_topic = await seed_topic(
        db,
        subject_rows["Math"],
        "Limites et continuite",
        "A Bac workspace for continuity, limits, extension by continuity, and interval images.",
        ["continuite", "limite", "prolongement", "valeurs intermediaires", "fonction definie par morceaux", "bac"],
        False,
    )
    philosophy_topic = await seed_topic(
        db,
        subject_rows["Philosophy"],
        "Conscience et liberte",
        "A Bac workspace for core concepts, argument structure, and text analysis.",
        ["conscience", "liberte", "argumentation", "texte", "bac"],
        False,
    )
    biology_topic = await seed_topic(
        db,
        subject_rows["Biology"],
        "Genetique humaine",
        "A Bac workspace for inheritance, pedigrees, and probability reasoning.",
        ["gene", "allele", "pedigree", "probabilite", "bac"],
        False,
    )
    english_topic = await seed_topic(
        db,
        subject_rows["English"],
        "Writing Skills",
        "A Bac workspace for essay structure, grammar, and argument flow.",
        ["essay", "grammar", "writing", "argument", "bac"],
        False,
    )
    await ensure_animated_course_tab(db, physics_topic)
    await ensure_animated_course_tab(db, nuclear_topic)
    await seed_calendar_events(db, [math_topic, physics_topic, philosophy_topic, biology_topic, english_topic])
    await db.commit()


async def seed_calendar_events(db: AsyncSession, topics: list[Topic]) -> None:
    await db.execute(delete(CalendarEvent))
    topic_by_subject = {topic.subject_id: topic for topic in topics}
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
        return datetime.combine(monday + timedelta(days=day_offset), time(hour, minute), tzinfo=timezone.utc)

    subjects_by_title = {
        subject.title: subject
        for subject in (await db.execute(select(Subject).where(Subject.title.in_(["Math", "Physics", "Philosophy", "Biology", "English"])))).scalars().all()
    }
    math = subjects_by_title.get("Math")
    physics = subjects_by_title.get("Physics")
    philosophy = subjects_by_title.get("Philosophy")
    biology = subjects_by_title.get("Biology")
    english = subjects_by_title.get("English")

    rows = [
        CalendarEvent(
            event_type="live_session",
            title="Live: Mathematics - Limits and Continuity",
            subtitle="Mathematics",
            teacher_name="Pr Ahmed Kamil",
            subject_id=math.id if math else None,
            topic_id=topic_by_subject.get(math.id).id if math and topic_by_subject.get(math.id) else None,
            starts_at=at(0, 4),
            ends_at=at(0, 5, 30),
            description="Prepare continuity definitions and bring two questions from the checkpoint quiz.",
            preparation_href=f"/topics/{topic_by_subject.get(math.id).id}" if math and topic_by_subject.get(math.id) else "/courses",
        ),
        CalendarEvent(
            event_type="study_block",
            title="Study Block: Physics wave speed",
            subtitle="Physics",
            teacher_name="Personal study",
            subject_id=physics.id if physics else None,
            topic_id=topic_by_subject.get(physics.id).id if physics and topic_by_subject.get(physics.id) else None,
            starts_at=at(1, 10, 30),
            ends_at=at(1, 12, 30),
            description="Review period, frequency, wavelength, and the relation v = lambda f.",
            preparation_href=f"/topics/{topic_by_subject.get(physics.id).id}" if physics and topic_by_subject.get(physics.id) else "/courses",
            color="#29aee4",
        ),
        CalendarEvent(
            event_type="live_session",
            title="Live: Physics - Mechanical Waves",
            subtitle="Physics",
            teacher_name="Pr Salma Rami",
            subject_id=physics.id if physics else None,
            topic_id=topic_by_subject.get(physics.id).id if physics and topic_by_subject.get(physics.id) else None,
            starts_at=at(2, 3),
            ends_at=at(2, 6, 30),
            description="A Bac-focused live correction on periodic mechanical waves.",
            preparation_href=f"/topics/{topic_by_subject.get(physics.id).id}" if physics and topic_by_subject.get(physics.id) else "/courses",
        ),
        CalendarEvent(
            event_type="study_block",
            title="Study Block: Philosophy outline",
            subtitle="Philosophy",
            teacher_name="Personal study",
            subject_id=philosophy.id if philosophy else None,
            topic_id=topic_by_subject.get(philosophy.id).id if philosophy and topic_by_subject.get(philosophy.id) else None,
            starts_at=at(3, 14),
            ends_at=at(3, 15),
            description="Draft a clean argument outline for conscience and freedom.",
            preparation_href=f"/topics/{topic_by_subject.get(philosophy.id).id}" if philosophy and topic_by_subject.get(philosophy.id) else "/courses",
            color="#f5900b",
        ),
        CalendarEvent(
            event_type="live_session",
            title="Live: Biology - Genetic reasoning",
            subtitle="Biology",
            teacher_name="Pr Nadia Idrissi",
            subject_id=biology.id if biology else None,
            topic_id=topic_by_subject.get(biology.id).id if biology and topic_by_subject.get(biology.id) else None,
            starts_at=at(4, 16),
            ends_at=at(4, 17, 30),
            description="Pedigree analysis and probability reasoning for Bac-style problems.",
            preparation_href=f"/topics/{topic_by_subject.get(biology.id).id}" if biology and topic_by_subject.get(biology.id) else "/courses",
        ),
        CalendarEvent(
            event_type="study_block",
            title="Study Block: English essay practice",
            subtitle="English",
            teacher_name="Personal study",
            subject_id=english.id if english else None,
            topic_id=topic_by_subject.get(english.id).id if english and topic_by_subject.get(english.id) else None,
            starts_at=at(5, 9),
            ends_at=at(5, 10),
            description="Write one short essay introduction and compare it with the method notes.",
            preparation_href=f"/topics/{topic_by_subject.get(english.id).id}" if english and topic_by_subject.get(english.id) else "/courses",
            color="#16a34a",
        ),
    ]
    db.add_all(rows)


async def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./db.sqlite3")
    require_destructive_seed_database_url(database_url, "seed_kresco_v1.py")
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with session_factory() as db:
        await seed_all(db, destructive_confirmed=True)
    await engine.dispose()
    print("Kresco v1 local seed complete.")
    print("Login: student@kresco.local / kresco123")


if __name__ == "__main__":
    asyncio.run(main())
