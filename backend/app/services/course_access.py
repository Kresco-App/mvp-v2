import copy

from fastapi import HTTPException
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import (
    Exam,
    ExamProblem,
    Resource,
    TabContent,
    Topic,
    TopicItem,
)
from app.models.gamification import TopicItemProgress
from app.models.users import User
from app.schemas.courses import ExamOut, ExamProblemOut, ResourceOut, TabContentOut, TopicItemOut
from app.services.access import AccessContext, AccessDecision, build_access_context

ORPHANED_PARENT_ACCESS_DECISION = AccessDecision(can_access=False, reason="parent_not_found")
QUIZ_SECRET_CONFIG_KEYS = {
    "acceptedAnswers",
    "accepted_answers",
    "answer",
    "answerRegion",
    "answers",
    "correct",
    "correctAnswer",
    "correctAnswers",
    "correctIndex",
    "correct_answer",
    "correct_answers",
    "correct_index",
    "is_correct",
}


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


def scrub_quiz_config(config: dict | None) -> dict | None:
    if not isinstance(config, dict):
        return config
    scrubbed = copy.deepcopy(config)
    questions = scrubbed.get("questions")
    if isinstance(questions, list):
        scrubbed["questions"] = [
            _scrub_quiz_question(question)
            for question in questions
            if isinstance(question, dict)
        ]
    return scrubbed


def _scrub_quiz_question(question: dict) -> dict:
    raw_answer = question.get("answer")
    question_type = str(question.get("type") or "").strip()
    scrubbed = {
        key: _scrub_quiz_value(value)
        for key, value in question.items()
        if key not in QUIZ_SECRET_CONFIG_KEYS
    }

    if question_type == "matching" and "pairs" not in scrubbed and isinstance(raw_answer, dict):
        scrubbed["pairs"] = [{"left": str(left)} for left in raw_answer]

    if question_type == "drag_and_drop" and isinstance(raw_answer, dict):
        if "items" not in scrubbed:
            scrubbed["items"] = [{"id": str(item), "label": str(item)} for item in raw_answer]
        if "zones" not in scrubbed:
            scrubbed["zones"] = sorted({str(zone) for zone in raw_answer.values()})

    if question_type == "ordering" and "items" not in scrubbed and isinstance(raw_answer, list):
        scrubbed["items"] = sorted({str(item) for item in raw_answer})

    return scrubbed


def _scrub_quiz_value(value):
    if isinstance(value, dict):
        return {
            key: _scrub_quiz_value(item)
            for key, item in value.items()
            if key not in QUIZ_SECRET_CONFIG_KEYS
        }
    if isinstance(value, list):
        return [_scrub_quiz_value(item) for item in value]
    return value


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
        return ORPHANED_PARENT_ACCESS_DECISION
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
        return ORPHANED_PARENT_ACCESS_DECISION
    topic = _loaded_relationship(item, "topic")
    if topic is None:
        topic = await db.scalar(select(Topic).where(Topic.id == item.topic_id))
    if topic is None:
        return ORPHANED_PARENT_ACCESS_DECISION
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
    if str(out.tab_type).strip().lower() == "quiz":
        out.config_json = scrub_quiz_config(out.config_json) or {}
    if out.resource and resource_access:
        resource_decision = resource_access.get(out.resource.id)
        if resource_decision:
            apply_access_decision(out.resource, resource_decision)
            redact_locked_resource(out.resource)
    if access:
        redact_locked_tab(out)
    return out


def _primary_tab_for_item(item: TopicItem) -> TabContent | None:
    published_tabs = [tab for tab in item.tabs if tab.status == "published"]
    if not published_tabs:
        return None

    primary_tab_content_id = getattr(item, "primary_tab_content_id", None)
    if primary_tab_content_id:
        primary = next((tab for tab in published_tabs if tab.id == primary_tab_content_id), None)
        if primary is not None:
            return primary

    primary_resource_id = getattr(item, "primary_resource_id", None)
    if primary_resource_id:
        primary = next((tab for tab in published_tabs if getattr(tab, "resource_id", None) == primary_resource_id), None)
        if primary is not None:
            return primary

    return next((tab for tab in published_tabs if tab.tab_type.lower() not in {"comments", "discussion"}), None)


def topic_item_out(
    item: TopicItem,
    progress_by_item: dict[int, TopicItemProgress],
    item_access: dict[int, AccessDecision] | None = None,
    tab_access: dict[int, AccessDecision] | None = None,
    resource_access: dict[int, AccessDecision] | None = None,
) -> TopicItemOut:
    progress = progress_by_item.get(item.id)
    access = item_access.get(item.id) if item_access else None
    primary_tab = _primary_tab_for_item(item)
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
        primary_tab_content_id=primary_tab.id if primary_tab else getattr(item, "primary_tab_content_id", None),
        primary_tab=tab_content_out(primary_tab, tab_access, resource_access) if primary_tab else None,
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


def _scrub_quiz_data(quiz_data: dict | None) -> dict | None:
    return scrub_quiz_config(quiz_data)

async def require_topic_item_access(
    db: AsyncSession,
    user: User,
    topic_item_id: int,
) -> TopicItem:
    """Raise 404/403 if the user cannot access the given topic item."""
    item = await db.scalar(
        select(TopicItem)
        .options(selectinload(TopicItem.topic))
        .where(TopicItem.id == topic_item_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")
    decision = await access_for_topic_item(db, user, item)
    if not decision.can_access:
        raise HTTPException(status_code=403, detail=decision.locked_reason)
    return item
