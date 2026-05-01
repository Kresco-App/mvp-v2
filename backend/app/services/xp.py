import math
from datetime import date
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import DailyQuest, UserXP, XPTransaction

XP_REWARDS: dict[str, int] = {
    "video_complete": 10,
    "quiz_correct": 5,
    "lab_complete": 50,
    "exam_complete": 100,
    "quiz_pass": 20,
    "quiz_perfect": 15,
    "daily_login": 10,
    "streak_bonus": 25,
    "lesson_complete": 10,
}

QUEST_PROGRESS_BY_REASON: dict[str, str] = {
    "video_complete": "complete_lesson",
    "lesson_complete": "complete_lesson",
    "quiz_pass": "pass_quiz",
}

DAILY_QUEST_TEMPLATES = [
    {"quest_type": "complete_lesson", "title": "Completer 1 leçon", "target": 1, "xp_reward": 25},
    {"quest_type": "pass_quiz", "title": "Réussir 1 quiz", "target": 1, "xp_reward": 50},
    {"quest_type": "earn_xp", "title": "Gagner 100 XP aujourd'hui", "target": 100, "xp_reward": 25},
]


def calculate_level(total_xp: int) -> dict:
    level = int(math.sqrt(total_xp / 50)) + 1
    xp_for_current = (level - 1) ** 2 * 50
    xp_for_next = level ** 2 * 50
    span = xp_for_next - xp_for_current
    progress = total_xp - xp_for_current
    xp_progress_pct = round((progress / span) * 100, 1) if span > 0 else 100.0
    return {
        "level": level,
        "xp_for_current_level": xp_for_current,
        "xp_for_next_level": xp_for_next,
        "xp_progress_pct": xp_progress_pct,
    }


async def award_xp(user_id: int, reason: str, description: str, db: AsyncSession) -> int:
    amount = XP_REWARDS.get(reason, 0)
    if amount == 0:
        return 0

    result = await db.execute(select(UserXP).where(UserXP.user_id == user_id))
    xp_record = result.scalar_one_or_none()

    if xp_record is None:
        xp_record = UserXP(user_id=user_id, total_xp=amount)
        db.add(xp_record)
    else:
        xp_record.total_xp += amount

    transaction = XPTransaction(user_id=user_id, amount=amount, reason=reason, description=description)
    db.add(transaction)

    # Update earn_xp daily quest progress
    await db.execute(
        update(DailyQuest)
        .where(
            DailyQuest.user_id == user_id,
            DailyQuest.quest_type == "earn_xp",
            DailyQuest.date == date.today(),
            DailyQuest.completed == False,  # noqa: E712
        )
        .values(progress=DailyQuest.progress + amount)
    )
    quest_type = QUEST_PROGRESS_BY_REASON.get(reason)
    if quest_type:
        await db.execute(
            update(DailyQuest)
            .where(
                DailyQuest.user_id == user_id,
                DailyQuest.quest_type == quest_type,
                DailyQuest.date == date.today(),
                DailyQuest.completed == False,  # noqa: E712
            )
            .values(progress=DailyQuest.progress + 1)
        )
    await db.flush()
    return amount


async def generate_daily_quests(user_id: int, db: AsyncSession) -> list[DailyQuest]:
    today = date.today()
    result = await db.execute(
        select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == today)
    )
    existing = result.scalars().all()
    if existing:
        return existing

    quests = [DailyQuest(user_id=user_id, date=today, **t) for t in DAILY_QUEST_TEMPLATES]
    db.add_all(quests)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        result = await db.execute(
            select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == today)
        )
        return result.scalars().all()
    return quests
