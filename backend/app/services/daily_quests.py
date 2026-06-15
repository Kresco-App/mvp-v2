from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import DailyQuest
from app.models.users import User
from app.services.xp import award_xp, generate_daily_quests_with_status


async def ensure_daily_quests_for_user(
    db: AsyncSession,
    *,
    user: User,
    quest_date: date | None = None,
) -> bool:
    _quests, created = await generate_daily_quests_with_status(user.id, db, quest_date=quest_date)
    return created


async def claim_daily_quest_reward(
    db: AsyncSession,
    *,
    user: User,
    quest_id: int,
) -> dict[str, int | bool]:
    quest = await db.scalar(
        select(DailyQuest)
        .where(DailyQuest.id == quest_id, DailyQuest.user_id == user.id)
        .with_for_update()
    )
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    if quest.completed:
        raise HTTPException(status_code=400, detail="Quest already claimed")
    today = datetime.now(timezone.utc).date()
    if quest.date != today:
        raise HTTPException(status_code=410, detail="Quest has expired")
    if quest.progress < quest.target:
        raise HTTPException(status_code=400, detail="Quest not yet completed")

    claim_result = await db.execute(
        update(DailyQuest)
        .where(
            DailyQuest.id == quest_id,
            DailyQuest.user_id == user.id,
            DailyQuest.completed == False,  # noqa: E712
            DailyQuest.date == today,
            DailyQuest.progress >= DailyQuest.target,
        )
        .values(completed=True)
    )
    if claim_result.rowcount != 1:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Quest already claimed")

    xp_awarded = await award_xp(
        user.id,
        "daily_quest",
        quest.title,
        db,
        amount_override=quest.xp_reward,
        idempotency_key=f"daily_quest_claim:user:{user.id}:quest:{quest.id}",
        update_daily_quests=False,
    )
    return {"success": True, "xp_awarded": xp_awarded}
