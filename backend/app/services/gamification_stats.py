from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import UserStats


async def get_or_create_user_stats(db: AsyncSession, *, user_id: int) -> UserStats:
    stats = await db.scalar(select(UserStats).where(UserStats.user_id == user_id).with_for_update())
    if stats is not None:
        return stats

    stats = UserStats(user_id=user_id)
    try:
        async with db.begin_nested():
            db.add(stats)
            await db.flush()
    except IntegrityError:
        stats = await db.scalar(select(UserStats).where(UserStats.user_id == user_id).with_for_update())
        if stats is None:
            raise
    return stats


async def read_user_stats(db: AsyncSession, *, user_id: int) -> UserStats | None:
    return await db.scalar(select(UserStats).where(UserStats.user_id == user_id))


async def apply_lesson_progress_stats_delta(
    db: AsyncSession,
    *,
    user_id: int,
    watched_seconds_delta: int = 0,
    lessons_completed_delta: int = 0,
) -> None:
    watched_seconds_delta = max(0, watched_seconds_delta)
    lessons_completed_delta = max(0, lessons_completed_delta)
    if watched_seconds_delta == 0 and lessons_completed_delta == 0:
        return

    stats = await get_or_create_user_stats(db, user_id=user_id)
    stats.total_watch_seconds = int(stats.total_watch_seconds or 0) + watched_seconds_delta
    stats.lessons_completed = int(stats.lessons_completed or 0) + lessons_completed_delta


async def apply_quiz_pass_stats_delta(
    db: AsyncSession,
    *,
    user_id: int,
    quizzes_passed_delta: int = 0,
) -> None:
    quizzes_passed_delta = max(0, quizzes_passed_delta)
    if quizzes_passed_delta == 0:
        return

    stats = await get_or_create_user_stats(db, user_id=user_id)
    stats.quizzes_passed = int(stats.quizzes_passed or 0) + quizzes_passed_delta
