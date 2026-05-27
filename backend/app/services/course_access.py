from fastapi import HTTPException
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import (
    ChapterSection,
    Exam,
    ExamProblem,
    Lesson,
    Resource,
    TabContent,
    Topic,
    TopicItem,
)
from app.models.gamification import TopicItemProgress
from app.models.users import User
from app.schemas.courses import ChapterSectionOut, ExamOut, ExamProblemOut, ResourceOut, TabContentOut, TopicItemOut
from app.services.access import AccessContext, AccessDecision, build_access_context


def _loaded_relationship(obj, name: str):
    return None if name in inspect(obj).unloaded else getattr(obj, name)


def apply_access_decision(out, decision: AccessDecision):
    out.can_access = decision.can_access
    out.locked_reason = decision.locked_reason
    out.required_tier = decision.required_tier
    out.required_feature_key = decision.required_feature_key
    if hasattr(out, "required_subject_id"):
        out.required_subject_id = decision.required_subject_id
    if hasattr(out, "access_reason"):
        out.access_reason = decision.reason
    return out


def redact_locked_resource(out: ResourceOut) -> ResourceOut:
    if not out.can_access:
        out.provider_resource_id = ""
        out.url = ""
        out.metadata_json = {}
    return out


def redact_locked_tab(out: TabContentOut) -> TabContentOut:
    if not out.can_access:
        out.content = ""
        out.config_json = {}
    return out


def redact_locked_exam_problem(out: ExamProblemOut) -> ExamProblemOut:
    if not out.can_access:
        out.written_solution = ""
        out.written_solution_url = ""
    return out


def store_access_decision(target: dict[int, AccessDecision], key: int, decision: AccessDecision) -> None:
    current = target.get(key)
    if current is None or (decision.can_access and not current.can_access):
        target[key] = decision


async def access_for_topic_item(db: AsyncSession, user: User, item: TopicItem) -> AccessDecision:
    topic = _loaded_relationship(item, "topic")
    if topic is None:
        topic = await db.scalar(select(Topic).where(Topic.id == item.topic_id))
    access_context = await build_access_context(db, user)
    if topic is None:
        return access_context.decide_for(item)
    topic_access = access_context.decide_for(topic, subject_id=topic.subject_id)
    return access_context.decide_child(topic_access, item, subject_id=topic.subject_id)


async def access_for_tab(db: AsyncSession, user: User, tab: TabContent) -> AccessDecision:
    item = _loaded_relationship(tab, "topic_item")
    if item is None:
        item = await db.scalar(
            select(TopicItem)
            .options(selectinload(TopicItem.topic))
            .where(TopicItem.id == tab.topic_item_id)
        )
    access_context = await build_access_context(db, user)
    if item is None:
        return access_context.decide_for(tab)
    topic = _loaded_relationship(item, "topic")
    if topic is None:
        topic = await db.scalar(select(Topic).where(Topic.id == item.topic_id))
    if topic is None:
        item_access = access_context.decide_for(item)
        return access_context.decide_child(item_access, tab)
    topic_access = access_context.decide_for(topic, subject_id=topic.subject_id)
    item_access = access_context.decide_child(topic_access, item, subject_id=topic.subject_id)
    return access_context.decide_child(item_access, tab, subject_id=topic.subject_id)


def resource_out(resource: Resource, resource_access: dict[int, AccessDecision] | None = None) -> ResourceOut:
    out = ResourceOut.model_validate(resource)
    access = resource_access.get(resource.id) if resource_access else None
    if access:
        apply_access_decision(out, access)
        redact_locked_resource(out)
    return out


def tab_content_out(
    tab: TabContent,
    tab_access: dict[int, AccessDecision] | None = None,
    resource_access: dict[int, AccessDecision] | None = None,
) -> TabContentOut:
    out = TabContentOut.model_validate(tab)
    access = tab_access.get(tab.id) if tab_access else None
    if access:
        apply_access_decision(out, access)
    if out.resource and resource_access:
        resource_decision = resource_access.get(out.resource.id)
        if resource_decision:
            apply_access_decision(out.resource, resource_decision)
            redact_locked_resource(out.resource)
    if access:
        redact_locked_tab(out)
    return out


def topic_item_out(
    item: TopicItem,
    progress_by_item: dict[int, TopicItemProgress],
    item_access: dict[int, AccessDecision] | None = None,
    tab_access: dict[int, AccessDecision] | None = None,
    resource_access: dict[int, AccessDecision] | None = None,
) -> TopicItemOut:
    progress = progress_by_item.get(item.id)
    access = item_access.get(item.id) if item_access else None
    out = TopicItemOut(
        id=item.id,
        topic_id=item.topic_id,
        section_id=item.section_id,
        title=item.title,
        description=item.description,
        item_type=item.item_type,
        renderer_key=item.renderer_key,
        duration_seconds=item.duration_seconds,
        order=item.order,
        completion_policy=item.completion_policy,
        is_free_preview=item.is_free_preview,
        concept_slugs=item.concept_slugs or [],
        primary_resource=resource_out(item.primary_resource, resource_access) if item.primary_resource else None,
        tabs=[tab_content_out(t, tab_access, resource_access) for t in item.tabs if t.status == "published"],
        progress_status=progress.status if progress else "not_started",
        best_score=progress.best_score if progress else None,
    )
    if access:
        apply_access_decision(out, access)
    return out


def exam_problem_out(
    problem: ExamProblem,
    access_context: AccessContext,
    exam_access: AccessDecision,
    *,
    subject_id: int | None = None,
) -> ExamProblemOut:
    problem_access = access_context.decide_child(exam_access, problem, subject_id=subject_id)
    out = ExamProblemOut.model_validate(problem)
    apply_access_decision(out, problem_access)
    redact_locked_exam_problem(out)
    if out.video_resource:
        video_access = access_context.decide_child(problem_access, problem.video_resource, subject_id=subject_id)
        apply_access_decision(out.video_resource, video_access)
        redact_locked_resource(out.video_resource)
    return out


def exam_out(exam: Exam, problems: list[ExamProblem], access_context: AccessContext) -> ExamOut:
    exam_access = access_context.decide_for(exam, subject_id=exam.subject_id)
    return ExamOut(
        id=exam.id,
        subject_id=exam.subject_id,
        subject_title=exam.subject.title if exam.subject else "",
        title=exam.title,
        year=exam.year,
        session=exam.session,
        statement_url=exam.statement_url,
        can_access=exam_access.can_access,
        locked_reason=exam_access.locked_reason,
        access_reason=exam_access.reason,
        required_subject_id=exam_access.required_subject_id,
        required_tier=exam_access.required_tier,
        required_feature_key=exam_access.required_feature_key,
        problems=[
            exam_problem_out(problem, access_context, exam_access, subject_id=exam.subject_id)
            for problem in problems
        ],
    )


def chapter_section_out(
    section: ChapterSection,
    access_context: AccessContext,
    *,
    fallback_subject_id: int | None = None,
) -> ChapterSectionOut:
    subject_id = fallback_subject_id
    if subject_id is None and section.chapter:
        subject_id = section.chapter.subject_id
    access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
    return ChapterSectionOut(
        id=section.id,
        title=section.title,
        section_type=section.section_type,
        order=section.order,
        is_gating=section.is_gating,
        is_free_preview=section.is_free_preview,
        vdocipher_id=section.vdocipher_id if access.can_access else "",
        duration_seconds=section.duration_seconds,
        content=section.content if access.can_access else "",
        quiz_data=section.quiz_data if access.can_access else None,
        pass_score=section.pass_score,
        activity_type=section.activity_type,
        activity_data=section.activity_data if access.can_access else None,
        chapter_id=section.chapter_id,
    )


async def require_lesson_access(
    db: AsyncSession,
    user: User,
    lesson_id: int,
    *,
    fallback_required_tier: str = "pro",
) -> Lesson:
    lesson = await db.scalar(
        select(Lesson)
        .options(selectinload(Lesson.chapter))
        .where(Lesson.id == lesson_id)
    )
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    access_context = await build_access_context(db, user)
    subject_id = lesson.chapter.subject_id if lesson.chapter else None
    access = access_context.decide_for(
        lesson,
        subject_id=subject_id,
        fallback_required_tier=fallback_required_tier,
    )
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return lesson
