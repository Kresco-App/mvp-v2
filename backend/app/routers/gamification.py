from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.calendar import CalendarEvent
from app.models.courses import Chapter, ChapterSection, Lesson, Subject, VideoQuizTrigger
from app.models.gamification import (
    ContentProgress, DailyQuest, LessonProgress, QuizResult, UserXP, XPTransaction,
)
from app.models.quizzes import Quiz
from app.models.users import User
from app.schemas.gamification import (
    DailyQuestOut, LessonAccessOut, LessonProgressOut, SectionAccessOut,
    SectionCompleteIn, SubjectPlanOut, UserStatsOut, XPOut, XPTransactionOut,
    ProgressUpdateIn, ProgressCompleteIn, LeaderboardEntryOut, SidebarSummaryOut,
)
from app.schemas.courses import VideoQuizTriggerOut
from app.services.access import build_access_context
from app.services.xp import award_xp, calculate_level, generate_daily_quests

router = APIRouter(tags=["Progress & Gamification"])


def _sidebar_calendar_days() -> list[dict[str, int | str | bool]]:
    days = [("Mon", 8), ("Tue", 9), ("Wed", 10), ("Thu", 11), ("Fri", 12), ("Sat", 13), ("Sun", 14)]
    return [{"label": label, "value": value, "active": label == "Wed"} for label, value in days]


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


async def _sidebar_live_events(db: AsyncSession) -> list[dict[str, int | str]]:
    result = await db.execute(
        select(CalendarEvent)
        .where(
            CalendarEvent.event_type == "live_session",
            CalendarEvent.status.in_(["scheduled", "live"]),
            CalendarEvent.ends_at >= datetime.now(timezone.utc),
        )
        .order_by(CalendarEvent.starts_at, CalendarEvent.id)
        .limit(2)
    )
    events = result.scalars().all()
    if events:
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
    return [
        {
            "id": "math-live",
            "title": "Continuity clinic",
            "starts_at": "Today 18:30",
            "subject": "Mathematics",
            "href": "/calendar",
            "status": "upcoming",
        },
        {
            "id": "physics-live",
            "title": "Wave speed review",
            "starts_at": "Tomorrow 19:00",
            "subject": "Physique-Chimie",
            "href": "/calendar",
            "status": "upcoming",
        },
    ]


@router.get("/subject-plan/{subject_id}", response_model=SubjectPlanOut)
async def get_subject_plan(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subject)
        .options(
            selectinload(Subject.chapters).selectinload(Chapter.lessons).selectinload(Lesson.quiz),
            selectinload(Subject.chapters).selectinload(Chapter.blocks),
            selectinload(Subject.chapters).selectinload(Chapter.sections),
        )
        .where(Subject.id == subject_id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    all_lesson_ids = [l.id for c in subject.chapters for l in c.lessons]
    all_block_ids = [b.id for c in subject.chapters for b in c.blocks]
    all_quiz_ids = [l.quiz.id for c in subject.chapters for l in c.lessons if l.quiz is not None]
    all_section_ids = [s.id for c in subject.chapters for s in c.sections]

    progress_result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id.in_(all_lesson_ids),
            LessonProgress.status == "completed",
        )
    )
    completed_lessons = [p.lesson_id for p in progress_result.scalars().all()]

    content_filters = []
    if all_block_ids:
        content_filters.append(
            (ContentProgress.item_type == "block") & ContentProgress.item_id.in_(all_block_ids)
        )
    if all_quiz_ids:
        content_filters.append(
            (ContentProgress.item_type == "quiz") & ContentProgress.item_id.in_(all_quiz_ids)
        )
    if all_section_ids:
        content_filters.append(
            (ContentProgress.item_type == "section") & ContentProgress.item_id.in_(all_section_ids)
        )
    if content_filters:
        content_result = await db.execute(
            select(ContentProgress).where(ContentProgress.user_id == user.id, or_(*content_filters))
        )
        all_content = content_result.scalars().all()
    else:
        all_content = []
    completed_blocks = [c.item_id for c in all_content if c.item_type == "block"]
    completed_quizzes = [c.item_id for c in all_content if c.item_type == "quiz"]
    completed_sections = [c.item_id for c in all_content if c.item_type == "section"]

    return SubjectPlanOut(
        completed_lesson_ids=completed_lessons,
        completed_block_ids=completed_blocks,
        completed_quiz_ids=completed_quizzes,
        completed_section_ids=completed_sections,
        total_section_count=len(all_section_ids),
        total_lesson_count=len(all_lesson_ids),
    )


@router.post("/update", response_model=LessonProgressOut)
async def update_progress(
    body: ProgressUpdateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lesson_result = await db.execute(
        select(Lesson).options(selectinload(Lesson.chapter)).where(Lesson.id == body.lesson_id)
    )
    lesson = lesson_result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    access_context = await build_access_context(db, user)
    subject_id = lesson.chapter.subject_id if lesson.chapter else None
    access = access_context.decide_for(lesson, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)

    watched_seconds = max(0, body.watched_seconds)
    if lesson.duration_seconds > 0:
        watched_seconds = min(watched_seconds, lesson.duration_seconds)

    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id == body.lesson_id,
        )
    )
    progress = result.scalar_one_or_none()

    if progress is None:
        progress = LessonProgress(
            user_id=user.id, lesson_id=body.lesson_id, watched_seconds=watched_seconds
        )
        db.add(progress)
    else:
        if watched_seconds > progress.watched_seconds:
            progress.watched_seconds = watched_seconds

    # Auto-complete if watched ≥ 90%
    if lesson.duration_seconds > 0 and progress.watched_seconds >= lesson.duration_seconds * 0.9:
        if progress.status != "completed":
            progress.status = "completed"
            await award_xp(user.id, "lesson_complete", f"Lesson {lesson.id} completed", db)

    await db.commit()
    await db.refresh(progress)
    return LessonProgressOut(
        lesson_id=progress.lesson_id,
        watched_seconds=progress.watched_seconds,
        status=progress.status,
    )


@router.post("/complete")
async def mark_complete(
    body: ProgressCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(
        select(ContentProgress).where(
            ContentProgress.user_id == user.id,
            ContentProgress.item_type == body.item_type,
            ContentProgress.item_id == body.item_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        cp = ContentProgress(user_id=user.id, item_type=body.item_type, item_id=body.item_id)
        db.add(cp)
        await db.commit()
    return {"ok": True}


@router.get("/lessons/{lesson_id}/access", response_model=LessonAccessOut)
async def check_lesson_access(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.chapter).selectinload(Chapter.lessons))
        .where(Lesson.id == lesson_id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    access_context = await build_access_context(db, user)
    subject_id = lesson.chapter.subject_id if lesson.chapter else None
    access = access_context.decide_for(lesson, subject_id=subject_id, fallback_required_tier="pro")
    return LessonAccessOut(can_access=access.can_access, reason=access.reason)


@router.post("/section-complete")
async def complete_section(
    body: SectionCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter))
        .where(ChapterSection.id == body.section_id)
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    access_context = await build_access_context(db, user)
    subject_id = section.chapter.subject_id if section.chapter else None
    access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)

    existing = await db.execute(
        select(ContentProgress).where(
            ContentProgress.user_id == user.id,
            ContentProgress.item_type == "section",
            ContentProgress.item_id == body.section_id,
        )
    )
    xp_earned = 0
    if existing.scalar_one_or_none() is None:
        cp = ContentProgress(user_id=user.id, item_type="section", item_id=body.section_id)
        db.add(cp)

        if section.section_type == "video":
            xp_earned = await award_xp(user.id, "video_complete", f"Section {section.id} video", db)
        elif section.section_type == "activity":
            xp_earned = await award_xp(user.id, "lab_complete", f"Section {section.id} activity", db)
        elif section.section_type == "quiz" and body.score >= (section.pass_score or 70):
            xp_earned = await award_xp(user.id, "quiz_pass", f"Section {section.id} quiz passed", db)

    await db.commit()
    return {"xp_earned": xp_earned}


@router.get("/sections/{section_id}/access", response_model=SectionAccessOut)
async def check_section_access(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter).selectinload(Chapter.sections))
        .where(ChapterSection.id == section_id)
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")

    access_context = await build_access_context(db, user)
    subject_id = section.chapter.subject_id if section.chapter else None
    access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
    return SectionAccessOut(
        can_access=access.can_access,
        reason=access.reason,
        required_tier=access.required_tier,
        required_subject_id=access.required_subject_id,
    )


@router.get("/xp", response_model=XPOut)
async def get_xp(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(UserXP).where(UserXP.user_id == user.id))
    xp_record = result.scalar_one_or_none()
    total_xp = xp_record.total_xp if xp_record else 0
    streak = xp_record.streak_days if xp_record else 0
    level_data = calculate_level(total_xp)
    return XPOut(
        total_xp=total_xp, streak_days=streak,
        level=level_data["level"],
        xp_progress_pct=level_data["xp_progress_pct"],
        xp_for_current_level=level_data["xp_for_current_level"],
        xp_for_next_level=level_data["xp_for_next_level"],
    )


@router.get("/xp/history", response_model=list[XPTransactionOut])
async def get_xp_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(XPTransaction)
        .where(XPTransaction.user_id == user.id)
        .order_by(XPTransaction.created_at.desc())
        .limit(50)
    )
    return [XPTransactionOut.model_validate(t) for t in result.scalars().all()]


@router.get("/lessons/{lesson_id}/quiz-triggers", response_model=list[VideoQuizTriggerOut])
async def get_quiz_triggers(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(VideoQuizTrigger)
        .where(VideoQuizTrigger.lesson_id == lesson_id)
        .order_by(VideoQuizTrigger.timestamp_seconds)
    )
    return [VideoQuizTriggerOut.model_validate(t) for t in result.scalars().all()]


@router.post("/quiz-result")
async def record_quiz_result(
    quiz_id: int,
    score: int,
    passed: bool,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quiz_result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.lesson).selectinload(Lesson.chapter))
        .where(Quiz.id == quiz_id)
    )
    quiz = quiz_result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.lesson is None:
        raise HTTPException(status_code=404, detail="Quiz lesson not found")
    access_context = await build_access_context(db, user)
    subject_id = quiz.lesson.chapter.subject_id if quiz.lesson.chapter else None
    access = access_context.decide_for(quiz.lesson, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)

    normalized_score = max(0, min(score, 100))
    server_passed = normalized_score >= quiz.pass_score
    prior_passed_result = await db.execute(
        select(QuizResult.id)
        .where(
            QuizResult.user_id == user.id,
            QuizResult.quiz_id == quiz_id,
            QuizResult.passed == True,  # noqa: E712
        )
        .limit(1)
    )
    already_passed = prior_passed_result.scalar_one_or_none() is not None

    qr = QuizResult(user_id=user.id, quiz_id=quiz_id, score=normalized_score, passed=server_passed)
    db.add(qr)
    xp_earned = 0
    if server_passed and not already_passed:
        xp_earned = await award_xp(user.id, "quiz_pass", f"Quiz {quiz_id} passed", db, dedupe=True)
    await db.commit()
    return {"score": normalized_score, "passed": server_passed, "xp_earned": xp_earned}


@router.get("/leaderboard", response_model=list[LeaderboardEntryOut])
async def get_leaderboard(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import func as sqlfunc
    from app.models.users import User as UserModel

    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    search = search.strip()[:80]

    rank_col = sqlfunc.rank().over(order_by=UserXP.total_xp.desc()).label("rank")
    stmt = (
        select(UserXP, UserModel, rank_col)
        .join(UserModel, UserXP.user_id == UserModel.id)
        .where(UserModel.is_active == True)  # noqa: E712
    )
    if search:
        stmt = stmt.where(UserModel.full_name.ilike(f"%{search}%"))
    stmt = stmt.order_by(UserXP.total_xp.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    out = []
    for xp_rec, u, rank in rows:
        level_data = calculate_level(xp_rec.total_xp)
        out.append(LeaderboardEntryOut(
            rank=rank,
            user_id=u.id,
            full_name=u.full_name,
            avatar_url=u.avatar_url or "",
            total_xp=xp_rec.total_xp,
            level=level_data["level"],
            is_current_user=u.id == user.id,
        ))
    return out


@router.get("/daily-quests", response_model=list[DailyQuestOut])
async def get_daily_quests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quests = await generate_daily_quests(user.id, db)
    return [DailyQuestOut.model_validate(q) for q in quests]


@router.get("/sidebar-summary", response_model=SidebarSummaryOut)
async def get_sidebar_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    xp_result = await db.execute(select(UserXP).where(UserXP.user_id == user.id))
    xp_record = xp_result.scalar_one_or_none()
    streak_days = xp_record.streak_days if xp_record else 0

    quests = await generate_daily_quests(user.id, db)
    leaderboard = await get_leaderboard(limit=10, offset=0, search="", db=db, user=user)

    live_events = await _sidebar_live_events(db)

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


@router.post("/daily-quests/{quest_id}/claim")
async def claim_daily_quest(
    quest_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyQuest).where(DailyQuest.id == quest_id, DailyQuest.user_id == user.id)
    )
    quest = result.scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    if quest.completed:
        raise HTTPException(status_code=400, detail="Quest already claimed")
    if quest.progress < quest.target:
        raise HTTPException(status_code=400, detail="Quest not yet completed")

    quest.completed = True
    from app.models.gamification import XPTransaction, UserXP
    result2 = await db.execute(select(UserXP).where(UserXP.user_id == user.id))
    xp_rec = result2.scalar_one_or_none()
    if xp_rec:
        xp_rec.total_xp += quest.xp_reward
    else:
        db.add(UserXP(user_id=user.id, total_xp=quest.xp_reward))
    db.add(XPTransaction(user_id=user.id, amount=quest.xp_reward, reason="daily_quest", description=quest.title))
    await db.commit()
    return {"success": True, "xp_awarded": quest.xp_reward}


@router.get("/stats", response_model=UserStatsOut)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    watch_result = await db.execute(
        select(func.sum(LessonProgress.watched_seconds)).where(LessonProgress.user_id == user.id)
    )
    total_seconds = watch_result.scalar() or 0

    quizzes_result = await db.execute(
        select(func.count()).where(QuizResult.user_id == user.id, QuizResult.passed == True)  # noqa: E712
    )
    quizzes_passed = quizzes_result.scalar() or 0

    lessons_result = await db.execute(
        select(func.count()).where(
            LessonProgress.user_id == user.id, LessonProgress.status == "completed"
        )
    )
    lessons_completed = lessons_result.scalar() or 0

    return UserStatsOut(
        total_watch_minutes=total_seconds // 60,
        quizzes_passed=quizzes_passed,
        lessons_completed=lessons_completed,
        is_pro=user.is_pro,
    )
