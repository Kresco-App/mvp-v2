from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.courses import (
    Activity, Chapter, ChapterSection, CoursePDF, Exam, ExamProblem, Lesson, Resource,
    Subject, TabContent, Topic, TopicItem, TopicSection,
)
from app.models.gamification import ActivityEvent, QuizAttempt, TopicItemProgress
from app.models.interactions import UserNote
from app.models.users import User
from app.schemas.courses import (
    ActivityEventIn,
    ActivityOut, ChapterOut, ChapterSectionOut, CoursePDFOut,
    ExamOut, ExamProblemOut, LessonDetailOut, ResourceOut, StreamOut, StudyToolsOut,
    SubjectDetailOut, SubjectListOut, TabContentOut, TabQuizResultOut, TabQuizSubmitIn,
    TopicCardOut, TopicItemCompleteIn, TopicItemOut, TopicSectionOut, TopicWorkspaceOut,
    VideoQuizTriggerOut,
)
from app.services.xp import award_xp
from app.services.vdocipher import get_video_otp

router = APIRouter(tags=["Courses"])


def _is_unlocked(obj, user: User) -> bool:
    if getattr(obj, "is_free_preview", False):
        return True
    required_tier = getattr(obj, "required_tier", "") or ""
    if required_tier and required_tier.lower() == "pro" and not user.is_pro:
        return False
    return True


def _item_out(item: TopicItem, progress_by_item: dict[int, TopicItemProgress]) -> TopicItemOut:
    progress = progress_by_item.get(item.id)
    return TopicItemOut(
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
        primary_resource=ResourceOut.model_validate(item.primary_resource) if item.primary_resource else None,
        tabs=[TabContentOut.model_validate(t) for t in item.tabs if t.status == "published"],
        progress_status=progress.status if progress else "not_started",
        best_score=progress.best_score if progress else None,
    )


def _matches_item(item: TopicItem, query: str) -> bool:
    haystack = " ".join([
        item.title,
        item.description or "",
        " ".join(item.concept_slugs or []),
        item.item_type,
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


def _grade_quiz_question(question: dict, submitted) -> tuple[bool, object]:
    question_type = str(question.get("type") or "multiple_choice")
    expected = question.get("answer")

    if question_type in {"multiple_choice", "true_false", "fill_in_blank", "short_answer", "interactive_checkpoint"}:
        accepted = question.get("accepted_answers") or [expected]
        return _normalize_answer(submitted) in {_normalize_answer(item) for item in accepted}, accepted

    if question_type == "numeric_answer":
        tolerance = float(question.get("tolerance", 0))
        try:
            return abs(float(submitted) - float(expected)) <= tolerance, expected
        except (TypeError, ValueError):
            return False, expected

    if question_type == "multi_select":
        return sorted(_normalize_list(submitted)) == sorted(_normalize_list(expected)), expected

    if question_type == "ordering":
        return _normalize_list(submitted) == _normalize_list(expected or question.get("items")), expected

    if question_type == "matching":
        expected_map = expected or {pair.get("left"): pair.get("right") for pair in question.get("pairs", [])}
        submitted_map = submitted if isinstance(submitted, dict) else {}
        normalized_expected = {_normalize_answer(k): _normalize_answer(v) for k, v in expected_map.items()}
        normalized_submitted = {_normalize_answer(k): _normalize_answer(v) for k, v in submitted_map.items()}
        return normalized_submitted == normalized_expected, expected_map

    if question_type == "drag_and_drop":
        expected_map = expected or {
            item.get("id"): item.get("zone")
            for item in question.get("items", [])
            if isinstance(item, dict)
        }
        submitted_map = submitted if isinstance(submitted, dict) else {}
        normalized_expected = {_normalize_answer(k): _normalize_answer(v) for k, v in expected_map.items()}
        normalized_submitted = {_normalize_answer(k): _normalize_answer(v) for k, v in submitted_map.items()}
        return normalized_submitted == normalized_expected, expected_map

    return submitted == expected, expected


@router.get("/subjects", response_model=list[SubjectListOut])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subject)
        .options(selectinload(Subject.chapters).selectinload(Chapter.lessons))
        .where(Subject.is_published == True)  # noqa: E712
        .order_by(Subject.order, Subject.title)
    )
    subjects = result.scalars().unique().all()

    out = []
    for s in subjects:
        chapter_count = len(s.chapters)
        lesson_count = sum(len(c.lessons) for c in s.chapters)
        out.append(SubjectListOut(
            id=s.id, title=s.title, description=s.description,
            thumbnail_url=s.thumbnail_url, is_published=s.is_published,
            order=s.order, chapter_count=chapter_count, lesson_count=lesson_count,
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
        .options(selectinload(Topic.subject), selectinload(Topic.sections).selectinload(TopicSection.items))
        .where(Topic.status == "published")
        .order_by(Topic.order, Topic.title)
    )
    if subject_id is not None:
        stmt = stmt.where(Topic.subject_id == subject_id)
    if q:
        stmt = stmt.where(or_(Topic.title.ilike(f"%{q}%"), Topic.description.ilike(f"%{q}%"), Topic.slug.ilike(f"%{q}%")))
    result = await db.execute(stmt)
    topics = result.scalars().unique().all()

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
        )
        .where(Topic.id == topic_id, Topic.status == "published")
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    if not _is_unlocked(topic, user):
        raise HTTPException(status_code=403, detail="Topic requires upgraded access")

    items = [item for section in topic.sections for item in section.items if item.status == "published"]
    progress_result = await db.execute(
        select(TopicItemProgress).where(
            TopicItemProgress.user_id == user.id,
            TopicItemProgress.topic_id == topic.id,
        )
    )
    progress_by_item = {p.topic_item_id: p for p in progress_result.scalars().all()}

    active_item = next((item for item in items if item.id == item_id), None) if item_id else None
    if active_item is None:
        started = [progress_by_item.get(item.id) for item in items if progress_by_item.get(item.id)]
        started = sorted(started, key=lambda p: p.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        if started:
            active_item = next((item for item in items if item.id == started[0].topic_item_id), None)
    if active_item is None:
        active_item = next((item for item in items if progress_by_item.get(item.id, None) is None), None) or (items[0] if items else None)

    sections = [
        TopicSectionOut(
            id=section.id,
            title=section.title,
            section_type=section.section_type,
            order=section.order,
            items=[_item_out(item, progress_by_item) for item in section.items if item.status == "published"],
        )
        for section in topic.sections
    ]
    completed_count = len([item for item in items if progress_by_item.get(item.id) and progress_by_item[item.id].status == "completed"])
    progress_pct = round((completed_count / len(items)) * 100) if items else 0

    notes_result = await db.execute(
        select(UserNote)
        .where(UserNote.user_id == user.id, UserNote.topic_id == topic.id)
        .order_by(UserNote.updated_at.desc())
    )
    notes = [
        {
            "id": note.id,
            "topic_item_id": note.topic_item_id,
            "tab_content_id": note.tab_content_id,
            "body": note.body,
            "updated_at": note.updated_at.isoformat() if note.updated_at else "",
        }
        for note in notes_result.scalars().all()
    ]

    all_tabs = [tab for item in items for tab in item.tabs if tab.status == "published"]
    study_tools = StudyToolsOut(
        quizzes=[TabContentOut.model_validate(tab) for tab in all_tabs if tab.tab_type == "quiz"],
        interactive=[TabContentOut.model_validate(tab) for tab in all_tabs if tab.tab_type in {"lab", "interactive"}],
        resources=[ResourceOut.model_validate(resource) for resource in topic.resources if resource.status == "published"],
        notes=notes,
    )
    search_results = [_item_out(item, progress_by_item) for item in items if q and _matches_item(item, q)]

    return TopicWorkspaceOut(
        id=topic.id,
        subject_id=topic.subject_id,
        subject_title=topic.subject.title if topic.subject else "",
        slug=topic.slug,
        title=topic.title,
        description=topic.description,
        progress_pct=progress_pct,
        completed_count=completed_count,
        item_count=len(items),
        active_item_id=active_item.id if active_item else None,
        sections=sections,
        active_item=_item_out(active_item, progress_by_item) if active_item else None,
        study_tools=study_tools,
        search_results=search_results,
    )


@router.post("/topic-items/{item_id}/event")
async def record_topic_event(
    item_id: int,
    body: ActivityEventIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(TopicItem).where(TopicItem.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")
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
    result = await db.execute(select(TopicItem).where(TopicItem.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")
    progress_result = await db.execute(
        select(TopicItemProgress).where(
            TopicItemProgress.user_id == user.id,
            TopicItemProgress.topic_item_id == item.id,
        )
    )
    progress = progress_result.scalar_one_or_none()
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
    xp_earned = await award_xp(user.id, xp_reason, f"TopicItem {item.id} completed", db)
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
        .options(selectinload(TabContent.topic_item))
        .where(TabContent.id == tab_id, TabContent.tab_type == "quiz")
    )
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=404, detail="Quiz tab not found")
    questions = tab.config_json.get("questions", [])
    pass_score = int(tab.config_json.get("pass_score", 70))
    grading = {"questions": []}
    correct = 0
    for question in questions:
        qid = str(question["id"])
        submitted = body.answers.get(qid)
        is_correct, expected = _grade_quiz_question(question, submitted)
        if is_correct:
            correct += 1
        grading["questions"].append({
            "id": qid,
            "type": question.get("type", "multiple_choice"),
            "correct": is_correct,
            "answer": expected,
        })
    total = len(questions)
    score = round((correct / total) * 100) if total else 0
    passed = score >= pass_score
    attempts_count = await db.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.tab_content_id == tab.id,
        )
    )
    attempt = QuizAttempt(
        user_id=user.id,
        topic_id=tab.topic_item.topic_id,
        topic_item_id=tab.topic_item_id,
        tab_content_id=tab.id,
        source_type="tab",
        score=score,
        passed=passed,
        answers=body.answers,
        grading=grading,
        attempt_number=(attempts_count or 0) + 1,
        duration_seconds=body.duration_seconds,
    )
    db.add(attempt)
    xp_earned = await award_xp(user.id, "quiz_pass", f"Tab quiz {tab.id} submitted", db) if passed else 0
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
    out = []
    for exam in exams:
        problems = [p for p in exam.problems if p.status == "published"]
        if topic_id:
            problems = [p for p in problems if p.topic_id == topic_id]
        if q:
            q_lower = q.lower()
            problems = [p for p in problems if q_lower in (p.title + " " + p.statement + " " + " ".join(p.concept_slugs or [])).lower()]
        if topic_id or q:
            if not problems:
                continue
        out.append(ExamOut(
            id=exam.id,
            subject_id=exam.subject_id,
            subject_title=exam.subject.title if exam.subject else "",
            title=exam.title,
            year=exam.year,
            session=exam.session,
            statement_url=exam.statement_url,
            problems=[ExamProblemOut.model_validate(problem) for problem in problems],
        ))
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
async def get_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
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
    return LessonDetailOut(
        id=lesson.id, title=lesson.title, vdocipher_id=lesson.vdocipher_id,
        duration_seconds=lesson.duration_seconds, is_free_preview=lesson.is_free_preview,
        order=lesson.order, chapter_id=chapter.id if chapter else 0,
        chapter_title=chapter.title if chapter else "",
        subject_id=subject.id if subject else 0,
        subject_title=subject.title if subject else "",
    )


@router.get("/lessons/{lesson_id}/activities", response_model=list[ActivityOut])
async def get_lesson_activities(lesson_id: int, db: AsyncSession = Depends(get_db)):
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
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if not lesson.is_free_preview and not user.is_pro:
        raise HTTPException(status_code=403, detail="Pro subscription required")
    otp_data = await get_video_otp(lesson.vdocipher_id, settings)
    return StreamOut(**otp_data)


@router.get("/lessons/{lesson_id}/pdfs", response_model=list[CoursePDFOut])
async def get_lesson_pdfs(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CoursePDF).where(CoursePDF.lesson_id == lesson_id).order_by(CoursePDF.order)
    )
    return [CoursePDFOut.model_validate(p) for p in result.scalars().all()]


@router.get("/chapters/{chapter_id}/sections", response_model=list[ChapterSectionOut])
async def get_chapter_sections(chapter_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChapterSection)
        .where(ChapterSection.chapter_id == chapter_id)
        .order_by(ChapterSection.order)
    )
    sections = result.scalars().all()
    return [
        ChapterSectionOut(
            id=s.id, title=s.title, section_type=s.section_type, order=s.order,
            is_gating=s.is_gating, is_free_preview=s.is_free_preview,
            vdocipher_id=s.vdocipher_id, duration_seconds=s.duration_seconds,
            content=s.content, quiz_data=s.quiz_data, pass_score=s.pass_score,
            activity_type=s.activity_type, activity_data=s.activity_data,
            chapter_id=s.chapter_id,
        )
        for s in sections
    ]


@router.get("/sections/{section_id}/stream", response_model=StreamOut)
async def get_section_stream(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(ChapterSection).where(ChapterSection.id == section_id))
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    if not section.is_free_preview and not user.is_pro:
        raise HTTPException(status_code=403, detail="Pro subscription required")
    otp_data = await get_video_otp(section.vdocipher_id, settings)
    return StreamOut(**otp_data)
