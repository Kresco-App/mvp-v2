from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, with_loader_criteria

from app.models.courses import Subject, Topic
from app.models.exercises import (
    EXERCISE_SELF_GRADE_NOT_STARTED,
    EXERCISE_SELF_GRADE_MASTERED,
    EXERCISE_STATUS_PUBLISHED,
    Exercise,
    UserExerciseProgress,
)
from app.models.users import User
from app.schemas.exercises import ExerciseAssetOut, ExerciseBankListOut, ExerciseDetailOut, ExerciseListItemOut
from app.services.access import AccessContext, AccessDecision, build_access_context
from app.services.course_access import apply_access_decision
from app.services.search import LIKE_ESCAPE, normalize_substring_search, substring_search_pattern
from app.services.xp import award_xp

MAX_EXERCISE_BANK_LIMIT = 100
EXERCISE_MASTERY_XP = 5


async def list_exercise_bank_items(
    db: AsyncSession,
    user: User,
    *,
    subject_id: int,
    topic_id: int | None = None,
    difficulty: str | None = None,
    self_grade: str | None = None,
    saved: bool | None = None,
    concept: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> ExerciseBankListOut:
    access_context = await build_access_context(db, user)
    progress_join = _progress_join(user_id=int(user.id))
    stmt = (
        select(Exercise)
        .join(Subject, Subject.id == Exercise.subject_id)
        .outerjoin(Topic, Topic.id == Exercise.topic_id)
        .outerjoin(UserExerciseProgress, progress_join)
        .options(
            selectinload(Exercise.assets),
            selectinload(Exercise.progress_records),
            with_loader_criteria(
                UserExerciseProgress,
                UserExerciseProgress.user_id == int(user.id),
                include_aliases=True,
            ),
        )
        .where(
            Exercise.subject_id == subject_id,
            Exercise.status == EXERCISE_STATUS_PUBLISHED,
            Subject.is_published == True,  # noqa: E712
            or_(Exercise.topic_id.is_(None), Topic.status == "published"),
        )
        .order_by(Exercise.order, Exercise.id)
        .offset(max(0, int(offset)))
        .limit(max(1, min(int(limit), MAX_EXERCISE_BANK_LIMIT)))
    )
    count_stmt = (
        select(func.count())
        .select_from(Exercise)
        .join(Subject, Subject.id == Exercise.subject_id)
        .outerjoin(Topic, Topic.id == Exercise.topic_id)
        .outerjoin(UserExerciseProgress, progress_join)
        .where(
            Exercise.subject_id == subject_id,
            Exercise.status == EXERCISE_STATUS_PUBLISHED,
            Subject.is_published == True,  # noqa: E712
            or_(Exercise.topic_id.is_(None), Topic.status == "published"),
        )
    )
    stmt, count_stmt = _apply_exercise_filters(
        stmt,
        count_stmt,
        topic_id=topic_id,
        difficulty=difficulty,
        self_grade=self_grade,
        saved=saved,
        concept=concept,
    )
    exercises = list((await db.execute(stmt)).scalars().unique().all())
    total = int(await db.scalar(count_stmt) or 0)
    return ExerciseBankListOut(
        subject_id=subject_id,
        topic_id=topic_id,
        items=[
            exercise_list_item_out(
                exercise,
                access=_exercise_access(access_context, exercise),
                progress=_progress_for_user(exercise, int(user.id)),
            )
            for exercise in exercises
        ],
        total=total,
    )


async def get_exercise_detail(
    db: AsyncSession,
    user: User,
    *,
    exercise_id: int,
) -> ExerciseDetailOut | None:
    exercise = await db.scalar(
        select(Exercise)
        .join(Subject, Subject.id == Exercise.subject_id)
        .outerjoin(Topic, Topic.id == Exercise.topic_id)
        .options(
            selectinload(Exercise.assets),
            selectinload(Exercise.progress_records),
            with_loader_criteria(
                UserExerciseProgress,
                UserExerciseProgress.user_id == int(user.id),
                include_aliases=True,
            ),
        )
        .where(
            Exercise.id == exercise_id,
            Exercise.status == EXERCISE_STATUS_PUBLISHED,
            Subject.is_published == True,  # noqa: E712
            or_(Exercise.topic_id.is_(None), Topic.status == "published"),
        )
    )
    if exercise is None:
        return None
    access_context = await build_access_context(db, user)
    return exercise_detail_out(
        exercise,
        access=_exercise_access(access_context, exercise),
        progress=_progress_for_user(exercise, int(user.id)),
        can_save_notes=int(exercise.subject_id) in access_context.active_subject_ids,
    )


async def reveal_exercise_solution(
    db: AsyncSession,
    user: User,
    *,
    exercise_id: int,
) -> ExerciseDetailOut:
    exercise, access, access_context = await _load_accessible_exercise_for_mutation(db, user, exercise_id=exercise_id)
    progress = await _get_or_create_progress(db, user_id=int(user.id), exercise_id=int(exercise.id))
    now = datetime.now(timezone.utc)
    progress.reveal_count = int(progress.reveal_count or 0) + 1
    progress.last_revealed_at = now
    if progress.first_revealed_at is None:
        progress.first_revealed_at = now
    await db.commit()
    await db.refresh(progress)
    return exercise_detail_out(
        exercise,
        access=access,
        progress=progress,
        can_save_notes=int(exercise.subject_id) in access_context.active_subject_ids,
    )


async def update_exercise_saved(
    db: AsyncSession,
    user: User,
    *,
    exercise_id: int,
    saved: bool,
) -> ExerciseDetailOut:
    exercise, access, access_context = await _load_accessible_exercise_for_mutation(db, user, exercise_id=exercise_id)
    progress = await _get_or_create_progress(db, user_id=int(user.id), exercise_id=int(exercise.id))
    progress.saved = bool(saved)
    await db.commit()
    await db.refresh(progress)
    return exercise_detail_out(
        exercise,
        access=access,
        progress=progress,
        can_save_notes=int(exercise.subject_id) in access_context.active_subject_ids,
    )


async def update_exercise_notes(
    db: AsyncSession,
    user: User,
    *,
    exercise_id: int,
    notes: str,
) -> ExerciseDetailOut:
    exercise, access, access_context = await _load_accessible_exercise_for_mutation(db, user, exercise_id=exercise_id)
    if int(exercise.subject_id) not in access_context.active_subject_ids:
        raise HTTPException(status_code=403, detail="subject_access_required")
    progress = await _get_or_create_progress(db, user_id=int(user.id), exercise_id=int(exercise.id))
    progress.notes = notes.strip()
    await db.commit()
    await db.refresh(progress)
    return exercise_detail_out(exercise, access=access, progress=progress, can_save_notes=True)


async def update_exercise_self_grade(
    db: AsyncSession,
    user: User,
    *,
    exercise_id: int,
    self_grade: str,
) -> tuple[ExerciseDetailOut, int]:
    exercise, access, access_context = await _load_accessible_exercise_for_mutation(db, user, exercise_id=exercise_id)
    progress = await _get_or_create_progress(db, user_id=int(user.id), exercise_id=int(exercise.id))
    if int(progress.reveal_count or 0) <= 0:
        raise HTTPException(status_code=409, detail="Exercise correction must be revealed before self-grading")
    normalized_grade = self_grade.strip().lower()
    now = datetime.now(timezone.utc)
    history = list(progress.self_grade_history_json or [])
    previous_grade = progress.current_self_grade or EXERCISE_SELF_GRADE_NOT_STARTED
    history.append({
        "self_grade": normalized_grade,
        "previous_self_grade": previous_grade,
        "graded_at": now.isoformat(),
    })
    progress.current_self_grade = normalized_grade
    progress.self_grade_history_json = history
    xp_awarded = 0
    if normalized_grade == EXERCISE_SELF_GRADE_MASTERED:
        xp_awarded = await award_xp(
            int(user.id),
            "exercise_mastered",
            f"Exercise {exercise.id} mastered",
            db,
            subject_id=int(exercise.subject_id),
            topic_id=int(exercise.topic_id) if exercise.topic_id is not None else None,
            idempotency_key=f"exercise-mastered:user:{user.id}:exercise:{exercise.id}",
            amount_override=EXERCISE_MASTERY_XP,
        )
    await db.commit()
    await db.refresh(progress)
    return exercise_detail_out(
        exercise,
        access=access,
        progress=progress,
        can_save_notes=int(exercise.subject_id) in access_context.active_subject_ids,
    ), xp_awarded


def exercise_list_item_out(
    exercise: Exercise,
    *,
    access: AccessDecision,
    progress: UserExerciseProgress | None,
) -> ExerciseListItemOut:
    out = ExerciseListItemOut(
        id=int(exercise.id),
        subject_id=int(exercise.subject_id),
        topic_id=int(exercise.topic_id) if exercise.topic_id is not None else None,
        title=exercise.title,
        slug=exercise.slug,
        summary=exercise.summary,
        difficulty=exercise.difficulty,
        estimated_minutes=int(exercise.estimated_minutes or 0),
        order=int(exercise.order or 0),
        concept_slugs=list(exercise.concept_slugs or []),
        is_free_preview=bool(exercise.is_free_preview),
        self_grade=_self_grade(progress),
        saved=bool(progress.saved) if progress is not None else False,
        has_solution_body=bool((exercise.solution_body or "").strip()),
        has_solution_video=bool((exercise.solution_video_url or "").strip()),
        asset_count=len(exercise.assets or []),
        created_at=exercise.created_at,
        updated_at=exercise.updated_at,
    )
    return apply_access_decision(out, access)


def exercise_detail_out(
    exercise: Exercise,
    *,
    access: AccessDecision,
    progress: UserExerciseProgress | None,
    can_save_notes: bool = False,
) -> ExerciseDetailOut:
    base = exercise_list_item_out(exercise, access=access, progress=progress)
    out = ExerciseDetailOut(
        **base.model_dump(),
        statement_body=exercise.statement_body if access.can_access else "",
        solution_body=exercise.solution_body if access.can_access else "",
        solution_video_url=exercise.solution_video_url if access.can_access else "",
        assets=[ExerciseAssetOut.model_validate(asset) for asset in exercise.assets] if access.can_access else [],
        reveal_count=int(progress.reveal_count or 0) if progress is not None else 0,
        first_revealed_at=progress.first_revealed_at if progress is not None else None,
        last_revealed_at=progress.last_revealed_at if progress is not None else None,
        self_grade_history=list(progress.self_grade_history_json or []) if progress is not None else [],
        notes=progress.notes if progress is not None else "",
        can_save_notes=can_save_notes,
        metadata_json=exercise.metadata_json or {} if access.can_access else {},
    )
    return out


def _apply_exercise_filters(stmt, count_stmt, **filters):
    conditions = []
    topic_id = filters["topic_id"]
    difficulty = _normalize_filter(filters["difficulty"])
    self_grade = _normalize_filter(filters["self_grade"])
    saved = filters["saved"]
    concept = normalize_substring_search(filters["concept"])

    if topic_id is not None:
        conditions.append(Exercise.topic_id == topic_id)
    if difficulty:
        conditions.append(Exercise.difficulty == difficulty)
    if self_grade:
        if self_grade == EXERCISE_SELF_GRADE_NOT_STARTED:
            conditions.append(
                or_(
                    UserExerciseProgress.id.is_(None),
                    UserExerciseProgress.current_self_grade == EXERCISE_SELF_GRADE_NOT_STARTED,
                )
            )
        else:
            conditions.append(UserExerciseProgress.current_self_grade == self_grade)
    if saved is not None:
        if saved:
            conditions.append(UserExerciseProgress.saved.is_(True))
        else:
            conditions.append(or_(UserExerciseProgress.id.is_(None), UserExerciseProgress.saved.is_(False)))
    if concept:
        conditions.append(cast(Exercise.concept_slugs, String).ilike(substring_search_pattern(concept), escape=LIKE_ESCAPE))

    for condition in conditions:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    return stmt, count_stmt


def _progress_join(*, user_id: int):
    return and_(
        UserExerciseProgress.exercise_id == Exercise.id,
        UserExerciseProgress.user_id == user_id,
    )


async def _load_accessible_exercise_for_mutation(
    db: AsyncSession,
    user: User,
    *,
    exercise_id: int,
) -> tuple[Exercise, AccessDecision, AccessContext]:
    exercise = await db.scalar(
        select(Exercise)
        .join(Subject, Subject.id == Exercise.subject_id)
        .outerjoin(Topic, Topic.id == Exercise.topic_id)
        .options(selectinload(Exercise.assets))
        .where(
            Exercise.id == exercise_id,
            Exercise.status == EXERCISE_STATUS_PUBLISHED,
            Subject.is_published == True,  # noqa: E712
            or_(Exercise.topic_id.is_(None), Topic.status == "published"),
        )
        .with_for_update(of=Exercise)
    )
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    access_context = await build_access_context(db, user)
    access = _exercise_access(access_context, exercise)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return exercise, access, access_context


async def _get_or_create_progress(
    db: AsyncSession,
    *,
    user_id: int,
    exercise_id: int,
) -> UserExerciseProgress:
    progress = await db.scalar(
        select(UserExerciseProgress)
        .where(
            UserExerciseProgress.user_id == user_id,
            UserExerciseProgress.exercise_id == exercise_id,
        )
        .with_for_update()
    )
    if progress is not None:
        return progress

    progress = UserExerciseProgress(user_id=user_id, exercise_id=exercise_id)
    try:
        async with db.begin_nested():
            db.add(progress)
            await db.flush()
    except IntegrityError:
        progress = await db.scalar(
            select(UserExerciseProgress)
            .where(
                UserExerciseProgress.user_id == user_id,
                UserExerciseProgress.exercise_id == exercise_id,
            )
            .with_for_update()
        )
        if progress is None:
            raise
    return progress


def _exercise_access(access_context: AccessContext, exercise: Exercise) -> AccessDecision:
    if (
        int(exercise.subject_id) not in access_context.active_subject_ids
        and not bool(exercise.is_free_preview)
    ):
        return AccessDecision(
            can_access=False,
            reason="subject_access_required",
            required_subject_id=int(exercise.subject_id),
            required_tier=getattr(exercise, "required_tier", "") or "",
            required_feature_key=getattr(exercise, "required_feature_key", "") or "",
            effective_tier=access_context.effective_tier,
            subject_scope_enforced=True,
        )
    return access_context.decide_for(exercise, subject_id=int(exercise.subject_id))


def _progress_for_user(exercise: Exercise, user_id: int) -> UserExerciseProgress | None:
    return next(
        (progress for progress in exercise.progress_records if int(progress.user_id) == user_id),
        None,
    )


def _self_grade(progress: UserExerciseProgress | None) -> str:
    if progress is None:
        return EXERCISE_SELF_GRADE_NOT_STARTED
    return progress.current_self_grade or EXERCISE_SELF_GRADE_NOT_STARTED


def _normalize_filter(value: str | None) -> str:
    return (value or "").strip().lower()
