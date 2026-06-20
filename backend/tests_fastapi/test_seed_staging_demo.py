import asyncio
from types import SimpleNamespace

import app.models  # noqa: F401
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.base import Base
from app.models.courses import Topic
from app.models.exercises import Exercise, ExerciseAsset
from app.models.professor import (
    LiveSession,
    LiveSessionCheckpoint,
    LiveSessionInteraction,
    ProfessorChatConversation,
    ProfessorChatMessage,
)
from app.models.users import User
from scripts import seed_staging_demo as seed_module
from scripts.seed_staging_demo import seed_staging_demo


def test_resolve_seed_database_config_prefers_direct_database_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///direct_kresco_staging.sqlite3")
    monkeypatch.setenv("PGSSLROOTCERT", "system")

    assert seed_module.resolve_seed_database_config() == (
        "sqlite+aiosqlite:///direct_kresco_staging.sqlite3",
        "system",
    )


def test_resolve_seed_database_config_falls_back_to_runtime_settings(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PGSSLROOTCERT", raising=False)
    monkeypatch.setattr(
        seed_module,
        "get_settings",
        lambda: SimpleNamespace(
            database_url="sqlite+aiosqlite:///settings_kresco_staging.sqlite3",
            pgsslrootcert="certifi",
        ),
    )

    assert seed_module.resolve_seed_database_config() == (
        "sqlite+aiosqlite:///settings_kresco_staging.sqlite3",
        "certifi",
    )


def test_staging_demo_seed_creates_idempotent_evidence_fixtures(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'kresco_staging_seed.sqlite3'}"

    async def exercise():
        engine = create_async_engine(database_url, poolclass=NullPool)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

        await seed_staging_demo(database_url, allow_confirmed=True)
        await seed_staging_demo(database_url, allow_confirmed=True)

        engine = create_async_engine(database_url, poolclass=NullPool)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            vip = await db.scalar(select(User).where(User.email == "vip@example.com"))
            topic = await db.scalar(select(Topic).where(Topic.slug == "staging-demo-limits-continuity"))
            exercises = (
                await db.execute(
                    select(Exercise)
                    .where(Exercise.subject_id == topic.subject_id)
                    .order_by(Exercise.order)
                )
            ).scalars().all()
            live_session = await db.scalar(
                select(LiveSession).where(LiveSession.title == "Staging demo live session")
            )
            conversation = await db.scalar(
                select(ProfessorChatConversation).where(
                    ProfessorChatConversation.student_user_id == vip.id,
                    ProfessorChatConversation.course_offering_id == live_session.course_offering_id,
                )
            )
            counts = {
                "live_sessions": await db.scalar(
                    select(func.count()).select_from(LiveSession).where(
                        LiveSession.title == "Staging demo live session"
                    )
                ),
                "checkpoints": await db.scalar(
                    select(func.count()).select_from(LiveSessionCheckpoint).where(
                        LiveSessionCheckpoint.live_session_id == live_session.id,
                        LiveSessionCheckpoint.title == "Staging demo checkpoint",
                    )
                ),
                "interactions": await db.scalar(
                    select(func.count()).select_from(LiveSessionInteraction).where(
                        LiveSessionInteraction.live_session_id == live_session.id,
                        LiveSessionInteraction.body == "Staging demo live question",
                    )
                ),
                "conversations": await db.scalar(
                    select(func.count()).select_from(ProfessorChatConversation).where(
                        ProfessorChatConversation.student_user_id == vip.id,
                        ProfessorChatConversation.course_offering_id == live_session.course_offering_id,
                    )
                ),
                "messages": await db.scalar(
                    select(func.count()).select_from(ProfessorChatMessage).where(
                        ProfessorChatMessage.conversation_id == conversation.id,
                        ProfessorChatMessage.body == "Staging demo professor chat message",
                    )
                ),
                "exercise_assets": await db.scalar(
                    select(func.count()).select_from(ExerciseAsset).where(
                        ExerciseAsset.exercise_id.in_([exercise.id for exercise in exercises])
                    )
                ),
            }
        await engine.dispose()
        return vip, topic, exercises, live_session, conversation, counts

    vip, topic, exercises, live_session, conversation, counts = asyncio.run(exercise())

    assert vip.tier == "vip"
    assert topic.title == "Limits and Continuity"
    assert [exercise.title for exercise in exercises] == [
        "Linear equation warmup",
        "Factorized limit check",
        "Bac-style function variation",
    ]
    assert [exercise.difficulty for exercise in exercises] == ["easy", "medium", "bac"]
    assert exercises[0].is_free_preview is True
    assert exercises[1].concept_slugs == ["limits", "factorization", "removable-discontinuity"]
    assert live_session.status == "live"
    assert live_session.join_url == f"/live/{live_session.id}"
    assert conversation.status == "open"
    assert counts == {
        "live_sessions": 1,
        "checkpoints": 1,
        "interactions": 1,
        "conversations": 1,
        "messages": 1,
        "exercise_assets": 1,
    }
