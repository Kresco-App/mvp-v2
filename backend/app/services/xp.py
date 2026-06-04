import math
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import case, func, select, update
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


def _normalize_idempotency_key(idempotency_key: Optional[str]) -> str:
    normalized = str(idempotency_key or "").strip()
    if not normalized:
        raise ValueError("XP awards require a non-empty idempotency key")
    return normalized


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
    idempotency_key = _normalize_idempotency_key(idempotency_key)
    if dedupe and await has_xp_award(user_id, reason, description, db):
        return 0
    if await has_xp_idempotency_key(user_id, idempotency_key, db):
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

    try:
        async with db.begin_nested():
            db.add(transaction)
            await db.flush()
    except IntegrityError:
        return 0

    await _increment_user_xp_total(db, user_id, amount)

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
        idempotency_key = _normalize_idempotency_key(award.idempotency_key)
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
            "idempotency_key": idempotency_key,
        })
    if not rows:
        return 0
    rows = _dedupe_xp_transaction_rows(rows)
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
        .on_conflict_do_nothing(index_elements=["user_id", "idempotency_key"])
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


def _dedupe_xp_transaction_rows(rows: list[dict]) -> list[dict]:
    seen_keys: set[tuple[int, str]] = set()
    deduped: list[dict] = []
    for row in rows:
        key = (int(row["user_id"]), str(row["idempotency_key"]))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(row)
    return deduped


async def _increment_user_xp_total(db: AsyncSession, user_id: int, amount: int) -> None:
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is not None:
        stmt = (
            insert_factory(UserXP)
            .values(user_id=user_id, total_xp=amount, streak_days=0)
            .on_conflict_do_update(
                index_elements=["user_id"],
                set_={
                    "total_xp": UserXP.total_xp + amount,
                    "updated_at": func.now(),
                },
            )
        )
        await db.execute(stmt)
        return

    try:
        async with db.begin_nested():
            db.add(UserXP(user_id=user_id, total_xp=amount, streak_days=0))
            await db.flush()
    except IntegrityError:
        await db.execute(
            update(UserXP)
            .where(UserXP.user_id == user_id)
            .values(total_xp=UserXP.total_xp + amount, updated_at=func.now())
        )


async def _apply_xp_totals_and_quests(
    user_id: int,
    inserted: list[dict],
    db: AsyncSession,
    *,
    total_amount: int,
    active_date: Optional[date],
    update_daily_quests: bool,
) -> None:
    await _increment_user_xp_total(db, user_id, total_amount)

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
    if quest_progress:
        await db.execute(
            update(DailyQuest)
            .where(
                DailyQuest.user_id == user_id,
                DailyQuest.quest_type.in_(list(quest_progress)),
                DailyQuest.date == quest_date,
                DailyQuest.completed == False,  # noqa: E712
            )
            .values(
                progress=case(
                    *[
                        (
                            DailyQuest.quest_type == quest_type,
                            DailyQuest.progress + count,
                        )
                        for quest_type, count in quest_progress.items()
                    ],
                    else_=DailyQuest.progress,
                )
            )
        )
    await db.flush()


async def generate_daily_quests_with_status(
    user_id: int,
    db: AsyncSession,
    *,
    quest_date: Optional[date] = None,
) -> tuple[list[DailyQuest], bool]:
    today = quest_date or _current_utc_date()
    result = await db.execute(
        select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == today)
    )
    existing = result.scalars().all()
    existing_types = {quest.quest_type for quest in existing}
    missing_templates = [
        template for template in DAILY_QUEST_TEMPLATES if template["quest_type"] not in existing_types
    ]
    if not missing_templates:
        return existing, False

    quests = [DailyQuest(user_id=user_id, date=today, **template) for template in missing_templates]
    try:
        async with db.begin_nested():
            db.add_all(quests)
            await db.flush()
    except IntegrityError:
        result = await db.execute(
            select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == today)
        )
        return result.scalars().all(), False
    return [*existing, *quests], True


async def generate_daily_quests(user_id: int, db: AsyncSession, *, quest_date: Optional[date] = None) -> list[DailyQuest]:
    quests, _created = await generate_daily_quests_with_status(user_id, db, quest_date=quest_date)
    return quests
