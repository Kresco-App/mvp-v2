from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.models.calendar import CalendarEvent
from app.models.courses import Subject
from app.models.gamification import (
    DailyQuest,
    LeaderboardRank,
    UserXP,
    XPTransaction,
)
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User
from app.schemas.gamification import (
    DailyQuestOut,
    LeaderboardEntryOut,
    SidebarSummaryOut,
    UserStatsOut,
    XPOut,
    XPTransactionOut,
)

from app.services.access import build_access_context
from app.services.gamification_stats import read_user_stats
from app.services.media_storage import media_url
from app.services.search import LIKE_ESCAPE, normalize_substring_search, substring_search_pattern
from app.services.xp import award_xp, calculate_level, generate_daily_quests


async def build_xp_summary(db: AsyncSession, *, user: User) -> XPOut:
    result = await db.execute(select(UserXP).where(UserXP.user_id == user.id))
    xp_record = result.scalar_one_or_none()
    total_xp = xp_record.total_xp if xp_record else 0
    streak = xp_record.streak_days if xp_record else 0
    level_data = calculate_level(total_xp)
    return XPOut(
        total_xp=total_xp,
        streak_days=streak,
        level=level_data["level"],
        xp_progress_pct=level_data["xp_progress_pct"],
        xp_for_current_level=level_data["xp_for_current_level"],
        xp_for_next_level=level_data["xp_for_next_level"],
    )


async def list_xp_transactions(
    db: AsyncSession,
    *,
    user: User,
    limit: int = 50,
    offset: int = 0,
) -> list[XPTransactionOut]:
    result = await db.execute(
        select(XPTransaction)
        .where(XPTransaction.user_id == user.id)
        .order_by(XPTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [XPTransactionOut.model_validate(transaction) for transaction in result.scalars().all()]


async def list_daily_quest_entries(db: AsyncSession, *, user: User) -> list[DailyQuestOut]:
    quests = await generate_daily_quests(user.id, db)
    await db.commit()
    return [DailyQuestOut.model_validate(quest) for quest in quests]


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
    await db.commit()
    return {"success": True, "xp_awarded": xp_awarded}


async def list_leaderboard_entries(
    db: AsyncSession,
    *,
    user: User,
    settings: Settings,
    limit: int = 50,
    offset: int = 0,
    search: str = "",
) -> list[LeaderboardEntryOut]:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    search = normalize_substring_search(search)
    if await refresh_leaderboard_projection_if_stale(db):
        await db.commit()

    stmt = (
        select(LeaderboardRank.user_id, LeaderboardRank.total_xp, LeaderboardRank.global_rank, User)
        .join(User, LeaderboardRank.user_id == User.id)
        .where(User.is_active == True)  # noqa: E712
    )
    if search:
        stmt = stmt.where(User.full_name.ilike(substring_search_pattern(search), escape=LIKE_ESCAPE))
    stmt = stmt.order_by(LeaderboardRank.global_rank, LeaderboardRank.user_id).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    out = []
    for user_id, total_xp, global_rank, row_user in rows:
        level_data = calculate_level(total_xp)
        out.append(LeaderboardEntryOut(
            rank=global_rank,
            user_id=user_id,
            full_name=row_user.full_name,
            avatar_url=media_url(row_user.avatar_url, settings),
            total_xp=total_xp,
            level=level_data["level"],
            is_current_user=row_user.id == user.id,
        ))
    return out


async def refresh_leaderboard_projection_if_stale(db: AsyncSession) -> bool:
    active_count = int(await db.scalar(
        select(func.count())
        .select_from(UserXP)
        .join(User, UserXP.user_id == User.id)
        .where(User.is_active == True)  # noqa: E712
    ) or 0)
    projection_count = int(await db.scalar(
        select(func.count())
        .select_from(LeaderboardRank)
        .join(User, LeaderboardRank.user_id == User.id)
        .where(User.is_active == True)  # noqa: E712
    ) or 0)
    latest_xp_update = await db.scalar(
        select(func.max(UserXP.updated_at))
        .join(User, UserXP.user_id == User.id)
        .where(User.is_active == True)  # noqa: E712
    )
    latest_projection_refresh = await db.scalar(select(func.max(LeaderboardRank.refreshed_at)))
    if (
        projection_count == active_count
        and latest_projection_refresh is not None
        and (latest_xp_update is None or latest_projection_refresh >= latest_xp_update)
    ):
        return False

    rows = (
        await db.execute(
            select(UserXP.user_id, UserXP.total_xp)
            .join(User, UserXP.user_id == User.id)
            .where(User.is_active == True)  # noqa: E712
            .order_by(UserXP.total_xp.desc(), UserXP.user_id)
        )
    ).all()
    refreshed_at = datetime.now(timezone.utc)
    await db.execute(delete(LeaderboardRank))

    previous_xp: int | None = None
    current_rank = 0
    projection_rows: list[LeaderboardRank] = []
    for index, (user_id, total_xp) in enumerate(rows, start=1):
        if previous_xp is None or total_xp != previous_xp:
            current_rank = index
            previous_xp = total_xp
        projection_rows.append(
            LeaderboardRank(
                user_id=user_id,
                total_xp=total_xp,
                global_rank=current_rank,
                refreshed_at=refreshed_at,
            )
        )
    db.add_all(projection_rows)
    await db.flush()
    return True


async def build_sidebar_summary(db: AsyncSession, *, user: User, settings: Settings) -> SidebarSummaryOut:
    xp_result = await db.execute(select(UserXP).where(UserXP.user_id == user.id))
    xp_record = xp_result.scalar_one_or_none()
    streak_days = xp_record.streak_days if xp_record else 0

    quests = await generate_daily_quests(user.id, db)
    await db.commit()
    leaderboard = await list_leaderboard_entries(
        db,
        user=user,
        settings=settings,
        limit=10,
        offset=0,
        search="",
    )
    live_events = await _sidebar_live_events(db, user)

    return SidebarSummaryOut(
        chrono_units=[
            {"value": 8, "label": "Month"},
            {"value": 3, "label": "Week"},
            {"value": 14, "label": "Day"},
            {"value": 16, "label": "Hour"},
            {"value": 45, "label": "Minute"},
        ],
        calendar_days=_sidebar_calendar_days(),
        live_events=live_events,
        strike_days=_sidebar_strike_days(streak_days),
        quests=[DailyQuestOut.model_validate(q) for q in quests],
        leaderboard_entries=leaderboard,
    )


async def build_user_stats(db: AsyncSession, *, user: User) -> UserStatsOut:
    stats = await read_user_stats(db, user_id=user.id)
    total_seconds = int(stats.total_watch_seconds or 0) if stats else 0
    quizzes_passed = int(stats.quizzes_passed or 0) if stats else 0
    items_completed = int(stats.lessons_completed or 0) if stats else 0

    return UserStatsOut(
        total_watch_minutes=total_seconds // 60,
        quizzes_passed=quizzes_passed,
        items_completed=items_completed,
        is_pro=user.is_pro,
    )


def _sidebar_calendar_days(today: date | None = None) -> list[dict[str, int | str | bool]]:
    active_date = today or datetime.now(timezone.utc).date()
    start_date = active_date - timedelta(days=7)
    weekday_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return [
        {
            "id": current_date.isoformat(),
            "label": weekday_labels[current_date.weekday()],
            "value": current_date.day,
            "active": current_date == active_date,
        }
        for current_date in (start_date + timedelta(days=offset) for offset in range(21))
    ]


def _sidebar_strike_days(streak_days: int) -> list[dict[str, str | bool]]:
    labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    done_count = max(0, min(streak_days, len(labels)))
    return [{"label": label, "done": index < done_count} for index, label in enumerate(labels)]


def _format_sidebar_start(starts_at: datetime) -> str:
    now = datetime.now(timezone.utc)
    value = starts_at
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if value.date() == now.date():
        prefix = "Today"
    elif (value.date() - now.date()).days == 1:
        prefix = "Tomorrow"
    else:
        prefix = f"{value.strftime('%b')} {value.day}"
    return f"{prefix} {value.strftime('%H:%M')}"


async def _sidebar_live_events(db: AsyncSession, user: User) -> list[dict[str, int | str]]:
    now = datetime.now(timezone.utc)
    stmt = (
        select(CalendarEvent)
        .outerjoin(LiveSession, LiveSession.calendar_event_id == CalendarEvent.id)
        .outerjoin(CourseOffering, CourseOffering.id == LiveSession.course_offering_id)
        .outerjoin(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .where(
            CalendarEvent.event_type == "live_session",
            CalendarEvent.status.in_(["scheduled", "live"]),
            CalendarEvent.ends_at >= now,
        )
        .order_by(CalendarEvent.starts_at, CalendarEvent.id)
        .limit(2)
    )
    if not (user.is_staff or user.is_superuser or user.role == "professor"):
        stmt = stmt.where(
            or_(
                LiveSession.id.is_(None),
                and_(ProgramTrack.niveau == user.niveau, ProgramTrack.filiere == user.filiere),
            )
        )
    result = await db.execute(stmt)
    events = result.scalars().all()
    return [
        {
            "id": event.id,
            "title": event.title,
            "starts_at": _format_sidebar_start(event.starts_at),
            "subject": event.subtitle or event.teacher_name or "Live session",
            "href": f"/calendar?event={event.id}",
            "status": "upcoming" if event.status == "scheduled" else event.status,
        }
        for event in events
    ]
