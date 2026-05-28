from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.courses import (
    ActivityEventIn,
    ActivityOut, ChapterOut, ChapterSectionOut, CoursePDFOut,
    ExamOut, LessonDetailOut, StreamOut,
    SectionWatchContextOut, SubjectDetailOut, SubjectListOut, TabQuizResultOut, TabQuizSubmitIn,
    TopicCardOut, TopicItemCompleteIn, TopicWorkspaceOut,
    VideoQuizTriggerOut,
)
from app.services.course_tab_quiz_submission import submit_tab_quiz_attempt
from app.services.course_legacy_read_models import (
    build_lesson_stream,
    build_section_stream,
    build_section_watch_context,
    get_chapter_detail,
    get_lesson_detail,
    get_subject_detail,
    list_chapter_sections,
    list_exam_bank_entries,
    list_lesson_activities,
    list_lesson_pdfs,
    list_subject_summaries,
)
from app.services.course_topic_mutations import complete_topic_item_state, record_topic_activity_event
from app.services.course_topic_read_models import build_topic_workspace, list_topic_cards

router = APIRouter(tags=["Courses"])

COURSE_LIST_DEFAULT_LIMIT = 50
COURSE_LIST_MAX_LIMIT = 100


@router.get("/subjects", response_model=list[SubjectListOut])
async def list_subjects(
    limit: int = Query(default=COURSE_LIST_DEFAULT_LIMIT, ge=1, le=COURSE_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    return await list_subject_summaries(db, limit=limit, offset=offset)


@router.get("/topics", response_model=list[TopicCardOut])
async def list_topics(
    subject_id: int | None = None,
    q: str = "",
    limit: int = Query(default=COURSE_LIST_DEFAULT_LIMIT, ge=1, le=COURSE_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_topic_cards(
        db,
        user=user,
        subject_id=subject_id,
        q=q,
        limit=limit,
        offset=offset,
    )


@router.get("/subjects/{subject_id}/topics", response_model=list[TopicCardOut])
async def list_subject_topics(
    subject_id: int,
    limit: int = Query(default=COURSE_LIST_DEFAULT_LIMIT, ge=1, le=COURSE_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_topics(subject_id=subject_id, limit=limit, offset=offset, db=db, user=user)


@router.get("/topics/{topic_id}/workspace", response_model=TopicWorkspaceOut)
async def get_topic_workspace(
    topic_id: int,
    item_id: int | None = None,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_topic_workspace(db, user=user, topic_id=topic_id, item_id=item_id, q=q)


@router.post("/topic-items/{item_id}/event")
async def record_topic_event(
    item_id: int,
    body: ActivityEventIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await record_topic_activity_event(db, user=user, item_id=item_id, body=body)


@router.post("/topic-items/{item_id}/complete")
async def complete_topic_item(
    item_id: int,
    body: TopicItemCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await complete_topic_item_state(db, user=user, item_id=item_id, body=body)


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
    return await list_exam_bank_entries(
        db,
        user=user,
        subject_id=subject_id,
        topic_id=topic_id,
        year=year,
        q=q,
    )


@router.get("/subjects/{subject_id}", response_model=SubjectDetailOut)
async def get_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    return await get_subject_detail(db, subject_id)


@router.get("/chapters/{chapter_id}", response_model=ChapterOut)
async def get_chapter(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    return await get_chapter_detail(db, chapter_id)


@router.get("/lessons/{lesson_id}", response_model=LessonDetailOut)
async def get_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_lesson_detail(db, user=user, lesson_id=lesson_id)


@router.get("/lessons/{lesson_id}/activities", response_model=list[ActivityOut])
async def get_lesson_activities(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_lesson_activities(db, user=user, lesson_id=lesson_id)


@router.get("/lessons/{lesson_id}/stream", response_model=StreamOut)
async def get_lesson_stream(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await build_lesson_stream(db, user=user, lesson_id=lesson_id, settings=settings)


@router.get("/lessons/{lesson_id}/pdfs", response_model=list[CoursePDFOut])
async def get_lesson_pdfs(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_lesson_pdfs(db, user=user, lesson_id=lesson_id)


@router.get("/chapters/{chapter_id}/sections", response_model=list[ChapterSectionOut])
async def get_chapter_sections(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_chapter_sections(db, user=user, chapter_id=chapter_id)


@router.get("/sections/{section_id}/watch-context", response_model=SectionWatchContextOut)
async def get_section_watch_context(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_section_watch_context(db, user=user, section_id=section_id)


@router.get("/sections/{section_id}/stream", response_model=StreamOut)
async def get_section_stream(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await build_section_stream(db, user=user, section_id=section_id, settings=settings)
