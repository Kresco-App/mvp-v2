from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.courses import Chapter, ChapterSection, Lesson, Subject, VideoQuizTrigger
from app.models.gamification import (
    ContentProgress, DailyQuest, LessonProgress, QuizResult, UserXP, XPTransaction,
)
from app.models.quizzes import Quiz
from app.models.users import User
from app.schemas.gamification import (
    DailyQuestOut, LessonAccessOut, LessonProgressOut, SectionAccessOut,
    SectionCompleteIn, SubjectPlanOut, UserStatsOut, XPOut, XPTransactionOut,
    ProgressUpdateIn, ProgressCompleteIn, LeaderboardEntryOut,
)
from app.schemas.courses import VideoQuizTriggerOut
from app.services.xp import award_xp, calculate_level, generate_daily_quests

router = APIRouter(tags=["Progress & Gamification"])


@router.get("/subject-plan/{subject_id}", response_model=SubjectPlanOut)
async def get_subject_plan(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subject)
        .options(
            selectinload(Subject.chapters).selectinload(Chapter.lessons),
            selectinload(Subject.chapters).selectinload(Chapter.sections),
        )
        .where(Subject.id == subject_id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    all_lesson_ids = [l.id for c in subject.chapters for l in c.lessons]
    all_section_ids = [s.id for c in subject.chapters for s in c.sections]

    progress_result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id.in_(all_lesson_ids),
            LessonProgress.status == "completed",
        )
    )
    completed_lessons = [p.lesson_id for p in progress_result.scalars().all()]

    content_result = await db.execute(
        select(ContentProgress).where(ContentProgress.user_id == user.id)
    )
    all_content = content_result.scalars().all()
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
    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id == body.lesson_id,
        )
    )
    progress = result.scalar_one_or_none()

    lesson_result = await db.execute(select(Lesson).where(Lesson.id == body.lesson_id))
    lesson = lesson_result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    if progress is None:
        progress = LessonProgress(
            user_id=user.id, lesson_id=body.lesson_id, watched_seconds=body.watched_seconds
        )
        db.add(progress)
    else:
        if body.watched_seconds > progress.watched_seconds:
            progress.watched_seconds = body.watched_seconds

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

    if lesson.is_free_preview:
        return LessonAccessOut(can_access=True, reason="free_preview")
    if not user.is_pro:
        return LessonAccessOut(can_access=False, reason="pro_required")

    chapter_lessons = sorted(lesson.chapter.lessons, key=lambda l: l.order)
    current_idx = next((i for i, l in enumerate(chapter_lessons) if l.id == lesson_id), 0)

    if current_idx == 0:
        return LessonAccessOut(can_access=True, reason="first_lesson")

    prev_lesson = chapter_lessons[current_idx - 1]
    prev_progress_result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id,
            LessonProgress.lesson_id == prev_lesson.id,
        )
    )
    prev_progress = prev_progress_result.scalar_one_or_none()

    if not prev_progress or prev_progress.status != "completed":
        return LessonAccessOut(
            can_access=False, reason="previous_lesson_incomplete",
            blocker_lesson_id=prev_lesson.id,
        )

    return LessonAccessOut(can_access=True, reason="sequential_unlocked")


@router.post("/section-complete")
async def complete_section(
    body: SectionCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ChapterSection).where(ChapterSection.id == body.section_id))
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")

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

    if section.is_free_preview:
        return SectionAccessOut(can_access=True)
    if not user.is_pro:
        return SectionAccessOut(can_access=False)

    chapter_sections = sorted(section.chapter.sections, key=lambda s: s.order)
    current_idx = next((i for i, s in enumerate(chapter_sections) if s.id == section_id), 0)

    if current_idx == 0:
        return SectionAccessOut(can_access=True)

    prev_section = chapter_sections[current_idx - 1]
    if not prev_section.is_gating:
        return SectionAccessOut(can_access=True)

    prev_done = await db.execute(
        select(ContentProgress).where(
            ContentProgress.user_id == user.id,
            ContentProgress.item_type == "section",
            ContentProgress.item_id == prev_section.id,
        )
    )
    return SectionAccessOut(can_access=prev_done.scalar_one_or_none() is not None)


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
    qr = QuizResult(user_id=user.id, quiz_id=quiz_id, score=score, passed=passed)
    db.add(qr)
    xp_earned = 0
    if passed:
        xp_earned = await award_xp(user.id, "quiz_pass", f"Quiz {quiz_id} passed", db)
    await db.commit()
    return {"score": score, "passed": passed, "xp_earned": xp_earned}


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
