import math
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import DailyQuest, UserXP, XPDailyCapUsage, XPTransaction

XP_REWARDS: dict[str, int] = {
    "video_complete": 10,
    "quiz_correct": 5,
    "quiz_retry_correct": 3,
    "mistake_corrected": 10,
    "lab_complete": 50,
    "exam_complete": 100,
    "quiz_pass": 20,
    "quiz_perfect": 15,
    "daily_login": 10,
    "streak_bonus": 25,
    "lesson_complete": 10,
}

XP_DAILY_CAPS: dict[str, int] = {
    "quiz_correct": 100,
    "quiz_pass": 80,
    "exercise": 25,
    "lesson_video": 80,
    "lab_exam": 150,
    "daily_quest": 75,
    "other": 100,
}

XP_DAILY_CAP_CATEGORY_BY_REASON: dict[str, str] = {
    "quiz_correct": "quiz_correct",
    "quiz_retry_correct": "quiz_correct",
    "mistake_corrected": "quiz_correct",
    "quiz_pass": "quiz_pass",
    "quiz_perfect": "quiz_pass",
    "exercise_mastered": "exercise",
    "lesson_complete": "lesson_video",
    "video_complete": "lesson_video",
    "lab_complete": "lab_exam",
    "exam_complete": "lab_exam",
    "daily_login": "daily_quest",
    "daily_quest": "daily_quest",
    "streak_bonus": "daily_quest",
}

XP_AMOUNT_OVERRIDE_MAX_BY_REASON: dict[str, int] = {
    "daily_quest": 75,
    "exercise_mastered": 5,
}

QUEST_PROGRESS_BY_REASON: dict[str, str] = {
    "video_complete": "complete_lesson",
    "lesson_complete": "complete_lesson",
    "quiz_pass": "pass_quiz",
    "exercise_mastered": "master_exercise",
    "exam_complete": "complete_exam_problem",
    "mistake_corrected": "correct_mistake",
    "daily_login": "daily_login",
    "streak_bonus": "continue_streak",
}

DAILY_QUEST_TEMPLATES = [
    {"quest_type": "complete_lesson", "title": "Completer 1 leçon", "target": 1, "xp_reward": 25},
    {"quest_type": "pass_quiz", "title": "Réussir 1 quiz", "target": 1, "xp_reward": 50},
    {"quest_type": "earn_xp", "title": "Gagner 100 XP aujourd'hui", "target": 100, "xp_reward": 25},
    {"quest_type": "master_exercise", "title": "Maitriser 1 exercice", "target": 1, "xp_reward": 25},
    {"quest_type": "complete_exam_problem", "title": "Terminer 1 capsule Bac", "target": 1, "xp_reward": 50},
    {"quest_type": "correct_mistake", "title": "Corriger 1 erreur", "target": 1, "xp_reward": 35},
    {"quest_type": "daily_login", "title": "Se connecter aujourd'hui", "target": 1, "xp_reward": 15},
    {"quest_type": "continue_streak", "title": "Continuer sa serie", "target": 1, "xp_reward": 25},
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


def xp_daily_cap_category(reason: str) -> str:
    return XP_DAILY_CAP_CATEGORY_BY_REASON.get(reason, "other")


def xp_daily_cap_limit(category: str) -> int:
    return XP_DAILY_CAPS.get(category, XP_DAILY_CAPS["other"])


async def has_xp_daily_cap_capacity(
    db: AsyncSession,
    *,
    user_id: int,
    reason: str,
    amount_override: Optional[int] = None,
    active_date: Optional[date] = None,
) -> bool:
    requested = _resolve_award_amount(reason, amount_override)
    if requested == 0:
        return False
    cap_date = active_date or _current_utc_date()
    category = xp_daily_cap_category(reason)
    usage_by_category = await _get_or_create_daily_cap_usage_rows(
        db,
        user_id=user_id,
        cap_date=cap_date,
        categories={category},
    )
    usage = usage_by_category[category]
    remaining = max(0, xp_daily_cap_limit(category) - int(usage.amount_awarded or 0))
    return remaining >= requested


def _resolve_award_amount(reason: str, amount_override: Optional[int]) -> int:
    amount = amount_override if amount_override is not None else XP_REWARDS.get(reason, 0)
    if amount < 0:
        raise ValueError("XP awards cannot be negative")
    if amount_override is not None:
        max_override = XP_AMOUNT_OVERRIDE_MAX_BY_REASON.get(reason)
        if max_override is None:
            raise ValueError(f"XP amount override is not allowed for reason {reason}")
        amount = min(amount, max_override)
    return amount


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
    amount = _resolve_award_amount(reason, amount_override)
    if amount == 0:
        return 0
    idempotency_key = _normalize_idempotency_key(idempotency_key)
    if dedupe and await has_xp_award(user_id, reason, description, db):
        return 0
    return await award_xp_bulk(
        user_id,
        [
            XPAward(
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
                amount_override=amount_override,
            )
        ],
        db,
        active_date=active_date,
        update_daily_quests=update_daily_quests,
    )


async def award_xp_bulk(
    user_id: int,
    awards: list[XPAward],
    db: AsyncSession,
    *,
    active_date: Optional[date] = None,
    update_daily_quests: bool = True,
) -> int:
    rows: list[dict] = []
    cap_date = active_date or _current_utc_date()
    for award in awards:
        amount = _resolve_award_amount(award.reason, award.amount_override)
        if amount == 0:
            continue
        idempotency_key = _normalize_idempotency_key(award.idempotency_key)
        category = xp_daily_cap_category(award.reason)
        rows.append({
            "user_id": user_id,
            "amount": 0,
            "requested_amount": amount,
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
            "daily_cap_category": category,
            "daily_cap_date": cap_date,
            "cap_applied": False,
        })
    if not rows:
        return 0
    rows = _dedupe_xp_transaction_rows(rows)
    if not rows:
        return 0
    rows = await _remove_existing_xp_transaction_rows(db, user_id=user_id, rows=rows)
    if not rows:
        return 0
    inserted = await _insert_xp_transaction_rows(db, rows)
    if not inserted:
        return 0
    inserted = await _apply_daily_caps(db, user_id=user_id, rows=inserted, cap_date=cap_date)
    await _update_inserted_xp_transaction_amounts(db, inserted)
    await _record_daily_cap_usage(db, inserted)
    total_amount = sum(row["amount"] for row in inserted)
    if total_amount == 0:
        return 0

    await _apply_xp_totals_and_quests(
        user_id,
        inserted,
        db,
        total_amount=total_amount,
        active_date=cap_date,
        update_daily_quests=update_daily_quests,
    )
    return total_amount


async def award_daily_login_xp(
    db: AsyncSession,
    *,
    user_id: int,
    active_date: Optional[date] = None,
) -> int:
    login_date = active_date or _current_utc_date()
    xp_record = await db.scalar(select(UserXP).where(UserXP.user_id == user_id).with_for_update())
    previous_active_date = xp_record.last_active_date if xp_record is not None else None
    awards = [
        XPAward(
            reason="daily_login",
            description=f"Daily login {login_date.isoformat()}",
            idempotency_key=f"daily_login:user:{user_id}:date:{login_date.isoformat()}",
        )
    ]
    if previous_active_date == login_date - timedelta(days=1):
        awards.append(
            XPAward(
                reason="streak_bonus",
                description=f"Streak continued {login_date.isoformat()}",
                idempotency_key=f"streak_bonus:user:{user_id}:date:{login_date.isoformat()}",
            )
        )
    amount = await award_xp_bulk(user_id, awards, db, active_date=login_date)
    if amount == 0 and previous_active_date != login_date and (
        previous_active_date is None or previous_active_date < login_date
    ):
        await _increment_user_xp_total(db, user_id, 0, active_date=login_date)
    return amount


async def _remove_existing_xp_transaction_rows(
    db: AsyncSession,
    *,
    user_id: int,
    rows: list[dict],
) -> list[dict]:
    keys = [str(row["idempotency_key"]) for row in rows]
    existing = set(
        (
            await db.execute(
                select(XPTransaction.idempotency_key).where(
                    XPTransaction.user_id == user_id,
                    XPTransaction.idempotency_key.in_(keys),
                )
            )
        ).scalars().all()
    )
    if not existing:
        return rows
    return [row for row in rows if row["idempotency_key"] not in existing]


async def _get_or_create_daily_cap_usage_rows(
    db: AsyncSession,
    *,
    user_id: int,
    cap_date: date,
    categories: set[str],
) -> dict[str, XPDailyCapUsage]:
    if not categories:
        return {}
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    rows = [
        {"user_id": user_id, "award_date": cap_date, "category": category, "amount_awarded": 0}
        for category in sorted(categories)
    ]
    if insert_factory is not None:
        await db.execute(
            insert_factory(XPDailyCapUsage)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["user_id", "award_date", "category"])
        )
    else:
        for row in rows:
            try:
                async with db.begin_nested():
                    db.add(XPDailyCapUsage(**row))
                    await db.flush()
            except IntegrityError:
                pass

    result = await db.execute(
        select(XPDailyCapUsage)
        .where(
            XPDailyCapUsage.user_id == user_id,
            XPDailyCapUsage.award_date == cap_date,
            XPDailyCapUsage.category.in_(categories),
        )
        .with_for_update()
    )
    usage_by_category = {row.category: row for row in result.scalars().all()}
    if set(usage_by_category) != categories:
        raise RuntimeError("XP daily cap usage row was not created")
    return usage_by_category


async def _apply_daily_caps(
    db: AsyncSession,
    *,
    user_id: int,
    rows: list[dict],
    cap_date: date,
) -> list[dict]:
    categories = {str(row["daily_cap_category"]) for row in rows}
    usage_by_category = await _get_or_create_daily_cap_usage_rows(
        db,
        user_id=user_id,
        cap_date=cap_date,
        categories=categories,
    )
    remaining_by_category = {
        category: max(0, xp_daily_cap_limit(category) - int(usage.amount_awarded or 0))
        for category, usage in usage_by_category.items()
    }

    capped_rows: list[dict] = []
    for row in rows:
        category = str(row["daily_cap_category"])
        requested = int(row["requested_amount"])
        remaining = remaining_by_category[category]
        awarded = max(0, min(requested, remaining))
        remaining_by_category[category] = max(0, remaining - awarded)
        capped_rows.append({
            **row,
            "amount": awarded,
            "requested_amount": requested,
            "daily_cap_date": cap_date,
            "cap_applied": awarded < requested,
        })
    return capped_rows


async def _record_daily_cap_usage(db: AsyncSession, inserted: list[dict]) -> None:
    user_id: int | None = None
    cap_date: date | None = None
    amounts_by_category: Counter[str] = Counter()
    for row in inserted:
        category = row.get("daily_cap_category")
        row_cap_date = row.get("daily_cap_date")
        if not category or row_cap_date is None:
            continue
        row_user_id = int(row["user_id"])
        if user_id is None:
            user_id = row_user_id
            cap_date = row_cap_date
        elif user_id != row_user_id or cap_date != row_cap_date:
            raise RuntimeError("XP daily cap usage can only be recorded for one user and date at a time")
        amounts_by_category[str(category)] += int(row["amount"])

    amounts_by_category = Counter({
        category: amount
        for category, amount in amounts_by_category.items()
        if amount > 0
    })
    if user_id is None or cap_date is None or not amounts_by_category:
        return

    await db.execute(
        update(XPDailyCapUsage)
        .where(
            XPDailyCapUsage.user_id == user_id,
            XPDailyCapUsage.award_date == cap_date,
            XPDailyCapUsage.category.in_(list(amounts_by_category)),
        )
        .values(
            amount_awarded=XPDailyCapUsage.amount_awarded
            + case(
                *[(XPDailyCapUsage.category == category, amount) for category, amount in amounts_by_category.items()],
                else_=0,
            ),
            updated_at=func.now(),
        )
    )


async def _insert_xp_transaction_rows(db: AsyncSession, rows: list[dict]) -> list[dict]:
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is None:
        return await _insert_xp_transaction_rows_fallback(db, rows)

    stmt = (
        insert_factory(XPTransaction)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["user_id", "idempotency_key"])
        .returning(
            XPTransaction.id,
            XPTransaction.amount,
            XPTransaction.requested_amount,
            XPTransaction.user_id,
            XPTransaction.reason,
            XPTransaction.cap_applied,
            XPTransaction.daily_cap_category,
            XPTransaction.daily_cap_date,
        )
    )
    result = await db.execute(stmt)
    return [
        {
            "id": int(row_id),
            "amount": int(amount),
            "requested_amount": int(requested_amount),
            "user_id": int(user_id),
            "reason": str(reason),
            "cap_applied": bool(cap_applied),
            "daily_cap_category": daily_cap_category,
            "daily_cap_date": daily_cap_date,
        }
        for row_id, amount, requested_amount, user_id, reason, cap_applied, daily_cap_category, daily_cap_date in result.all()
    ]


async def _insert_xp_transaction_rows_fallback(db: AsyncSession, rows: list[dict]) -> list[dict]:
    inserted: list[dict] = []
    for row in rows:
        try:
            async with db.begin_nested():
                transaction = XPTransaction(**row)
                db.add(transaction)
                await db.flush()
        except IntegrityError:
            continue
        inserted.append({
            "id": int(transaction.id),
            "amount": int(row["amount"]),
            "requested_amount": int(row["requested_amount"]),
            "user_id": int(row["user_id"]),
            "reason": str(row["reason"]),
            "cap_applied": bool(row.get("cap_applied")),
            "daily_cap_category": row.get("daily_cap_category"),
            "daily_cap_date": row.get("daily_cap_date"),
        })
    return inserted


async def _update_inserted_xp_transaction_amounts(db: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    ids = [row["id"] for row in rows]
    await db.execute(
        update(XPTransaction)
        .where(XPTransaction.id.in_(ids))
        .values(
            amount=case(
                *[(XPTransaction.id == row["id"], row["amount"]) for row in rows],
                else_=XPTransaction.amount,
            ),
            requested_amount=case(
                *[(XPTransaction.id == row["id"], row["requested_amount"]) for row in rows],
                else_=XPTransaction.requested_amount,
            ),
            cap_applied=case(
                *[(XPTransaction.id == row["id"], row["cap_applied"]) for row in rows],
                else_=XPTransaction.cap_applied,
            ),
        )
    )


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


async def _increment_user_xp_total(db: AsyncSession, user_id: int, amount: int, *, active_date: date) -> None:
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is not None:
        previous_date = active_date - timedelta(days=1)
        stmt = (
            insert_factory(UserXP)
            .values(user_id=user_id, total_xp=amount, streak_days=1, last_active_date=active_date)
            .on_conflict_do_update(
                index_elements=["user_id"],
                set_={
                    "total_xp": UserXP.total_xp + amount,
                    "streak_days": case(
                        (UserXP.last_active_date == active_date, UserXP.streak_days),
                        (UserXP.last_active_date == previous_date, UserXP.streak_days + 1),
                        else_=1,
                    ),
                    "last_active_date": active_date,
                    "updated_at": func.now(),
                },
            )
        )
        await db.execute(stmt)
        return

    try:
        async with db.begin_nested():
            db.add(UserXP(user_id=user_id, total_xp=amount, streak_days=1, last_active_date=active_date))
            await db.flush()
    except IntegrityError:
        xp_record = await db.scalar(select(UserXP).where(UserXP.user_id == user_id).with_for_update())
        if xp_record is None:
            raise
        if xp_record.last_active_date == active_date:
            streak_days = xp_record.streak_days
        elif xp_record.last_active_date == active_date - timedelta(days=1):
            streak_days = (xp_record.streak_days or 0) + 1
        else:
            streak_days = 1
        await db.execute(
            update(UserXP)
            .where(UserXP.user_id == user_id)
            .values(
                total_xp=UserXP.total_xp + amount,
                streak_days=streak_days,
                last_active_date=active_date,
                updated_at=func.now(),
            )
        )


async def _ensure_daily_quests_for_award(db: AsyncSession, user_id: int, quest_date: date) -> None:
    rows = [
        {"user_id": user_id, "date": quest_date, **template}
        for template in DAILY_QUEST_TEMPLATES
    ]
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is None:
        await generate_daily_quests(user_id, db, quest_date=quest_date)
        return

    await db.execute(
        insert_factory(DailyQuest)
        .values(rows)
        .on_conflict_do_nothing(
            index_elements=["user_id", "quest_type", "date"],
        )
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
    quest_date = active_date or _current_utc_date()
    await _increment_user_xp_total(db, user_id, total_amount, active_date=quest_date)

    if not update_daily_quests:
        await db.flush()
        return

    await _ensure_daily_quests_for_award(db, user_id, quest_date)
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

    rows = [
        {"user_id": user_id, "date": today, **template}
        for template in missing_templates
    ]
    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is not None:
        insert_result = await db.execute(
            insert_factory(DailyQuest)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=["user_id", "quest_type", "date"],
            )
            .returning(DailyQuest.id)
        )
        inserted_ids = insert_result.scalars().all()
        result = await db.execute(
            select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == today)
        )
        return result.scalars().all(), bool(inserted_ids)

    quests = [DailyQuest(**row) for row in rows]
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
