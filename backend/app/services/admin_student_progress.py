from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import QuizAttempt, TopicItemProgress, UserXP
from app.models.users import User
from app.schemas.admin import (
    AdminStudentProgressOut,
    AdminStudentProgressRowOut,
    AdminStudentProgressSummaryOut,
)


def _int(value: Any) -> int:
    return int(value or 0)


def _float(value: Any) -> float:
    return round(float(value or 0), 2)


def _latest_datetime(*values: datetime | None) -> datetime | None:
    dates = [value for value in values if value is not None]
    return max(dates) if dates else None


async def build_admin_student_progress(db: AsyncSession, *, limit: int = 50) -> AdminStudentProgressOut:
    now = datetime.now(timezone.utc)
    recent_since = now - timedelta(days=7)
    bounded_limit = max(1, min(int(limit or 50), 200))

    student_filters = (User.role == "student", User.is_staff == False)  # noqa: E712

    progress_subquery = (
        select(
            TopicItemProgress.user_id.label("user_id"),
            func.count(TopicItemProgress.id).label("progress_records"),
            func.coalesce(
                func.sum(case((TopicItemProgress.status == "completed", 1), else_=0)),
                0,
            ).label("completed_items"),
            func.coalesce(
                func.sum(case((TopicItemProgress.status != "completed", 1), else_=0)),
                0,
            ).label("in_progress_items"),
            func.coalesce(func.sum(TopicItemProgress.watched_seconds), 0).label("watched_seconds"),
            func.max(TopicItemProgress.updated_at).label("last_progress_at"),
        )
        .group_by(TopicItemProgress.user_id)
        .subquery()
    )

    quiz_subquery = (
        select(
            QuizAttempt.user_id.label("user_id"),
            func.count(QuizAttempt.id).label("quiz_attempts"),
            func.coalesce(func.sum(case((QuizAttempt.passed == True, 1), else_=0)), 0).label("quiz_passed"),  # noqa: E712
            func.coalesce(func.avg(QuizAttempt.score), 0).label("average_quiz_score"),
            func.max(QuizAttempt.created_at).label("last_quiz_at"),
        )
        .group_by(QuizAttempt.user_id)
        .subquery()
    )

    statement = (
        select(
            User.id.label("user_id"),
            User.full_name,
            User.email,
            User.tier,
            User.niveau,
            User.filiere,
            User.is_pro,
            func.coalesce(UserXP.total_xp, 0).label("total_xp"),
            func.coalesce(UserXP.streak_days, 0).label("streak_days"),
            func.coalesce(progress_subquery.c.progress_records, 0).label("progress_records"),
            func.coalesce(progress_subquery.c.completed_items, 0).label("completed_items"),
            func.coalesce(progress_subquery.c.in_progress_items, 0).label("in_progress_items"),
            func.coalesce(progress_subquery.c.watched_seconds, 0).label("watched_seconds"),
            progress_subquery.c.last_progress_at,
            func.coalesce(quiz_subquery.c.quiz_attempts, 0).label("quiz_attempts"),
            func.coalesce(quiz_subquery.c.quiz_passed, 0).label("quiz_passed"),
            func.coalesce(quiz_subquery.c.average_quiz_score, 0).label("average_quiz_score"),
            quiz_subquery.c.last_quiz_at,
        )
        .select_from(User)
        .outerjoin(UserXP, UserXP.user_id == User.id)
        .outerjoin(progress_subquery, progress_subquery.c.user_id == User.id)
        .outerjoin(quiz_subquery, quiz_subquery.c.user_id == User.id)
        .where(*student_filters)
        .order_by(
            func.coalesce(UserXP.total_xp, 0).desc(),
            func.coalesce(progress_subquery.c.completed_items, 0).desc(),
            User.id.asc(),
        )
        .limit(bounded_limit)
    )

    rows = []
    for row in (await db.execute(statement)).mappings().all():
        rows.append(
            AdminStudentProgressRowOut(
                user_id=_int(row["user_id"]),
                full_name=str(row["full_name"] or ""),
                email=str(row["email"] or ""),
                tier=str(row["tier"] or "basic"),
                niveau=str(row["niveau"] or ""),
                filiere=str(row["filiere"] or ""),
                is_pro=bool(row["is_pro"]),
                total_xp=_int(row["total_xp"]),
                streak_days=_int(row["streak_days"]),
                progress_records=_int(row["progress_records"]),
                completed_items=_int(row["completed_items"]),
                in_progress_items=_int(row["in_progress_items"]),
                watched_minutes=_int(row["watched_seconds"]) // 60,
                quiz_attempts=_int(row["quiz_attempts"]),
                quiz_passed=_int(row["quiz_passed"]),
                average_quiz_score=_float(row["average_quiz_score"]),
                last_activity_at=_latest_datetime(row["last_progress_at"], row["last_quiz_at"]),
            )
        )

    total_students = _int(await db.scalar(select(func.count()).select_from(User).where(*student_filters)))
    active_students_7d = _int(
        await db.scalar(
            select(func.count(func.distinct(TopicItemProgress.user_id)))
            .join(User, User.id == TopicItemProgress.user_id)
            .where(
                *student_filters,
                TopicItemProgress.updated_at >= recent_since,
            )
        )
    )
    students_with_progress = _int(
        await db.scalar(
            select(func.count(func.distinct(TopicItemProgress.user_id)))
            .join(User, User.id == TopicItemProgress.user_id)
            .where(*student_filters)
        )
    )
    completed_topic_items = _int(
        await db.scalar(
            select(func.count())
            .select_from(TopicItemProgress)
            .join(User, User.id == TopicItemProgress.user_id)
            .where(*student_filters, TopicItemProgress.status == "completed")
        )
    )
    total_watch_seconds = _int(
        await db.scalar(
            select(func.coalesce(func.sum(TopicItemProgress.watched_seconds), 0))
            .join(User, User.id == TopicItemProgress.user_id)
            .where(*student_filters)
        )
    )
    quiz_attempts = _int(
        await db.scalar(
            select(func.count()).select_from(QuizAttempt).join(User, User.id == QuizAttempt.user_id).where(*student_filters)
        )
    )
    quiz_passed = _int(
        await db.scalar(
            select(func.count())
            .select_from(QuizAttempt)
            .join(User, User.id == QuizAttempt.user_id)
            .where(*student_filters, QuizAttempt.passed == True)  # noqa: E712
        )
    )
    total_xp = _int(
        await db.scalar(
            select(func.coalesce(func.sum(UserXP.total_xp), 0)).join(User, User.id == UserXP.user_id).where(*student_filters)
        )
    )

    progress_breakdown_result = await db.execute(
        select(TopicItemProgress.status, func.count())
        .join(User, User.id == TopicItemProgress.user_id)
        .where(*student_filters)
        .group_by(TopicItemProgress.status)
        .order_by(TopicItemProgress.status)
    )
    progress_by_status = {
        str(status or "unset").lower(): _int(count)
        for status, count in progress_breakdown_result.all()
    }

    return AdminStudentProgressOut(
        generated_at=now,
        summary=AdminStudentProgressSummaryOut(
            total_students=total_students,
            active_students_7d=active_students_7d,
            students_with_progress=students_with_progress,
            completed_topic_items=completed_topic_items,
            total_watch_minutes=total_watch_seconds // 60,
            quiz_attempts=quiz_attempts,
            quiz_passed=quiz_passed,
            total_xp=total_xp,
        ),
        progress_by_status=progress_by_status,
        students=rows,
    )
