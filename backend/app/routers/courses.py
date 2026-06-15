import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.courses import Exam, ExamProblem, Subject, Topic, TopicItem
from app.models.gamification import TopicItemProgress
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.courses import (
    ExamOut,
    StreamOut,
    SubjectDetailOut,
    SubjectListOut,
    TabQuizAttemptSummaryOut,
    TabQuizResultOut,
    TabQuizSubmitIn,
    TopicCardOut,
    TopicItemCompleteIn,
    TopicWorkspaceOut,
)
from app.schemas.interactions import ResourceOpenIn, ResourceOpenOut
from app.schemas.limits import ShortText, StrictInputModel
from app.services.access import build_access_context
from app.services.course_access import exam_out, require_topic_item_primary_video_resource_access
from app.services.course_tab_quiz_submission import get_recent_tab_quiz_attempts
from app.services.course_tab_quiz_submission import submit_tab_quiz_attempt
from app.services.course_topic_mutations import complete_topic_item_state
from app.services.course_topic_read_models import build_topic_workspace, list_topic_cards
from app.services.interaction_mutations import open_topic_workspace_resource
from app.services.search import LIKE_ESCAPE, substring_search_pattern
from app.services.vdocipher import get_video_stream_data

router = APIRouter(tags=["Courses"])

COURSE_LIST_DEFAULT_LIMIT = 50
COURSE_LIST_MAX_LIMIT = 100
COURSE_ADMIN_MUTATION_RATE_LIMIT = "30/minute"
COURSE_PROGRESS_MUTATION_RATE_LIMIT = "30/minute"


class SubjectCreateIn(StrictInputModel):
    title: ShortText
    description: str = Field(default="", max_length=10_000)


class TopicCreateIn(StrictInputModel):
    subject_id: int
    title: ShortText
    description: str = Field(default="", max_length=10_000)
    order: int = 0


def _require_course_admin(user: User) -> None:
    if not (user.is_staff or user.role == "professor"):
        raise HTTPException(status_code=403, detail="Course admin access required")


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "topic"


async def _unique_topic_slug(db: AsyncSession, title: str, subject_id: int) -> str:
    base = f"{_slug(title)}-{subject_id}"
    slug = base
    suffix = 2
    existing_id = await db.scalar(select(Topic.id).where(Topic.slug == slug))
    while existing_id is not None:
        slug = f"{base}-{suffix}"
        suffix += 1
        existing_id = await db.scalar(select(Topic.id).where(Topic.slug == slug))
    return slug


@router.get("/subjects", response_model=list[SubjectListOut])
async def list_subjects(
    limit: int = Query(default=COURSE_LIST_DEFAULT_LIMIT, ge=1, le=COURSE_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    topic_counts = (
        select(Topic.subject_id, func.count(Topic.id).label("topic_count"))
        .where(Topic.status == "published")
        .group_by(Topic.subject_id)
        .subquery()
    )
    item_counts = (
        select(Topic.subject_id, func.count(TopicItem.id).label("item_count"))
        .join(TopicItem, TopicItem.topic_id == Topic.id)
        .where(Topic.status == "published", TopicItem.status == "published")
        .group_by(Topic.subject_id)
        .subquery()
    )
    rows = await db.execute(
        select(
            Subject,
            func.coalesce(topic_counts.c.topic_count, 0),
            func.coalesce(item_counts.c.item_count, 0),
        )
        .outerjoin(topic_counts, topic_counts.c.subject_id == Subject.id)
        .outerjoin(item_counts, item_counts.c.subject_id == Subject.id)
        .where(Subject.is_published == True)  # noqa: E712
        .order_by(Subject.order, Subject.title)
        .offset(offset)
        .limit(limit)
    )
    return [
        SubjectListOut(
            id=subject.id,
            title=subject.title,
            description=subject.description,
            thumbnail_url=subject.thumbnail_url,
            is_published=subject.is_published,
            order=subject.order,
            chapter_count=int(topic_count or 0),
            lesson_count=int(item_count or 0),
        )
        for subject, topic_count, item_count in rows.all()
    ]


@router.post("/subjects", response_model=SubjectDetailOut)
@limiter.limit(COURSE_ADMIN_MUTATION_RATE_LIMIT)
async def create_subject(
    request: Request,
    body: SubjectCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    _require_course_admin(user)
    subject = Subject(title=body.title, description=body.description, is_published=True)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return SubjectDetailOut.model_validate(subject)


@router.post("/topics", response_model=TopicCardOut)
@limiter.limit(COURSE_ADMIN_MUTATION_RATE_LIMIT)
async def create_topic(
    request: Request,
    body: TopicCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    _require_course_admin(user)
    subject = await db.scalar(select(Subject).where(Subject.id == body.subject_id))
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    for _ in range(5):
        topic = Topic(
            subject_id=subject.id,
            slug=await _unique_topic_slug(db, body.title, subject.id),
            title=body.title,
            description=body.description,
            status="published",
            order=body.order,
        )
        db.add(topic)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            continue
        await db.refresh(topic)
        access = (await build_access_context(db, user)).decide_for(topic, subject_id=subject.id)
        return TopicCardOut(
            id=topic.id,
            subject_id=subject.id,
            subject_title=subject.title,
            slug=topic.slug,
            title=topic.title,
            description=topic.description,
            is_free_preview=topic.is_free_preview,
            can_access=access.can_access,
            locked_reason=access.locked_reason,
            access_reason=access.reason,
            required_subject_id=access.required_subject_id,
            required_tier=access.required_tier,
            required_feature_key=access.required_feature_key,
        )
    raise HTTPException(status_code=409, detail="Topic slug already exists")


@router.get("/topics", response_model=list[TopicCardOut])
async def list_topics(
    subject_id: int | None = None,
    q: str = "",
    limit: int = Query(default=COURSE_LIST_DEFAULT_LIMIT, ge=1, le=COURSE_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_topic_cards(db, user=user, subject_id=subject_id, q=q, limit=limit, offset=offset)


@router.get("/subjects/{subject_id}/topics", response_model=list[TopicCardOut])
async def list_subject_topics(
    subject_id: int,
    limit: int = Query(default=COURSE_LIST_DEFAULT_LIMIT, ge=1, le=COURSE_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_topic_cards(db, user=user, subject_id=subject_id, limit=limit, offset=offset)


@router.get("/subjects/{subject_id}", response_model=SubjectDetailOut)
async def get_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    subject = await db.scalar(
        select(Subject).where(Subject.id == subject_id, Subject.is_published == True)  # noqa: E712
    )
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return SubjectDetailOut.model_validate(subject)


@router.get("/topics/{topic_id}/workspace", response_model=TopicWorkspaceOut)
async def get_topic_workspace(
    topic_id: int,
    item_id: int | None = None,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_topic_workspace(db, user=user, topic_id=topic_id, item_id=item_id, q=q)


@router.post("/topic-items/{item_id}/complete")
@limiter.limit(COURSE_PROGRESS_MUTATION_RATE_LIMIT)
async def complete_topic_item(
    request: Request,
    item_id: int,
    body: TopicItemCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await complete_topic_item_state(db, user=user, item_id=item_id, body=body)


@router.get("/topic-items/{item_id}/stream", response_model=StreamOut)
async def get_topic_item_stream(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    item, resource = await require_topic_item_primary_video_resource_access(db, user, item_id)
    progress = await db.scalar(
        select(TopicItemProgress).where(
            TopicItemProgress.user_id == user.id,
            TopicItemProgress.topic_id == item.topic_id,
            TopicItemProgress.topic_item_id == item.id,
        )
    )
    watched_seconds = max(0, int(progress.watched_seconds or 0)) if progress else 0
    resume_seconds = 0 if progress and progress.status == "completed" else watched_seconds
    user_id = user.id
    video_id = resource.provider_resource_id or resource.url
    await db.rollback()
    stream_data = await get_video_stream_data(video_id, settings, user_id=user_id)
    return {
        **stream_data,
        "watched_seconds": watched_seconds,
        "resume_seconds": resume_seconds,
    }


@router.post("/resources/{resource_id}/open", response_model=ResourceOpenOut)
@limiter.limit(COURSE_PROGRESS_MUTATION_RATE_LIMIT)
async def open_resource(
    request: Request,
    resource_id: int,
    body: ResourceOpenIn | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await open_topic_workspace_resource(db, user=user, resource_id=resource_id, body=body)


@router.get("/tabs/{tab_id}/quiz/attempts", response_model=list[TabQuizAttemptSummaryOut])
async def get_tab_quiz_attempts(
    tab_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_recent_tab_quiz_attempts(db, user=user, tab_id=tab_id)


@router.post("/tabs/{tab_id}/quiz/submit", response_model=TabQuizResultOut)
@limiter.limit("20/minute")
async def submit_tab_quiz(
    request: Request,
    tab_id: int,
    body: TabQuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await submit_tab_quiz_attempt(db, user=user, tab_id=tab_id, body=body)


@router.get("/exam-bank", response_model=list[ExamOut])
async def get_exam_bank(
    subject_id: int | None = None,
    topic_id: int | None = None,
    year: int | None = None,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Exam)
        .join(Subject, Subject.id == Exam.subject_id)
        .options(
            selectinload(Exam.subject),
            selectinload(Exam.problems).selectinload(ExamProblem.video_resource),
        )
        .where(Exam.status == "published", Subject.is_published == True)  # noqa: E712
        .order_by(Exam.year.desc(), Exam.id.desc())
    )
    if subject_id is not None:
        stmt = stmt.where(Exam.subject_id == subject_id)
    if year is not None:
        stmt = stmt.where(Exam.year == year)
    if q:
        stmt = stmt.where(Exam.title.ilike(substring_search_pattern(q), escape=LIKE_ESCAPE))
    exams = (await db.execute(stmt.limit(50))).scalars().unique().all()
    access_context = await build_access_context(db, user)
    output: list[ExamOut] = []
    for exam in exams:
        problems = [problem for problem in exam.problems if problem.status == "published"]
        if topic_id is not None:
            problems = [problem for problem in problems if problem.topic_id == topic_id]
            if not problems:
                continue
        output.append(exam_out(exam, problems, access_context))
    return output
