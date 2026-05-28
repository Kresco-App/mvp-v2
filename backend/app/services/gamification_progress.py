from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import ChapterBlock, ChapterSection, Lesson
from app.models.gamification import ContentProgress, LessonProgress
from app.models.quizzes import Quiz
from app.models.users import User
from app.schemas.gamification import (
    LessonProgressOut,
    ProgressCompleteIn,
    ProgressUpdateIn,
    SectionCompleteIn,
)
from app.services.access import build_access_context
from app.services.course_access import require_lesson_access, require_topic_item_access
from app.services.gamification_read_models import grade_section_quiz
from app.services.gamification_stats import apply_lesson_progress_stats_delta
from app.services.xp import award_xp

INITIAL_PROGRESS_TRUST_SECONDS = 45
PROGRESS_UPDATE_GRACE_SECONDS = 5
PROGRESS_UPDATE_RATE_MULTIPLIER = 1.25


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def bounded_watch_progress(
    *,
    requested_seconds: int,
    current_seconds: int,
    duration_seconds: int,
    last_updated_at: datetime | None,
    is_new_progress: bool,
    now: datetime,
) -> int:
    requested = max(0, requested_seconds)
    if duration_seconds > 0:
        requested = min(requested, duration_seconds)
    if requested <= current_seconds:
        return current_seconds

    if is_new_progress or current_seconds <= 0:
        return min(requested, INITIAL_PROGRESS_TRUST_SECONDS)

    last_updated = coerce_utc(last_updated_at)
    elapsed = max(0, int((now - last_updated).total_seconds())) if last_updated else 0
    max_increment = int(elapsed * PROGRESS_UPDATE_RATE_MULTIPLIER) + PROGRESS_UPDATE_GRACE_SECONDS
    return min(requested, current_seconds + max_increment)


async def get_or_create_lesson_progress(
    db: AsyncSession,
    *,
    user_id: int,
    lesson_id: int,
    watched_seconds: int = 0,
) -> tuple[LessonProgress, bool]:
    progress = await db.scalar(
        select(LessonProgress)
        .where(LessonProgress.user_id == user_id, LessonProgress.lesson_id == lesson_id)
        .with_for_update()
    )
    if progress is not None:
        return progress, False

    progress = LessonProgress(user_id=user_id, lesson_id=lesson_id, watched_seconds=watched_seconds)
    try:
        async with db.begin_nested():
            db.add(progress)
            await db.flush()
    except IntegrityError:
        progress = await db.scalar(
            select(LessonProgress)
            .where(LessonProgress.user_id == user_id, LessonProgress.lesson_id == lesson_id)
            .with_for_update()
        )
        if progress is None:
            raise
        return progress, False
    return progress, True


async def insert_content_progress_once(
    db: AsyncSession,
    *,
    user_id: int,
    item_type: str,
    item_id: int,
) -> bool:
    existing_id = await db.scalar(
        select(ContentProgress.id)
        .where(
            ContentProgress.user_id == user_id,
            ContentProgress.item_type == item_type,
            ContentProgress.item_id == item_id,
        )
        .with_for_update()
    )
    if existing_id is not None:
        return False

    try:
        async with db.begin_nested():
            db.add(ContentProgress(user_id=user_id, item_type=item_type, item_id=item_id))
            await db.flush()
    except IntegrityError:
        return False
    return True


async def update_lesson_progress(
    db: AsyncSession,
    *,
    user: User,
    body: ProgressUpdateIn,
) -> LessonProgressOut:
    lesson = await db.scalar(
        select(Lesson).options(selectinload(Lesson.chapter)).where(Lesson.id == body.lesson_id)
    )
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    access_context = await build_access_context(db, user)
    subject_id = lesson.chapter.subject_id if lesson.chapter else None
    access = access_context.decide_for(lesson, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)

    progress, created_progress = await get_or_create_lesson_progress(
        db,
        user_id=user.id,
        lesson_id=body.lesson_id,
    )
    previous_watched_seconds = int(progress.watched_seconds or 0)
    was_completed = progress.status == "completed"
    watched_seconds = bounded_watch_progress(
        requested_seconds=body.watched_seconds,
        current_seconds=previous_watched_seconds,
        duration_seconds=lesson.duration_seconds,
        last_updated_at=progress.updated_at,
        is_new_progress=created_progress,
        now=utc_now(),
    )
    if watched_seconds > previous_watched_seconds:
        progress.watched_seconds = watched_seconds

    if lesson.duration_seconds > 0 and progress.watched_seconds >= lesson.duration_seconds * 0.9:
        if progress.status != "completed":
            progress.status = "completed"
            await award_xp(
                user.id,
                "lesson_complete",
                f"Lesson {lesson.id} completed",
                db,
                subject_id=subject_id,
                idempotency_key=f"lesson_complete:user:{user.id}:lesson:{lesson.id}",
            )

    await apply_lesson_progress_stats_delta(
        db,
        user_id=user.id,
        watched_seconds_delta=int(progress.watched_seconds or 0) - previous_watched_seconds,
        lessons_completed_delta=1 if progress.status == "completed" and not was_completed else 0,
    )

    await db.commit()
    await db.refresh(progress)
    return LessonProgressOut(
        lesson_id=progress.lesson_id,
        watched_seconds=progress.watched_seconds,
        status=progress.status,
    )


async def mark_content_complete(
    db: AsyncSession,
    *,
    user: User,
    body: ProgressCompleteIn,
) -> dict[str, bool]:
    await require_completable_content_access(db, user=user, item_type=body.item_type, item_id=body.item_id)
    await insert_content_progress_once(
        db,
        user_id=user.id,
        item_type=body.item_type,
        item_id=body.item_id,
    )
    await db.commit()
    return {"ok": True}


async def require_completable_content_access(
    db: AsyncSession,
    *,
    user: User,
    item_type: str,
    item_id: int,
) -> None:
    if item_type == "section":
        section = await db.scalar(
            select(ChapterSection)
            .options(selectinload(ChapterSection.chapter))
            .where(ChapterSection.id == item_id)
        )
        if section is None:
            raise HTTPException(status_code=404, detail="Item not found")
        access_context = await build_access_context(db, user)
        subject_id = section.chapter.subject_id if section.chapter else None
        access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
        if not access.can_access:
            raise HTTPException(status_code=403, detail=access.locked_reason)
        return

    if item_type == "block":
        block = await db.scalar(
            select(ChapterBlock)
            .options(selectinload(ChapterBlock.chapter))
            .where(ChapterBlock.id == item_id)
        )
        if block is None:
            raise HTTPException(status_code=404, detail="Item not found")
        access_context = await build_access_context(db, user)
        subject_id = block.chapter.subject_id if block.chapter else None
        access = access_context.decide_for(block, subject_id=subject_id, fallback_required_tier="pro")
        if not access.can_access:
            raise HTTPException(status_code=403, detail=access.locked_reason)
        return

    if item_type == "quiz":
        quiz = await db.scalar(
            select(Quiz)
            .options(selectinload(Quiz.lesson).selectinload(Lesson.chapter))
            .where(Quiz.id == item_id)
        )
        if quiz is None:
            raise HTTPException(status_code=404, detail="Item not found")
        await require_lesson_access(db, user, quiz.lesson_id)
        return

    if item_type == "topic_item":
        await require_topic_item_access(db, user, item_id)
        return

    raise HTTPException(status_code=400, detail="Unsupported item_type")


async def complete_chapter_section(
    db: AsyncSession,
    *,
    user: User,
    body: SectionCompleteIn,
) -> dict[str, int | bool | None]:
    section = await db.scalar(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter))
        .where(ChapterSection.id == body.section_id)
    )
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")

    access_context = await build_access_context(db, user)
    subject_id = section.chapter.subject_id if section.chapter else None
    access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)

    xp_earned = 0

    if section.section_type == "quiz":
        score, passed, correct_answers, total_questions = grade_section_quiz(section, body.answers)
        body.score = score
        body.correct_answers = correct_answers
        body.total_questions = total_questions
        if passed:
            inserted_progress = await insert_content_progress_once(
                db,
                user_id=user.id,
                item_type="section",
                item_id=body.section_id,
            )
            if inserted_progress:
                xp_earned = await award_xp(
                    user.id,
                    "quiz_pass",
                    f"Section {section.id} quiz passed",
                    db,
                    subject_id=subject_id,
                    idempotency_key=f"section_complete:user:{user.id}:section:{section.id}:quiz",
                )
    else:
        passed = True
        inserted_progress = await insert_content_progress_once(
            db,
            user_id=user.id,
            item_type="section",
            item_id=body.section_id,
        )
        if inserted_progress:
            if section.section_type == "video":
                xp_earned = await award_xp(
                    user.id,
                    "video_complete",
                    f"Section {section.id} video",
                    db,
                    subject_id=subject_id,
                    idempotency_key=f"section_complete:user:{user.id}:section:{section.id}:video",
                )
            elif section.section_type == "activity":
                xp_earned = await award_xp(
                    user.id,
                    "lab_complete",
                    f"Section {section.id} activity",
                    db,
                    subject_id=subject_id,
                    idempotency_key=f"section_complete:user:{user.id}:section:{section.id}:activity",
                )

    await db.commit()

    return {
        "xp_earned": xp_earned,
        "score": body.score,
        "passed": passed,
        "correct_answers": body.correct_answers,
        "total_questions": body.total_questions,
    }
