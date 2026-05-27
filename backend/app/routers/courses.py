from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload, with_loader_criteria
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.courses import (
    Activity, Chapter, ChapterSection, CoursePDF, Exam, ExamProblem, Lesson, Resource,
    Subject, TabContent, Topic, TopicItem, TopicSection,
)
from app.models.gamification import ActivityEvent, QuestionAttempt, QuizAttempt, TopicItemProgress
from app.models.interactions import UserNote
from app.models.quizzes import Question, QuestionSet
from app.models.users import User
from app.schemas.courses import (
    ActivityEventIn,
    ActivityOut, ChapterOut, ChapterSectionOut, ChapterWithSectionsOut, CoursePDFOut,
    ExamOut, LessonDetailOut, StreamOut,
    SectionWatchContextOut, SubjectDetailOut, SubjectListOut, TabQuizResultOut, TabQuizSubmitIn,
    TopicCardOut, TopicItemCompleteIn, TopicSectionOut, TopicWorkspaceOut,
    VideoQuizTriggerOut,
)
from app.services.access import AccessDecision, build_access_context
from app.services.course_access import (
    access_for_tab,
    access_for_topic_item,
    chapter_section_out,
    exam_out,
    require_lesson_access,
    store_access_decision,
    topic_item_out,
)
from app.services.xp import award_xp
from app.services.vdocipher import get_video_otp

router = APIRouter(tags=["Courses"])


def _matches_item(item: TopicItem, query: str, notes_by_item: dict[int, list[str]] | None = None) -> bool:
    haystack = " ".join([
        item.title,
        item.description or "",
        " ".join(item.concept_slugs or []),
        item.item_type,
        item.primary_resource.title if item.primary_resource else "",
        item.primary_resource.summary if item.primary_resource else "",
        " ".join(notes_by_item.get(item.id, [])) if notes_by_item else "",
        *(tab.label + " " + (tab.content or "") + " " + " ".join(tab.concept_slugs or []) for tab in item.tabs),
    ]).lower()
    return query.lower() in haystack


def _normalize_answer(value) -> str:
    return str(value if value is not None else "").strip().casefold()


def _normalize_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_normalize_answer(item) for item in value]
    if isinstance(value, str):
        return [_normalize_answer(item) for item in value.split(",") if item.strip()]
    return [_normalize_answer(value)]


def _answer_payload(value) -> dict:
    return value if isinstance(value, dict) and "value" in value else {"value": value}


def _question_external_id(question: dict, index: int) -> str:
    return str(question.get("id") or f"q{index + 1}")


def _question_concept_slugs(question: dict, fallback: list[str] | None = None) -> list[str]:
    raw = question.get("concept_slugs")
    if isinstance(raw, list):
        return [str(item) for item in raw if str(item).strip()]
    if question.get("concept"):
        return [str(question["concept"])]
    return fallback or []


def _question_config(question: dict) -> dict:
    answer_keys = {"answer", "accepted_answers"}
    scalar_columns = {"id", "type", "title", "prompt", "concept", "concept_slugs", "difficulty", "explanation"}
    return {
        key: value
        for key, value in question.items()
        if key not in answer_keys and key not in scalar_columns
    }


def _question_answer(question: dict) -> dict:
    payload = {"answer": question.get("answer")}
    if "accepted_answers" in question:
        payload["accepted_answers"] = question.get("accepted_answers")
    if "answerRegion" in question:
        payload["answerRegion"] = question.get("answerRegion")
    return payload


async def _ensure_question_set_for_tab(db: AsyncSession, tab: TabContent) -> tuple[QuestionSet, dict[str, Question]]:
    topic_item = tab.topic_item
    topic = topic_item.topic if topic_item else None
    questions = tab.config_json.get("questions", []) if isinstance(tab.config_json, dict) else []
    pass_score = int(tab.config_json.get("pass_score", 70)) if isinstance(tab.config_json, dict) else 70
    title = tab.label or f"Quiz tab {tab.id}"

    result = await db.execute(
        select(QuestionSet)
        .options(selectinload(QuestionSet.questions))
        .where(QuestionSet.tab_content_id == tab.id)
    )
    question_set = result.scalar_one_or_none()
    if question_set is None:
        question_set = QuestionSet(
            subject_id=topic.subject_id if topic else None,
            topic_id=topic_item.topic_id if topic_item else None,
            topic_section_id=topic_item.section_id if topic_item else None,
            topic_item_id=tab.topic_item_id,
            tab_content_id=tab.id,
            title=title,
            source_type="tab",
            pass_score=pass_score,
            status=tab.status,
            order=tab.order,
            concept_slugs=tab.concept_slugs or [],
        )
        db.add(question_set)
        await db.flush()
    else:
        question_set.subject_id = topic.subject_id if topic else question_set.subject_id
        question_set.topic_id = topic_item.topic_id if topic_item else question_set.topic_id
        question_set.topic_section_id = topic_item.section_id if topic_item else question_set.topic_section_id
        question_set.topic_item_id = tab.topic_item_id
        question_set.title = title
        question_set.pass_score = pass_score
        question_set.status = tab.status
        question_set.order = tab.order
        question_set.concept_slugs = tab.concept_slugs or []

    existing_questions = (
        await db.execute(select(Question).where(Question.question_set_id == question_set.id))
    ).scalars().all()
    by_external_id = {question.external_id: question for question in existing_questions}
    active_external_ids: set[str] = set()
    for index, raw_question in enumerate(questions):
        external_id = _question_external_id(raw_question, index)
        active_external_ids.add(external_id)
        row = by_external_id.get(external_id)
        if row is None:
            row = Question(question_set_id=question_set.id, external_id=external_id, type=str(raw_question.get("type") or "multiple_choice"), prompt=str(raw_question.get("prompt") or ""))
            db.add(row)
            by_external_id[external_id] = row
        row.type = str(raw_question.get("type") or "multiple_choice")
        row.title = str(raw_question.get("title") or raw_question.get("prompt") or external_id)[:255]
        row.prompt = str(raw_question.get("prompt") or "")
        row.explanation = str(raw_question.get("explanation") or "")
        row.difficulty = str(raw_question.get("difficulty") or "")
        row.concept_slugs = _question_concept_slugs(raw_question, tab.concept_slugs or [])
        row.config_json = _question_config(raw_question)
        row.answer_json = _question_answer(raw_question)
        row.order = index + 1
        row.status = "published"

    for external_id, row in by_external_id.items():
        if external_id not in active_external_ids:
            row.status = "archived"

    await db.flush()
    return question_set, by_external_id


def _grade_quiz_question(question: dict, submitted) -> tuple[bool, object]:
    question_type = str(question.get("type") or "multiple_choice")
    expected = question.get("answer")

    if question_type in {"multiple_choice", "true_false", "fill_in_blank", "short_answer", "interactive_checkpoint", "exact_match", "error_spotting"}:
        accepted = question.get("accepted_answers") or [expected]
        return _normalize_answer(submitted) in {_normalize_answer(item) for item in accepted}, accepted

    if question_type in {"numeric_answer", "numeric_approximation", "slider_estimation"}:
        tolerance = float(question.get("tolerance", 0))
        try:
            return abs(float(submitted) - float(expected)) <= tolerance, expected
        except (TypeError, ValueError):
            return False, expected

    if question_type == "multi_select":
        return sorted(_normalize_list(submitted)) == sorted(_normalize_list(expected)), expected

    if question_type == "ordering":
        expected_order = expected or [item.get("id") for item in question.get("items", []) if isinstance(item, dict)]
        return _normalize_list(submitted) == _normalize_list(expected_order), expected_order

    if question_type == "formula_builder":
        return _normalize_list(submitted) == _normalize_list(expected), expected

    if question_type == "matching":
        expected_map = expected or {pair.get("left"): pair.get("right") for pair in question.get("pairs", [])}
        submitted_map = submitted if isinstance(submitted, dict) else {}
        normalized_expected = {_normalize_answer(k): _normalize_answer(v) for k, v in expected_map.items()}
        normalized_submitted = {_normalize_answer(k): _normalize_answer(v) for k, v in submitted_map.items()}
        return normalized_submitted == normalized_expected, expected_map

    if question_type == "image_hotspot":
        region = question.get("answerRegion") or {}
        cursor = submitted if isinstance(submitted, dict) else {}
        try:
            safe_rx = float(region.get("rx", 0)) - float(cursor.get("radius", 0))
            safe_ry = float(region.get("ry", 0)) - float(cursor.get("radius", 0))
            if safe_rx <= 0 or safe_ry <= 0:
                return False, region
            dx = float(cursor.get("x", 0)) - float(region.get("x", 0))
            dy = float(cursor.get("y", 0)) - float(region.get("y", 0))
            return ((dx * dx) / (safe_rx * safe_rx)) + ((dy * dy) / (safe_ry * safe_ry)) <= 1, region
        except (TypeError, ValueError, ZeroDivisionError):
            return False, region

    return submitted == expected, expected


@router.get("/subjects", response_model=list[SubjectListOut])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subject)
        .where(Subject.is_published == True)  # noqa: E712
        .order_by(Subject.order, Subject.title)
    )
    subjects = result.scalars().all()
    subject_ids = [subject.id for subject in subjects]

    chapter_counts: dict[int, int] = {}
    lesson_counts: dict[int, int] = {}
    if subject_ids:
        chapter_count_result = await db.execute(
            select(Chapter.subject_id, func.count(Chapter.id))
            .where(Chapter.subject_id.in_(subject_ids))
            .group_by(Chapter.subject_id)
        )
        chapter_counts = {subject_id: count for subject_id, count in chapter_count_result.all()}

        lesson_count_result = await db.execute(
            select(Chapter.subject_id, func.count(Lesson.id))
            .join(Lesson, Lesson.chapter_id == Chapter.id)
            .where(Chapter.subject_id.in_(subject_ids))
            .group_by(Chapter.subject_id)
        )
        lesson_counts = {subject_id: count for subject_id, count in lesson_count_result.all()}

    out = []
    for s in subjects:
        out.append(SubjectListOut(
            id=s.id, title=s.title, description=s.description,
            thumbnail_url=s.thumbnail_url, is_published=s.is_published,
            order=s.order,
            chapter_count=chapter_counts.get(s.id, 0),
            lesson_count=lesson_counts.get(s.id, 0),
        ))
    return out


@router.get("/topics", response_model=list[TopicCardOut])
async def list_topics(
    subject_id: int | None = None,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Topic)
        .options(
            selectinload(Topic.subject),
            selectinload(Topic.sections).selectinload(TopicSection.items),
            with_loader_criteria(TopicItem, TopicItem.status == "published"),
        )
        .where(Topic.status == "published")
        .order_by(Topic.order, Topic.title)
    )
    if subject_id is not None:
        stmt = stmt.where(Topic.subject_id == subject_id)
    if q:
        stmt = stmt.where(or_(Topic.title.ilike(f"%{q}%"), Topic.description.ilike(f"%{q}%"), Topic.slug.ilike(f"%{q}%")))
    result = await db.execute(stmt)
    topics = result.scalars().unique().all()
    access_context = await build_access_context(db, user)

    item_ids = [item.id for topic in topics for section in topic.sections for item in section.items]
    progress_by_item: set[int] = set()
    if item_ids:
        progress_result = await db.execute(
            select(TopicItemProgress.topic_item_id).where(
                TopicItemProgress.user_id == user.id,
                TopicItemProgress.topic_item_id.in_(item_ids),
                TopicItemProgress.status == "completed",
            )
        )
        progress_by_item = set(progress_result.scalars().all())

    cards = []
    for topic in topics:
        items = [item for section in topic.sections for item in section.items if item.status == "published"]
        concepts = sorted({slug for item in items for slug in (item.concept_slugs or [])})
        completed = len([item for item in items if item.id in progress_by_item])
        progress_pct = round((completed / len(items)) * 100) if items else 0
        access = access_context.decide_for(topic, subject_id=topic.subject_id)
        cards.append(TopicCardOut(
            id=topic.id,
            subject_id=topic.subject_id,
            subject_title=topic.subject.title if topic.subject else "",
            slug=topic.slug,
            title=topic.title,
            description=topic.description,
            is_free_preview=topic.is_free_preview,
            item_count=len(items),
            completed_count=completed,
            progress_pct=progress_pct,
            concepts=concepts[:8],
            can_access=access.can_access,
            locked_reason=access.locked_reason,
            access_reason=access.reason,
            required_subject_id=access.required_subject_id,
            required_tier=access.required_tier,
            required_feature_key=access.required_feature_key,
        ))
    return cards


@router.get("/subjects/{subject_id}/topics", response_model=list[TopicCardOut])
async def list_subject_topics(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_topics(subject_id=subject_id, db=db, user=user)


@router.get("/topics/{topic_id}/workspace", response_model=TopicWorkspaceOut)
async def get_topic_workspace(
    topic_id: int,
    item_id: int | None = None,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Topic)
        .options(
            selectinload(Topic.subject),
            selectinload(Topic.sections)
                .selectinload(TopicSection.items)
                .selectinload(TopicItem.primary_resource),
            selectinload(Topic.sections)
                .selectinload(TopicSection.items)
                .selectinload(TopicItem.tabs)
                .selectinload(TabContent.resource),
            selectinload(Topic.resources),
            with_loader_criteria(TopicItem, TopicItem.status == "published"),
            with_loader_criteria(TabContent, TabContent.status == "published"),
            with_loader_criteria(Resource, Resource.status == "published"),
        )
        .where(Topic.id == topic_id, Topic.status == "published")
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    access_context = await build_access_context(db, user)
    topic_access = access_context.decide_for(topic, subject_id=topic.subject_id)

    items = [item for section in topic.sections for item in section.items if item.status == "published"]
    item_ids = [item.id for item in items]
    progress_by_item = {}
    if item_ids:
        progress_result = await db.execute(
            select(TopicItemProgress).where(
                TopicItemProgress.user_id == user.id,
                TopicItemProgress.topic_id == topic.id,
                TopicItemProgress.topic_item_id.in_(item_ids),
            )
        )
        progress_by_item = {p.topic_item_id: p for p in progress_result.scalars().all()}

    item_access: dict[int, AccessDecision] = {}
    for item in items:
        item_access[item.id] = access_context.decide_child(topic_access, item, subject_id=topic.subject_id)

    tab_access: dict[int, AccessDecision] = {}
    resource_access: dict[int, AccessDecision] = {}
    for resource in topic.resources:
        if resource.status == "published":
            store_access_decision(
                resource_access,
                resource.id,
                access_context.decide_child(topic_access, resource, subject_id=topic.subject_id),
            )
    for item in items:
        current_item_access = item_access[item.id]
        if item.primary_resource:
            store_access_decision(
                resource_access,
                item.primary_resource.id,
                access_context.decide_child(current_item_access, item.primary_resource, subject_id=topic.subject_id),
            )
        for tab in item.tabs:
            if tab.status != "published":
                continue
            current_tab_access = access_context.decide_child(current_item_access, tab, subject_id=topic.subject_id)
            tab_access[tab.id] = current_tab_access
            if tab.resource:
                store_access_decision(
                    resource_access,
                    tab.resource.id,
                    access_context.decide_child(current_tab_access, tab.resource, subject_id=topic.subject_id),
                )

    accessible_items = [item for item in items if item_access.get(item.id, topic_access).can_access]
    active_item = next((item for item in accessible_items if item.id == item_id), None) if item_id else None
    if active_item is None:
        started = [progress_by_item.get(item.id) for item in accessible_items if progress_by_item.get(item.id)]
        started = sorted(started, key=lambda p: p.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        if started:
            active_item = next((item for item in accessible_items if item.id == started[0].topic_item_id), None)
    if active_item is None:
        active_item = next((item for item in accessible_items if progress_by_item.get(item.id, None) is None), None) or (accessible_items[0] if accessible_items else (items[0] if items else None))

    sections = [
        TopicSectionOut(
            id=section.id,
            title=section.title,
            section_type=section.section_type,
            order=section.order,
            items=[topic_item_out(item, progress_by_item, item_access, tab_access, resource_access) for item in section.items if item.status == "published"],
        )
        for section in topic.sections
    ]
    completed_count = len([item for item in accessible_items if progress_by_item.get(item.id) and progress_by_item[item.id].status == "completed"])
    progress_pct = round((completed_count / len(accessible_items)) * 100) if accessible_items else 0

    notes_result = await db.execute(
        select(UserNote)
        .where(UserNote.user_id == user.id, UserNote.topic_id == topic.id)
        .order_by(UserNote.updated_at.desc())
    )
    note_rows = notes_result.scalars().all()
    notes_by_item: dict[int, list[str]] = {}
    for note in note_rows:
        if note.topic_item_id:
            notes_by_item.setdefault(note.topic_item_id, []).append(note.body)

    search_results = [topic_item_out(item, progress_by_item, item_access, tab_access, resource_access) for item in items if q and _matches_item(item, q, notes_by_item)]

    return TopicWorkspaceOut(
        id=topic.id,
        subject_id=topic.subject_id,
        subject_title=topic.subject.title if topic.subject else "",
        slug=topic.slug,
        title=topic.title,
        description=topic.description,
        progress_pct=progress_pct,
        completed_count=completed_count,
        item_count=len(accessible_items),
        can_access=topic_access.can_access,
        locked_reason=topic_access.locked_reason,
        access_reason=topic_access.reason,
        required_subject_id=topic_access.required_subject_id,
        required_tier=topic_access.required_tier,
        required_feature_key=topic_access.required_feature_key,
        active_item_id=active_item.id if active_item else None,
        sections=sections,
        active_item=topic_item_out(active_item, progress_by_item, item_access, tab_access, resource_access) if active_item else None,
        search_results=search_results,
    )


@router.post("/topic-items/{item_id}/event")
async def record_topic_event(
    item_id: int,
    body: ActivityEventIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TopicItem)
        .options(selectinload(TopicItem.topic))
        .where(TopicItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")
    access = await access_for_topic_item(db, user, item)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    db.add(ActivityEvent(
        user_id=user.id,
        event_type=body.event_type,
        target_type=body.target_type,
        target_id=body.target_id,
        topic_id=body.topic_id or item.topic_id,
        topic_item_id=body.topic_item_id or item.id,
        metadata_json=body.metadata_json,
    ))
    progress_result = await db.execute(
        select(TopicItemProgress).where(
            TopicItemProgress.user_id == user.id,
            TopicItemProgress.topic_item_id == item.id,
        )
    )
    progress = progress_result.scalar_one_or_none()
    if progress is None:
        db.add(TopicItemProgress(user_id=user.id, topic_id=item.topic_id, topic_item_id=item.id, status="started"))
    await db.commit()
    return {"ok": True}


@router.post("/topic-items/{item_id}/complete")
async def complete_topic_item(
    item_id: int,
    body: TopicItemCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TopicItem)
        .options(selectinload(TopicItem.topic))
        .where(TopicItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")
    access = await access_for_topic_item(db, user, item)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    progress_result = await db.execute(
        select(TopicItemProgress).where(
            TopicItemProgress.user_id == user.id,
            TopicItemProgress.topic_item_id == item.id,
        )
    )
    progress = progress_result.scalar_one_or_none()
    was_completed = progress.status == "completed" if progress else False
    if progress is None:
        progress = TopicItemProgress(user_id=user.id, topic_id=item.topic_id, topic_item_id=item.id)
        db.add(progress)
    progress.status = "completed"
    progress.completed_at = datetime.now(timezone.utc)
    progress.watched_seconds = max(progress.watched_seconds or 0, body.watched_seconds)
    if body.score is not None:
        progress.latest_score = body.score
        progress.best_score = max(progress.best_score or 0, body.score)
    db.add(ActivityEvent(
        user_id=user.id,
        event_type=f"{item.item_type}_completed",
        target_type="topic_item",
        target_id=item.id,
        topic_id=item.topic_id,
        topic_item_id=item.id,
        metadata_json={"score": body.score, "watched_seconds": body.watched_seconds},
    ))
    xp_reason = "quiz_pass" if item.item_type == "checkpoint_quiz" else "video_complete" if "video" in item.item_type else "lab_complete" if "interactive" in item.item_type else "lesson_complete"
    xp_earned = 0
    if not was_completed:
        xp_earned = await award_xp(
            user.id,
            xp_reason,
            f"TopicItem {item.id} completed",
            db,
            subject_id=item.topic.subject_id if item.topic else None,
            topic_id=item.topic_id,
            topic_section_id=item.section_id,
            topic_item_id=item.id,
            idempotency_key=f"topic_item_complete:user:{user.id}:item:{item.id}",
        )
    await db.commit()
    return {"ok": True, "xp_earned": xp_earned}


@router.post("/tabs/{tab_id}/quiz/submit", response_model=TabQuizResultOut)
async def submit_tab_quiz(
    tab_id: int,
    body: TabQuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TabContent)
        .options(
            selectinload(TabContent.topic_item).selectinload(TopicItem.topic),
            selectinload(TabContent.topic_item).selectinload(TopicItem.section),
        )
        .where(TabContent.id == tab_id, TabContent.tab_type == "quiz")
    )
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=404, detail="Quiz tab not found")
    access = await access_for_tab(db, user, tab)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    question_set, questions_by_external_id = await _ensure_question_set_for_tab(db, tab)
    questions = tab.config_json.get("questions", [])
    pass_score = question_set.pass_score
    grading = {"questions": []}
    correct = 0
    question_attempt_rows: list[QuestionAttempt] = []
    for question in questions:
        qid = _question_external_id(question, len(grading["questions"]))
        submitted = body.answers.get(qid)
        is_correct, expected = _grade_quiz_question(question, submitted)
        question_row = questions_by_external_id.get(qid)
        if is_correct:
            correct += 1
        grading["questions"].append({
            "id": qid,
            "type": question.get("type", "multiple_choice"),
            "correct": is_correct,
            "answer": expected,
        })
        if question_row is not None:
            question_attempt_rows.append(QuestionAttempt(
                quiz_attempt_id=0,
                question_id=question_row.id,
                user_id=user.id,
                subject_id=question_set.subject_id,
                topic_id=question_set.topic_id,
                topic_section_id=question_set.topic_section_id,
                topic_item_id=question_set.topic_item_id,
                tab_content_id=question_set.tab_content_id,
                selected_answer_json=_answer_payload(submitted),
                correct_answer_json=_answer_payload(expected),
                is_correct=is_correct,
                score_awarded=1 if is_correct else 0,
                max_score=1,
                grading_json={
                    "external_id": qid,
                    "type": question.get("type", "multiple_choice"),
                    "correct": is_correct,
                },
            ))
    total = len(questions)
    score = round((correct / total) * 100) if total else 0
    passed = score >= pass_score
    attempts_count = await db.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.question_set_id == question_set.id,
        )
    )
    now = datetime.now(timezone.utc)
    attempt = QuizAttempt(
        user_id=user.id,
        question_set_id=question_set.id,
        subject_id=question_set.subject_id,
        topic_id=question_set.topic_id,
        topic_section_id=question_set.topic_section_id,
        topic_item_id=tab.topic_item_id,
        tab_content_id=tab.id,
        source_type="tab",
        score=score,
        passed=passed,
        answers=body.answers,
        grading=grading,
        attempt_number=(attempts_count or 0) + 1,
        duration_seconds=body.duration_seconds,
        started_at=now,
        completed_at=now,
    )
    db.add(attempt)
    await db.flush()
    for question_attempt in question_attempt_rows:
        question_attempt.quiz_attempt_id = attempt.id
    db.add_all(question_attempt_rows)
    await db.flush()

    xp_earned = 0
    for question_attempt in question_attempt_rows:
        if not question_attempt.is_correct:
            continue
        xp_earned += await award_xp(
            user.id,
            "quiz_correct",
            f"Question {question_attempt.question_id} first correct",
            db,
            subject_id=question_attempt.subject_id,
            topic_id=question_attempt.topic_id,
            topic_section_id=question_attempt.topic_section_id,
            topic_item_id=question_attempt.topic_item_id,
            question_set_id=question_set.id,
            question_id=question_attempt.question_id,
            quiz_attempt_id=attempt.id,
            question_attempt_id=question_attempt.id,
            idempotency_key=f"quiz_correct:user:{user.id}:question:{question_attempt.question_id}",
        )
    if passed:
        xp_earned += await award_xp(
            user.id,
            "quiz_pass",
            f"QuestionSet {question_set.id} passed",
            db,
            subject_id=question_set.subject_id,
            topic_id=question_set.topic_id,
            topic_section_id=question_set.topic_section_id,
            topic_item_id=question_set.topic_item_id,
            question_set_id=question_set.id,
            quiz_attempt_id=attempt.id,
            idempotency_key=f"quiz_pass:user:{user.id}:question_set:{question_set.id}",
        )
    if passed:
        progress_result = await db.execute(
            select(TopicItemProgress).where(
                TopicItemProgress.user_id == user.id,
                TopicItemProgress.topic_item_id == tab.topic_item_id,
            )
        )
        progress = progress_result.scalar_one_or_none()
        if progress is None:
            progress = TopicItemProgress(user_id=user.id, topic_id=tab.topic_item.topic_id, topic_item_id=tab.topic_item_id)
            db.add(progress)
        progress.latest_score = score
        progress.best_score = max(progress.best_score or 0, score)
    db.add(ActivityEvent(
        user_id=user.id,
        event_type="quiz_submitted",
        target_type="question_set",
        target_id=question_set.id,
        topic_id=question_set.topic_id,
        topic_item_id=question_set.topic_item_id,
        metadata_json={
            "quiz_attempt_id": attempt.id,
            "tab_content_id": tab.id,
            "topic_section_id": question_set.topic_section_id,
            "score": score,
            "passed": passed,
            "correct": correct,
            "total": total,
        },
    ))
    await db.commit()
    return TabQuizResultOut(score=score, passed=passed, correct=correct, total=total, pass_score=pass_score, xp_earned=xp_earned, grading=grading)


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
        .options(
            selectinload(Exam.subject),
            selectinload(Exam.problems).selectinload(ExamProblem.video_resource),
            with_loader_criteria(ExamProblem, ExamProblem.status == "published"),
            with_loader_criteria(Resource, Resource.status == "published"),
        )
        .where(Exam.status == "published")
        .order_by(Exam.year.desc(), Exam.title)
    )
    if subject_id:
        stmt = stmt.where(Exam.subject_id == subject_id)
    if year:
        stmt = stmt.where(Exam.year == year)
    result = await db.execute(stmt)
    exams = result.scalars().unique().all()
    access_context = await build_access_context(db, user)
    out = []
    for exam in exams:
        problems = [p for p in exam.problems if p.status == "published"]
        if topic_id:
            problems = [p for p in problems if p.topic_id == topic_id]
        if q:
            q_lower = q.lower()
            exam_text = f"{exam.title} {exam.subject.title if exam.subject else ''} {exam.year} {exam.session}".lower()
            if q_lower not in exam_text:
                problems = [p for p in problems if q_lower in (p.title + " " + p.statement + " " + p.difficulty + " " + " ".join(p.concept_slugs or [])).lower()]
        if topic_id or q:
            if not problems:
                continue
        out.append(exam_out(exam, problems, access_context))
    return out


@router.get("/subjects/{subject_id}", response_model=SubjectDetailOut)
async def get_subject(subject_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subject)
        .options(
            selectinload(Subject.chapters).selectinload(Chapter.lessons),
            selectinload(Subject.chapters).selectinload(Chapter.blocks),
            selectinload(Subject.chapters).selectinload(Chapter.sections),
        )
        .where(Subject.id == subject_id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return SubjectDetailOut.model_validate(subject)


@router.get("/chapters/{chapter_id}", response_model=ChapterOut)
async def get_chapter(chapter_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Chapter)
        .options(
            selectinload(Chapter.lessons),
            selectinload(Chapter.blocks),
            selectinload(Chapter.sections),
        )
        .where(Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return ChapterOut.model_validate(chapter)


@router.get("/lessons/{lesson_id}", response_model=LessonDetailOut)
async def get_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.chapter).selectinload(Chapter.subject))
        .where(Lesson.id == lesson_id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    chapter = lesson.chapter
    subject = chapter.subject if chapter else None
    access_context = await build_access_context(db, user)
    access = access_context.decide_for(lesson, subject_id=subject.id if subject else None, fallback_required_tier="pro")
    return LessonDetailOut(
        id=lesson.id, title=lesson.title, vdocipher_id=lesson.vdocipher_id if access.can_access else "",
        duration_seconds=lesson.duration_seconds, is_free_preview=lesson.is_free_preview,
        order=lesson.order, chapter_id=chapter.id if chapter else 0,
        chapter_title=chapter.title if chapter else "",
        subject_id=subject.id if subject else 0,
        subject_title=subject.title if subject else "",
    )


@router.get("/lessons/{lesson_id}/activities", response_model=list[ActivityOut])
async def get_lesson_activities(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_lesson_access(db, user, lesson_id)
    result = await db.execute(
        select(Activity).where(Activity.lesson_id == lesson_id).order_by(Activity.order)
    )
    return [ActivityOut.model_validate(a) for a in result.scalars().all()]


@router.get("/lessons/{lesson_id}/stream", response_model=StreamOut)
async def get_lesson_stream(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    lesson = await require_lesson_access(db, user, lesson_id)
    otp_data = await get_video_otp(lesson.vdocipher_id, settings)
    return StreamOut(**otp_data)


@router.get("/lessons/{lesson_id}/pdfs", response_model=list[CoursePDFOut])
async def get_lesson_pdfs(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_lesson_access(db, user, lesson_id)
    result = await db.execute(
        select(CoursePDF).where(CoursePDF.lesson_id == lesson_id).order_by(CoursePDF.order)
    )
    return [CoursePDFOut.model_validate(p) for p in result.scalars().all()]


@router.get("/chapters/{chapter_id}/sections", response_model=list[ChapterSectionOut])
async def get_chapter_sections(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter))
        .where(ChapterSection.chapter_id == chapter_id)
        .order_by(ChapterSection.order)
    )
    sections = result.scalars().all()
    access_context = await build_access_context(db, user)
    return [
        chapter_section_out(s, access_context)
        for s in sections
    ]


@router.get("/sections/{section_id}/watch-context", response_model=SectionWatchContextOut)
async def get_section_watch_context(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    section = await db.scalar(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter).selectinload(Chapter.subject))
        .where(ChapterSection.id == section_id)
    )
    if section is None or section.chapter is None:
        raise HTTPException(status_code=404, detail="Section not found")

    chapter = section.chapter
    subject = chapter.subject
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    chapters_result = await db.execute(
        select(Chapter)
        .options(selectinload(Chapter.sections))
        .where(Chapter.subject_id == subject.id)
        .order_by(Chapter.order)
    )
    chapters = chapters_result.scalars().all()
    access_context = await build_access_context(db, user)

    chapter_outputs = [
        ChapterWithSectionsOut(
            id=item.id,
            title=item.title,
            description=item.description,
            order=item.order,
            sections=[
                chapter_section_out(child, access_context, fallback_subject_id=subject.id)
                for child in item.sections
            ],
        )
        for item in chapters
    ]
    current_chapter = next((item for item in chapter_outputs if item.id == chapter.id), None)
    if current_chapter is None:
        current_chapter = ChapterWithSectionsOut(
            id=chapter.id,
            title=chapter.title,
            description=chapter.description,
            order=chapter.order,
            sections=[chapter_section_out(section, access_context, fallback_subject_id=subject.id)],
        )

    return SectionWatchContextOut(
        section=chapter_section_out(section, access_context, fallback_subject_id=subject.id),
        chapter=current_chapter,
        subject_id=subject.id,
        subject_title=subject.title,
        chapters=chapter_outputs,
    )


@router.get("/sections/{section_id}/stream", response_model=StreamOut)
async def get_section_stream(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter))
        .where(ChapterSection.id == section_id)
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    access_context = await build_access_context(db, user)
    subject_id = section.chapter.subject_id if section.chapter else None
    access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    otp_data = await get_video_otp(section.vdocipher_id, settings)
    return StreamOut(**otp_data)
