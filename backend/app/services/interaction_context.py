from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Exam, ExamProblem, Resource, TabContent, Topic, TopicItem
from app.models.exercises import Exercise
from app.models.quizzes import Question, QuestionSet


InteractionContext = dict[str, int | None]


def _merge_context(base: InteractionContext, patch: InteractionContext) -> InteractionContext:
    keys = set(base) | set(patch)
    merged: InteractionContext = {}
    for key in keys:
        base_value = base.get(key)
        patch_value = patch.get(key)
        if base_value is not None and patch_value is not None and int(base_value) != int(patch_value):
            raise HTTPException(status_code=400, detail="Interaction context parent IDs conflict")
        merged[key] = base_value if base_value is not None else patch_value
    return merged


async def _context_from_topic(db: AsyncSession, topic_id: int) -> InteractionContext:
    result = await db.execute(select(Topic.subject_id).where(Topic.id == topic_id))
    subject_id = result.scalar_one_or_none()
    return {"subject_id": int(subject_id) if subject_id is not None else None, "topic_id": topic_id}


async def _context_from_topic_item(db: AsyncSession, topic_item_id: int) -> InteractionContext:
    result = await db.execute(
        select(TopicItem.topic_id, Topic.subject_id)
        .join(Topic, Topic.id == TopicItem.topic_id)
        .where(TopicItem.id == topic_item_id)
    )
    row = result.one_or_none()
    if row is None:
        return {"subject_id": None, "topic_id": None, "topic_item_id": topic_item_id}
    topic_id, subject_id = row
    return {"subject_id": int(subject_id), "topic_id": int(topic_id), "topic_item_id": topic_item_id}


async def _context_from_tab_content(db: AsyncSession, tab_content_id: int) -> InteractionContext:
    result = await db.execute(
        select(TabContent.topic_item_id, TopicItem.topic_id, Topic.subject_id)
        .join(TopicItem, TopicItem.id == TabContent.topic_item_id)
        .join(Topic, Topic.id == TopicItem.topic_id)
        .where(TabContent.id == tab_content_id)
    )
    row = result.one_or_none()
    if row is None:
        return {"subject_id": None, "topic_id": None, "topic_item_id": None, "tab_content_id": tab_content_id}
    topic_item_id, topic_id, subject_id = row
    return {
        "subject_id": int(subject_id),
        "topic_id": int(topic_id),
        "topic_item_id": int(topic_item_id),
        "tab_content_id": tab_content_id,
    }


async def _context_from_resource(db: AsyncSession, resource_id: int) -> InteractionContext:
    result = await db.execute(
        select(Resource.topic_id, Topic.subject_id)
        .outerjoin(Topic, Topic.id == Resource.topic_id)
        .where(Resource.id == resource_id)
    )
    row = result.one_or_none()
    if row is None:
        return {"subject_id": None, "topic_id": None}

    topic_id, subject_id = row
    context: InteractionContext = {
        "subject_id": int(subject_id) if subject_id is not None else None,
        "topic_id": int(topic_id) if topic_id is not None else None,
    }

    item_result = await db.execute(
        select(TopicItem.id)
        .where(TopicItem.primary_resource_id == resource_id)
        .order_by(TopicItem.order, TopicItem.id)
        .limit(1)
    )
    topic_item_id = item_result.scalar_one_or_none()
    if topic_item_id is not None:
        context["topic_item_id"] = int(topic_item_id)
    return context


async def _context_from_exam_problem(db: AsyncSession, problem_id: int) -> InteractionContext:
    result = await db.execute(
        select(ExamProblem.topic_id, Exam.subject_id)
        .join(Exam, Exam.id == ExamProblem.exam_id)
        .where(ExamProblem.id == problem_id)
    )
    row = result.one_or_none()
    if row is None:
        return {"subject_id": None, "topic_id": None}
    topic_id, subject_id = row
    return {
        "subject_id": int(subject_id) if subject_id is not None else None,
        "topic_id": int(topic_id) if topic_id is not None else None,
    }


async def _context_from_exercise(db: AsyncSession, exercise_id: int) -> InteractionContext:
    result = await db.execute(select(Exercise.subject_id, Exercise.topic_id).where(Exercise.id == exercise_id))
    row = result.one_or_none()
    if row is None:
        return {"subject_id": None, "topic_id": None}
    subject_id, topic_id = row
    return {
        "subject_id": int(subject_id),
        "topic_id": int(topic_id) if topic_id is not None else None,
    }


async def _context_from_quiz(db: AsyncSession, quiz_id: int) -> InteractionContext:
    question_set = await db.get(QuestionSet, quiz_id)
    if question_set is not None:
        return {
            "subject_id": int(question_set.subject_id) if question_set.subject_id is not None else None,
            "topic_id": int(question_set.topic_id) if question_set.topic_id is not None else None,
            "topic_item_id": int(question_set.topic_item_id) if question_set.topic_item_id is not None else None,
            "tab_content_id": int(question_set.tab_content_id) if question_set.tab_content_id is not None else None,
        }

    return {"subject_id": None}


async def _context_from_question(db: AsyncSession, question_id: int) -> InteractionContext:
    result = await db.execute(
        select(
            QuestionSet.subject_id,
            QuestionSet.topic_id,
            QuestionSet.topic_item_id,
            QuestionSet.tab_content_id,
        )
        .join(Question, Question.question_set_id == QuestionSet.id)
        .where(Question.id == question_id)
    )
    row = result.one_or_none()
    if row is None:
        return {"subject_id": None, "topic_id": None, "topic_item_id": None, "tab_content_id": None}
    subject_id, topic_id, topic_item_id, tab_content_id = row
    return {
        "subject_id": int(subject_id) if subject_id is not None else None,
        "topic_id": int(topic_id) if topic_id is not None else None,
        "topic_item_id": int(topic_item_id) if topic_item_id is not None else None,
        "tab_content_id": int(tab_content_id) if tab_content_id is not None else None,
    }


async def _target_context(db: AsyncSession, target_type: str, target_id: int) -> InteractionContext:
    if target_type == "topic":
        return await _context_from_topic(db, target_id)
    if target_type == "topic_item":
        return await _context_from_topic_item(db, target_id)
    if target_type == "resource":
        return await _context_from_resource(db, target_id)
    if target_type == "tab_content":
        return await _context_from_tab_content(db, target_id)
    if target_type == "exam_problem":
        return await _context_from_exam_problem(db, target_id)
    if target_type == "exercise":
        return await _context_from_exercise(db, target_id)
    if target_type in {"quiz", "question_set"}:
        return await _context_from_quiz(db, target_id)
    if target_type == "question":
        return await _context_from_question(db, target_id)
    return {}


async def infer_interaction_context(
    db: AsyncSession,
    *,
    subject_id: int | None = None,
    topic_id: int | None = None,
    topic_item_id: int | None = None,
    tab_content_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
) -> InteractionContext:
    context: InteractionContext = {
        "subject_id": subject_id,
        "topic_id": topic_id,
        "topic_item_id": topic_item_id,
        "tab_content_id": tab_content_id,
    }
    if target_type is not None and target_id is not None:
        context = _merge_context(context, await _target_context(db, target_type, target_id))
    if context.get("tab_content_id") is not None:
        context = _merge_context(context, await _context_from_tab_content(db, int(context["tab_content_id"])))
    if context.get("topic_item_id") is not None:
        context = _merge_context(context, await _context_from_topic_item(db, int(context["topic_item_id"])))
    if context.get("topic_id") is not None:
        context = _merge_context(context, await _context_from_topic(db, int(context["topic_id"])))
    return context


def activity_metadata(**values: int | str | None) -> dict:
    return {key: value for key, value in values.items() if value is not None}
