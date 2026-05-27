import math
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import DailyQuest, UserXP, XPTransaction

XP_REWARDS: dict[str, int] = {
    "video_complete": 10,
    "quiz_correct": 5,
    "quiz_retry_correct": 3,
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


@dataclass(frozen=True)
class XPAward:
    reason: str
    description: str
    subject_id: Optional[int] = None
    topic_id: Optional[int] = None
    topic_section_id: Optional[int] = None
    topic_item_id: Optional[int] = None
    question_set_id: Optional[int] = None
    question_id: Optional[int] = None
    quiz_attempt_id: Optional[int] = None
    question_attempt_id: Optional[int] = None
    idempotency_key: Optional[str] = None
    amount_override: Optional[int] = None


def _current_utc_date() -> date:
    return datetime.now(timezone.utc).date()


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


async def has_xp_award(user_id: int, reason: str, description: str, db: AsyncSession) -> bool:
    result = await db.execute(
        select(XPTransaction.id)
        .where(
            XPTransaction.user_id == user_id,
            XPTransaction.reason == reason,
            XPTransaction.description == description,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def has_xp_idempotency_key(user_id: int, idempotency_key: str, db: AsyncSession) -> bool:
    result = await db.execute(
        select(XPTransaction.id)
        .where(
            XPTransaction.user_id == user_id,
            XPTransaction.idempotency_key == idempotency_key,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def award_xp(
    user_id: int,
    reason: str,
    description: str,
    db: AsyncSession,
    *,
    dedupe: bool = False,
    subject_id: Optional[int] = None,
    topic_id: Optional[int] = None,
    topic_section_id: Optional[int] = None,
    topic_item_id: Optional[int] = None,
    question_set_id: Optional[int] = None,
    question_id: Optional[int] = None,
    quiz_attempt_id: Optional[int] = None,
    question_attempt_id: Optional[int] = None,
    idempotency_key: Optional[str] = None,
    active_date: Optional[date] = None,
    amount_override: Optional[int] = None,
    update_daily_quests: bool = True,
) -> int:
    amount = amount_override if amount_override is not None else XP_REWARDS.get(reason, 0)
    if amount == 0:
        return 0
    if dedupe and await has_xp_award(user_id, reason, description, db):
        return 0
    if idempotency_key and await has_xp_idempotency_key(user_id, idempotency_key, db):
        return 0

    transaction = XPTransaction(
        user_id=user_id,
        amount=amount,
        reason=reason,
        description=description,
        subject_id=subject_id,
        topic_id=topic_id,
        topic_section_id=topic_section_id,
        topic_item_id=topic_item_id,
        question_set_id=question_set_id,
        question_id=question_id,
        quiz_attempt_id=quiz_attempt_id,
        question_attempt_id=question_attempt_id,
        idempotency_key=idempotency_key,
    )

    if idempotency_key:
        try:
            async with db.begin_nested():
                db.add(transaction)
                await db.flush()
        except IntegrityError:
            return 0
    else:
        db.add(transaction)
        await db.flush()

    result = await db.execute(select(UserXP).where(UserXP.user_id == user_id))
    xp_record = result.scalar_one_or_none()

    if xp_record is None:
        xp_record = UserXP(user_id=user_id, total_xp=amount)
        db.add(xp_record)
    else:
        # Atomic SQL increment to prevent race conditions when
        # concurrent XP awards read the same stale total_xp value.
        await db.execute(
            update(UserXP)
            .where(UserXP.user_id == user_id)
            .values(total_xp=UserXP.total_xp + amount)
        )
        await db.refresh(xp_record)

    if not update_daily_quests:
        await db.flush()
        return amount

    quest_date = active_date or _current_utc_date()

    # Update earn_xp daily quest progress
    await db.execute(
        update(DailyQuest)
        .where(
            DailyQuest.user_id == user_id,
            DailyQuest.quest_type == "earn_xp",
            DailyQuest.date == quest_date,
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
                DailyQuest.date == quest_date,
                DailyQuest.completed == False,  # noqa: E712
            )
            .values(progress=DailyQuest.progress + 1)
        )
    await db.flush()
    return amount


async def award_xp_bulk(
    user_id: int,
    awards: list[XPAward],
    db: AsyncSession,
    *,
    active_date: Optional[date] = None,
    update_daily_quests: bool = True,
) -> int:
    rows: list[dict] = []
    for award in awards:
        amount = award.amount_override if award.amount_override is not None else XP_REWARDS.get(award.reason, 0)
        if amount == 0:
            continue
        rows.append({
            "user_id": user_id,
            "amount": amount,
            "reason": award.reason,
            "description": award.description,
            "subject_id": award.subject_id,
            "topic_id": award.topic_id,
            "topic_section_id": award.topic_section_id,
            "topic_item_id": award.topic_item_id,
            "question_set_id": award.question_set_id,
            "question_id": award.question_id,
            "quiz_attempt_id": award.quiz_attempt_id,
            "question_attempt_id": award.question_attempt_id,
            "idempotency_key": award.idempotency_key,
        })
    if not rows:
        return 0

    inserted = await _insert_xp_transaction_rows(db, rows)
    total_amount = sum(row["amount"] for row in inserted)
    if total_amount == 0:
        return 0

    await _apply_xp_totals_and_quests(
        user_id,
        inserted,
        db,
        total_amount=total_amount,
        active_date=active_date,
        update_daily_quests=update_daily_quests,
    )
    return total_amount


async def _insert_xp_transaction_rows(db: AsyncSession, rows: list[dict]) -> list[dict]:
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is None:
        return await _insert_xp_transaction_rows_fallback(db, rows)

    stmt = (
        insert_factory(XPTransaction)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
        .returning(XPTransaction.amount, XPTransaction.reason)
    )
    result = await db.execute(stmt)
    return [
        {"amount": int(amount), "reason": str(reason)}
        for amount, reason in result.all()
    ]


async def _insert_xp_transaction_rows_fallback(db: AsyncSession, rows: list[dict]) -> list[dict]:
    inserted: list[dict] = []
    for row in rows:
        try:
            async with db.begin_nested():
                db.add(XPTransaction(**row))
                await db.flush()
        except IntegrityError:
            continue
        inserted.append({"amount": int(row["amount"]), "reason": str(row["reason"])})
    return inserted


async def _apply_xp_totals_and_quests(
    user_id: int,
    inserted: list[dict],
    db: AsyncSession,
    *,
    total_amount: int,
    active_date: Optional[date],
    update_daily_quests: bool,
) -> None:
    result = await db.execute(select(UserXP).where(UserXP.user_id == user_id))
    xp_record = result.scalar_one_or_none()
    if xp_record is None:
        db.add(UserXP(user_id=user_id, total_xp=total_amount))
    else:
        await db.execute(
            update(UserXP)
            .where(UserXP.user_id == user_id)
            .values(total_xp=UserXP.total_xp + total_amount)
        )
        await db.refresh(xp_record)

    if not update_daily_quests:
        await db.flush()
        return

    quest_date = active_date or _current_utc_date()
    await db.execute(
        update(DailyQuest)
        .where(
            DailyQuest.user_id == user_id,
            DailyQuest.quest_type == "earn_xp",
            DailyQuest.date == quest_date,
            DailyQuest.completed == False,  # noqa: E712
        )
        .values(progress=DailyQuest.progress + total_amount)
    )
    quest_progress = Counter(
        QUEST_PROGRESS_BY_REASON[reason]
        for reason in (row["reason"] for row in inserted)
        if reason in QUEST_PROGRESS_BY_REASON
    )
    for quest_type, count in quest_progress.items():
        await db.execute(
            update(DailyQuest)
            .where(
                DailyQuest.user_id == user_id,
                DailyQuest.quest_type == quest_type,
                DailyQuest.date == quest_date,
                DailyQuest.completed == False,  # noqa: E712
            )
            .values(progress=DailyQuest.progress + count)
        )
    await db.flush()


async def generate_daily_quests(user_id: int, db: AsyncSession, *, quest_date: Optional[date] = None) -> list[DailyQuest]:
    today = quest_date or _current_utc_date()
    result = await db.execute(
        select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == today)
    )
    existing = result.scalars().all()
    if existing:
        return existing

    quests = [DailyQuest(user_id=user_id, date=today, **t) for t in DAILY_QUEST_TEMPLATES]
    db.add_all(quests)
    await db.flush()
    return quests
