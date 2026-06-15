from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.courses import Exam, ExamProblem, Resource, Subject, Topic
from app.models.exam_bank import EXAM_PROBLEM_PART_STATUS_PUBLISHED, ExamProblemPart
from app.models.exam_progress import (
    EXAM_PROBLEM_PROGRESS_COMPLETED,
    EXAM_PROBLEM_PROGRESS_NOT_STARTED,
    EXAM_PROBLEM_PROGRESS_OPENED,
    UserExamProblemProgress,
)
from app.models.users import User
from app.schemas.exam_bank import (
    ExamBankExamOut,
    ExamBankListOut,
    ExamBankProblemDetailOut,
    ExamBankProblemOut,
    ExamProblemProgressIn,
    ExamProblemProgressOut,
    ExamProblemPartOut,
)
from app.services.access import AccessContext, AccessDecision, build_access_context
from app.services.course_access import apply_access_decision, redact_locked_resource, resource_out
from app.services.search import LIKE_ESCAPE, substring_search_pattern

EXAM_BANK_LIMIT = 50


async def list_exam_bank(
    db: AsyncSession,
    user: User,
    *,
    subject_id: int | None = None,
    topic_id: int | None = None,
    year: int | None = None,
    q: str = "",
    progress_status: str | None = None,
    saved: bool | None = None,
) -> ExamBankListOut:
    access_context = await build_access_context(db, user)
    user_id = int(user.id)
    exams = await _load_exams(
        db,
        user_id=user_id,
        subject_id=subject_id,
        topic_id=topic_id,
        year=year,
        q=q,
        progress_status=progress_status,
        saved=saved,
    )
    problem_map = await _load_problems_by_exam(
        db,
        [int(exam.id) for exam in exams],
        user_id=user_id,
        topic_id=topic_id,
        progress_status=progress_status,
        saved=saved,
    )
    problem_ids = [int(problem.id) for problems in problem_map.values() for problem in problems]
    progress_map = await _load_problem_progress(db, user_id=user_id, problem_ids=problem_ids)
    problem_topic_matched_ids = {
        int(problem.id)
        for problems in problem_map.values()
        for problem in problems
        if topic_id is None or problem.topic_id == topic_id
    }
    part_map = await _load_parts_by_problem(
        db,
        [int(problem.id) for problems in problem_map.values() for problem in problems],
        topic_id=topic_id,
        full_problem_ids=problem_topic_matched_ids,
    )
    items = [
        exam_bank_exam_out(
            exam,
            problems=problem_map.get(int(exam.id), []),
            part_map=part_map,
            progress_map=progress_map,
            access_context=access_context,
        )
        for exam in exams
    ]
    items = [item for item in items if item.problems]
    return ExamBankListOut(subject_id=subject_id, topic_id=topic_id, items=items, total=len(items))


async def get_exam_problem_detail(
    db: AsyncSession,
    user: User,
    *,
    problem_id: int,
) -> ExamBankProblemDetailOut | None:
    problem = await db.scalar(
        select(ExamProblem)
        .join(Exam, Exam.id == ExamProblem.exam_id)
        .join(Subject, Subject.id == Exam.subject_id)
        .outerjoin(Topic, Topic.id == ExamProblem.topic_id)
        .options(
            selectinload(ExamProblem.exam).selectinload(Exam.subject),
            selectinload(ExamProblem.video_resource),
        )
        .where(
            ExamProblem.id == problem_id,
            ExamProblem.status == "published",
            Exam.status == "published",
            Subject.is_published == True,  # noqa: E712
            or_(ExamProblem.topic_id.is_(None), Topic.status == "published"),
        )
    )
    if problem is None or problem.exam is None:
        return None
    parts = await _load_parts_by_problem(db, [int(problem.id)])
    progress_map = await _load_problem_progress(db, user_id=int(user.id), problem_ids=[int(problem.id)])
    access_context = await build_access_context(db, user)
    exam_access = _exam_access(access_context, problem.exam)
    problem_out = exam_bank_problem_out(
        problem,
        parts=parts.get(int(problem.id), []),
        access_context=access_context,
        exam_access=exam_access,
        subject_id=int(problem.exam.subject_id),
        progress=progress_map.get(int(problem.id)),
    )
    return ExamBankProblemDetailOut(
        **problem_out.model_dump(),
        exam_title=problem.exam.title,
        subject_id=int(problem.exam.subject_id),
        subject_title=problem.exam.subject.title if problem.exam.subject else "",
        year=int(problem.exam.year),
        session=problem.exam.session,
        created_at=None,
    )


def exam_bank_exam_out(
    exam: Exam,
    *,
    problems: list[ExamProblem],
    part_map: dict[int, list[ExamProblemPart]],
    progress_map: dict[int, UserExamProblemProgress],
    access_context: AccessContext,
) -> ExamBankExamOut:
    exam_access = _exam_access(access_context, exam)
    out = ExamBankExamOut(
        id=int(exam.id),
        subject_id=int(exam.subject_id),
        subject_title=exam.subject.title if exam.subject else "",
        title=exam.title,
        year=int(exam.year),
        session=exam.session,
        statement_url=exam.statement_url if exam_access.can_access else "",
        problems=[
            exam_bank_problem_out(
                problem,
                parts=part_map.get(int(problem.id), []),
                access_context=access_context,
                exam_access=exam_access,
                subject_id=int(exam.subject_id),
                progress=progress_map.get(int(problem.id)),
            )
            for problem in problems
        ],
    )
    return apply_access_decision(out, exam_access)


def exam_bank_problem_out(
    problem: ExamProblem,
    *,
    parts: list[ExamProblemPart],
    access_context: AccessContext,
    exam_access: AccessDecision,
    subject_id: int,
    progress: UserExamProblemProgress | None = None,
) -> ExamBankProblemOut:
    problem_access = access_context.decide_child(exam_access, problem, subject_id=subject_id)
    out = ExamBankProblemOut(
        id=int(problem.id),
        exam_id=int(problem.exam_id),
        topic_id=int(problem.topic_id) if problem.topic_id is not None else None,
        title=problem.title,
        statement=problem.statement if problem_access.can_access else "",
        written_solution=problem.written_solution if problem_access.can_access else "",
        written_solution_url=problem.written_solution_url if problem_access.can_access else "",
        difficulty=problem.difficulty,
        concept_slugs=list(problem.concept_slugs or []),
        video_resource=_resource_out(problem.video_resource, access_context, problem_access, subject_id),
        parts=[
            exam_problem_part_out(
                part,
                access_context=access_context,
                problem_access=problem_access,
                subject_id=subject_id,
            )
            for part in parts
        ],
        progress_status=_problem_progress_status(progress),
        saved=bool(progress.saved) if progress is not None else False,
    )
    return apply_access_decision(out, problem_access)


async def record_exam_problem_progress(
    db: AsyncSession,
    user: User,
    *,
    problem_id: int,
    body: ExamProblemProgressIn,
) -> ExamProblemProgressOut:
    problem = await get_exam_problem_detail(db, user, problem_id=problem_id)
    if problem is None:
        raise HTTPException(status_code=404, detail="Exam problem not found")
    if not problem.can_access:
        raise HTTPException(status_code=403, detail=problem.locked_reason or "subject_access_required")
    progress = await _get_or_create_problem_progress(db, user_id=int(user.id), problem_id=problem_id)
    now = datetime.now(timezone.utc)
    values = {UserExamProblemProgress.last_activity_at: now}
    if body.status is not None:
        if body.status == EXAM_PROBLEM_PROGRESS_COMPLETED:
            values.update({
                UserExamProblemProgress.status: EXAM_PROBLEM_PROGRESS_COMPLETED,
                UserExamProblemProgress.opened_at: func.coalesce(UserExamProblemProgress.opened_at, now),
                UserExamProblemProgress.completed_at: func.coalesce(UserExamProblemProgress.completed_at, now),
            })
        elif progress.status != EXAM_PROBLEM_PROGRESS_COMPLETED:
            values.update({
                UserExamProblemProgress.status: case(
                    (
                        UserExamProblemProgress.status != EXAM_PROBLEM_PROGRESS_COMPLETED,
                        EXAM_PROBLEM_PROGRESS_OPENED,
                    ),
                    else_=UserExamProblemProgress.status,
                ),
                UserExamProblemProgress.opened_at: func.coalesce(UserExamProblemProgress.opened_at, now),
            })
    if body.saved is not None:
        values[UserExamProblemProgress.saved] = bool(body.saved)
    await db.execute(
        update(UserExamProblemProgress)
        .where(UserExamProblemProgress.id == progress.id)
        .values(values)
    )
    await db.commit()
    await db.refresh(progress)
    return _problem_progress_out(progress)


def exam_problem_part_out(
    part: ExamProblemPart,
    *,
    access_context: AccessContext,
    problem_access: AccessDecision,
    subject_id: int,
) -> ExamProblemPartOut:
    part_access = access_context.decide_child(problem_access, part, subject_id=subject_id)
    out = ExamProblemPartOut(
        id=int(part.id),
        exam_problem_id=int(part.exam_problem_id),
        topic_id=int(part.topic_id) if part.topic_id is not None else None,
        video_resource_id=int(part.video_resource_id) if part.video_resource_id is not None else None,
        part_label=part.part_label,
        title=part.title,
        statement_body=part.statement_body if part_access.can_access else "",
        written_solution_body=part.written_solution_body if part_access.can_access else "",
        written_solution_url=part.written_solution_url if part_access.can_access else "",
        correction_video_url=part.correction_video_url if part_access.can_access else "",
        order=int(part.order or 0),
        difficulty=part.difficulty,
        concept_slugs=list(part.concept_slugs or []),
        metadata_json=part.metadata_json or {} if part_access.can_access else {},
        video_resource=_resource_out(part.video_resource, access_context, part_access, subject_id),
    )
    return apply_access_decision(out, part_access)


async def _load_problem_progress(
    db: AsyncSession,
    *,
    user_id: int,
    problem_ids: list[int],
) -> dict[int, UserExamProblemProgress]:
    if not problem_ids:
        return {}
    rows = (
        await db.execute(
            select(UserExamProblemProgress).where(
                UserExamProblemProgress.user_id == user_id,
                UserExamProblemProgress.exam_problem_id.in_(problem_ids),
            )
        )
    ).scalars().all()
    return {int(row.exam_problem_id): row for row in rows}


async def _get_or_create_problem_progress(
    db: AsyncSession,
    *,
    user_id: int,
    problem_id: int,
) -> UserExamProblemProgress:
    progress = await db.scalar(
        select(UserExamProblemProgress).where(
            UserExamProblemProgress.user_id == user_id,
            UserExamProblemProgress.exam_problem_id == problem_id,
        )
    )
    if progress is not None:
        return progress
    progress = UserExamProblemProgress(user_id=user_id, exam_problem_id=problem_id)
    db.add(progress)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        progress = await db.scalar(
            select(UserExamProblemProgress).where(
                UserExamProblemProgress.user_id == user_id,
                UserExamProblemProgress.exam_problem_id == problem_id,
            )
        )
        if progress is None:
            raise
    return progress


def _problem_progress_status(progress: UserExamProblemProgress | None) -> str:
    if progress is None:
        return EXAM_PROBLEM_PROGRESS_NOT_STARTED
    return progress.status or EXAM_PROBLEM_PROGRESS_NOT_STARTED


def _problem_progress_out(progress: UserExamProblemProgress) -> ExamProblemProgressOut:
    return ExamProblemProgressOut(
        exam_problem_id=int(progress.exam_problem_id),
        status=_problem_progress_status(progress),
        saved=bool(progress.saved),
        opened_at=progress.opened_at,
        completed_at=progress.completed_at,
        last_activity_at=progress.last_activity_at,
    )


async def _load_exams(
    db: AsyncSession,
    *,
    user_id: int,
    subject_id: int | None,
    topic_id: int | None,
    year: int | None,
    q: str,
    progress_status: str | None,
    saved: bool | None,
) -> list[Exam]:
    stmt = (
        select(Exam)
        .join(Subject, Subject.id == Exam.subject_id)
        .options(selectinload(Exam.subject))
        .where(Exam.status == "published", Subject.is_published == True)  # noqa: E712
        .order_by(Exam.year.desc(), Exam.id.desc())
        .limit(EXAM_BANK_LIMIT)
    )
    if subject_id is not None:
        stmt = stmt.where(Exam.subject_id == subject_id)
    if year is not None:
        stmt = stmt.where(Exam.year == year)
    if q:
        stmt = stmt.where(Exam.title.ilike(substring_search_pattern(q), escape=LIKE_ESCAPE))
    if topic_id is not None or progress_status is not None or saved is not None:
        stmt = stmt.where(
            _published_problem_match_exists(
                user_id=user_id,
                topic_id=topic_id,
                progress_status=progress_status,
                saved=saved,
            )
        )
    return list((await db.execute(stmt)).scalars().unique().all())


async def _load_problems_by_exam(
    db: AsyncSession,
    exam_ids: list[int],
    *,
    user_id: int,
    topic_id: int | None = None,
    progress_status: str | None = None,
    saved: bool | None = None,
) -> dict[int, list[ExamProblem]]:
    if not exam_ids:
        return {}
    stmt = (
        select(ExamProblem)
        .outerjoin(Topic, Topic.id == ExamProblem.topic_id)
        .options(selectinload(ExamProblem.video_resource))
        .where(
            ExamProblem.exam_id.in_(exam_ids),
            ExamProblem.status == "published",
            or_(ExamProblem.topic_id.is_(None), Topic.status == "published"),
        )
        .order_by(ExamProblem.exam_id, ExamProblem.order, ExamProblem.id)
    )
    if progress_status is not None or saved is not None:
        stmt = stmt.outerjoin(
            UserExamProblemProgress,
            and_(
                UserExamProblemProgress.exam_problem_id == ExamProblem.id,
                UserExamProblemProgress.user_id == user_id,
            ),
        ).where(*_problem_progress_filter_conditions(progress_status=progress_status, saved=saved))
    if topic_id is not None:
        stmt = stmt.where(
            or_(
                and_(ExamProblem.topic_id == topic_id, Topic.status == "published"),
                _published_part_topic_exists(topic_id),
            )
        )
    problems: dict[int, list[ExamProblem]] = {}
    for problem in (await db.execute(stmt)).scalars().unique().all():
        problems.setdefault(int(problem.exam_id), []).append(problem)
    return problems


async def _load_parts_by_problem(
    db: AsyncSession,
    problem_ids: list[int],
    *,
    topic_id: int | None = None,
    full_problem_ids: set[int] | None = None,
) -> dict[int, list[ExamProblemPart]]:
    if not problem_ids:
        return {}
    stmt = (
        select(ExamProblemPart)
        .outerjoin(Topic, Topic.id == ExamProblemPart.topic_id)
        .options(selectinload(ExamProblemPart.video_resource))
        .where(
            ExamProblemPart.exam_problem_id.in_(problem_ids),
            ExamProblemPart.status == EXAM_PROBLEM_PART_STATUS_PUBLISHED,
            or_(ExamProblemPart.topic_id.is_(None), Topic.status == "published"),
        )
        .order_by(ExamProblemPart.exam_problem_id, ExamProblemPart.order, ExamProblemPart.id)
    )
    if topic_id is not None:
        full_problem_ids = full_problem_ids or set()
        topic_conditions = [
            ExamProblemPart.topic_id == topic_id,
            ExamProblemPart.topic_id.is_(None),
        ]
        if full_problem_ids:
            topic_conditions.append(ExamProblemPart.exam_problem_id.in_(sorted(full_problem_ids)))
        stmt = stmt.where(or_(*topic_conditions))
    parts: dict[int, list[ExamProblemPart]] = {}
    for part in (await db.execute(stmt)).scalars().unique().all():
        parts.setdefault(int(part.exam_problem_id), []).append(part)
    return parts


def _published_problem_match_exists(
    *,
    user_id: int,
    topic_id: int | None,
    progress_status: str | None,
    saved: bool | None,
):
    problem_topic = aliased(Topic)
    stmt = (
        select(ExamProblem.id)
        .outerjoin(problem_topic, problem_topic.id == ExamProblem.topic_id)
        .outerjoin(
            UserExamProblemProgress,
            and_(
                UserExamProblemProgress.exam_problem_id == ExamProblem.id,
                UserExamProblemProgress.user_id == user_id,
            ),
        )
        .where(
            ExamProblem.exam_id == Exam.id,
            ExamProblem.status == "published",
            or_(ExamProblem.topic_id.is_(None), problem_topic.status == "published"),
        )
    )
    if topic_id is not None:
        stmt = stmt.where(
            or_(
                and_(ExamProblem.topic_id == topic_id, problem_topic.status == "published"),
                _published_part_topic_exists(topic_id),
            )
        )
    conditions = _problem_progress_filter_conditions(progress_status=progress_status, saved=saved)
    if conditions:
        stmt = stmt.where(*conditions)
    return stmt.exists()


def _problem_progress_filter_conditions(
    *,
    progress_status: str | None,
    saved: bool | None,
) -> list:
    conditions = []
    if progress_status == EXAM_PROBLEM_PROGRESS_NOT_STARTED:
        conditions.append(
            or_(
                UserExamProblemProgress.id.is_(None),
                UserExamProblemProgress.status == EXAM_PROBLEM_PROGRESS_NOT_STARTED,
            )
        )
    elif progress_status is not None:
        conditions.append(UserExamProblemProgress.status == progress_status)
    if saved is True:
        conditions.append(UserExamProblemProgress.saved == True)  # noqa: E712
    elif saved is False:
        conditions.append(
            or_(
                UserExamProblemProgress.id.is_(None),
                UserExamProblemProgress.saved == False,  # noqa: E712
            )
        )
    return conditions


def _published_part_topic_exists(topic_id: int):
    part_topic = aliased(Topic)
    return (
        select(ExamProblemPart.id)
        .outerjoin(part_topic, part_topic.id == ExamProblemPart.topic_id)
        .where(
            ExamProblemPart.exam_problem_id == ExamProblem.id,
            ExamProblemPart.status == EXAM_PROBLEM_PART_STATUS_PUBLISHED,
            ExamProblemPart.topic_id == topic_id,
            part_topic.status == "published",
        )
        .exists()
    )


def _exam_access(access_context: AccessContext, exam: Exam) -> AccessDecision:
    if int(exam.subject_id) not in access_context.active_subject_ids and not bool(exam.is_free_preview):
        return AccessDecision(
            can_access=False,
            reason="subject_access_required",
            required_subject_id=int(exam.subject_id),
            required_tier=getattr(exam, "required_tier", "") or "",
            required_feature_key=getattr(exam, "required_feature_key", "") or "",
            effective_tier=access_context.effective_tier,
            subject_scope_enforced=True,
        )
    return access_context.decide_for(exam, subject_id=int(exam.subject_id))


def _resource_out(
    resource: Resource | None,
    access_context: AccessContext,
    parent_access: AccessDecision,
    subject_id: int,
):
    if resource is None:
        return None
    out = resource_out(resource)
    access = access_context.decide_child(parent_access, resource, subject_id=subject_id)
    apply_access_decision(out, access)
    return redact_locked_resource(out)
