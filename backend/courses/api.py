import requests
from ninja import Router
from ninja.errors import HttpError
from django.conf import settings
from django.db.models import Count
from courses.models import Subject, Chapter, Lesson, CoursePDF, Activity, ChapterSection
from courses.schemas import SubjectListOut, SubjectDetailOut, ChapterOut, StreamOut, CoursePDFOut, LessonDetailOut, ActivityOut, ChapterSectionOut, ChapterSectionBriefOut
from users.auth import jwt_auth

router = Router()


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/subjects", response=list[SubjectListOut], auth=None)
def list_subjects(request):
    subjects = Subject.objects.filter(is_published=True).prefetch_related('chapters__lessons')
    result = []
    for s in subjects:
        chapters = s.chapters.all()
        lesson_count = sum(c.lessons.count() for c in chapters)
        result.append(SubjectListOut(
            id=s.id,
            title=s.title,
            description=s.description,
            thumbnail_url=s.thumbnail_url,
            is_published=s.is_published,
            order=s.order,
            chapter_count=chapters.count(),
            lesson_count=lesson_count,
        ))
    return result


@router.get("/subjects/{subject_id}", response=SubjectDetailOut, auth=None)
def get_subject(request, subject_id: int):
    try:
        subject = Subject.objects.prefetch_related(
            'chapters__lessons', 'chapters__blocks', 'chapters__sections'
        ).get(id=subject_id, is_published=True)
    except Subject.DoesNotExist:
        raise HttpError(404, "Subject not found")

    chapters_data = []
    for ch in subject.chapters.all():
        chapters_data.append(ChapterOut(
            id=ch.id,
            title=ch.title,
            description=ch.description,
            order=ch.order,
            lessons=list(ch.lessons.all()),
            blocks=list(ch.blocks.all()),
            sections=list(ch.sections.all()),
        ))

    return SubjectDetailOut(
        id=subject.id,
        title=subject.title,
        description=subject.description,
        thumbnail_url=subject.thumbnail_url,
        is_published=subject.is_published,
        chapters=chapters_data,
    )


@router.get("/chapters/{chapter_id}", response=ChapterOut, auth=None)
def get_chapter(request, chapter_id: int):
    try:
        chapter = Chapter.objects.prefetch_related('lessons', 'blocks', 'sections').get(id=chapter_id)
    except Chapter.DoesNotExist:
        raise HttpError(404, "Chapter not found")
    return ChapterOut(
        id=chapter.id,
        title=chapter.title,
        description=chapter.description,
        order=chapter.order,
        lessons=list(chapter.lessons.all()),
        blocks=list(chapter.blocks.all()),
        sections=list(chapter.sections.all()),
    )


@router.get("/lessons/{lesson_id}", response=LessonDetailOut, auth=None)
def get_lesson_detail(request, lesson_id: int):
    try:
        lesson = Lesson.objects.select_related('chapter__subject').get(id=lesson_id)
    except Lesson.DoesNotExist:
        raise HttpError(404, "Lesson not found")
    return LessonDetailOut(
        id=lesson.id,
        title=lesson.title,
        vdocipher_id=lesson.vdocipher_id,
        duration_seconds=lesson.duration_seconds,
        is_free_preview=lesson.is_free_preview,
        order=lesson.order,
        chapter_id=lesson.chapter.id,
        chapter_title=lesson.chapter.title,
        subject_id=lesson.chapter.subject.id,
        subject_title=lesson.chapter.subject.title,
    )


@router.get("/lessons/{lesson_id}/activities", response=list[ActivityOut], auth=None)
def get_lesson_activities(request, lesson_id: int):
    return list(Activity.objects.filter(lesson_id=lesson_id).order_by('id'))


# ── Protected endpoints ───────────────────────────────────────────────────────

@router.get("/lessons/{lesson_id}/stream", response=StreamOut, auth=jwt_auth)
def get_lesson_stream(request, lesson_id: int):
    try:
        lesson = Lesson.objects.get(id=lesson_id)
    except Lesson.DoesNotExist:
        raise HttpError(404, "Lesson not found")

    # Check access: free preview or pro user
    if not lesson.is_free_preview and not request.auth.is_pro:
        raise HttpError(403, "Pro subscription required")

    # If no VdoCipher ID set (dev/demo), return mock OTP
    if not lesson.vdocipher_id or settings.VDOCIPHER_API_SECRET == 'mock-vdocipher-secret':
        return StreamOut(
            otp="mock-otp-token",
            playback_info="mock-playback-info",
        )

    try:
        response = requests.post(
            f"https://dev.vdocipher.com/api/videos/{lesson.vdocipher_id}/otp",
            headers={
                "Authorization": f"Apisecret {settings.VDOCIPHER_API_SECRET}",
                "Content-Type": "application/json",
            },
            json={"ttl": 300},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        return StreamOut(
            otp=data['otp'],
            playback_info=data['playbackInfo'],
        )
    except requests.RequestException as e:
        raise HttpError(502, f"VdoCipher error: {str(e)}")


@router.get("/lessons/{lesson_id}/pdfs", response=list[CoursePDFOut], auth=None)
def get_lesson_pdfs(request, lesson_id: int):
    try:
        lesson = Lesson.objects.get(id=lesson_id)
    except Lesson.DoesNotExist:
        raise HttpError(404, "Lesson not found")
    return list(lesson.pdfs.all())


# ── Chapter Sections ─────────────────────────────────────────────────────────

@router.get("/chapters/{chapter_id}/sections", response=list[ChapterSectionOut], auth=None)
def get_chapter_sections(request, chapter_id: int):
    return list(ChapterSection.objects.filter(chapter_id=chapter_id))


@router.get("/sections/{section_id}/stream", response=StreamOut, auth=jwt_auth)
def stream_section(request, section_id: int):
    try:
        section = ChapterSection.objects.get(id=section_id)
    except ChapterSection.DoesNotExist:
        raise HttpError(404, "Section not found")

    if section.section_type != 'video':
        raise HttpError(400, "Not a video section")

    # Check access: free preview or pro user
    if not section.is_free_preview and not request.auth.is_pro:
        raise HttpError(403, "Pro subscription required")

    # If no VdoCipher ID set (dev/demo), return mock OTP
    if not section.vdocipher_id or settings.VDOCIPHER_API_SECRET == 'mock-vdocipher-secret':
        return StreamOut(
            otp="mock-otp-token",
            playback_info="mock-playback-info",
        )

    try:
        response = requests.post(
            f"https://dev.vdocipher.com/api/videos/{section.vdocipher_id}/otp",
            headers={
                "Authorization": f"Apisecret {settings.VDOCIPHER_API_SECRET}",
                "Content-Type": "application/json",
            },
            json={"ttl": 300},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        return StreamOut(
            otp=data['otp'],
            playback_info=data['playbackInfo'],
        )
    except requests.RequestException as e:
        raise HttpError(502, f"VdoCipher error: {str(e)}")
