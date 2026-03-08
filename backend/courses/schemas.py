from ninja import Schema
from typing import List, Optional
from datetime import datetime


class LessonOut(Schema):
    id: int
    title: str
    vdocipher_id: str
    duration_seconds: int
    is_free_preview: bool
    order: int


class ChapterBlockOut(Schema):
    id: int
    title: str
    content: str
    block_type: str
    order: int


class ChapterSectionOut(Schema):
    id: int
    title: str
    section_type: str
    order: int
    is_gating: bool
    is_free_preview: bool
    is_completed: bool = False
    is_locked: bool = False
    vdocipher_id: str
    duration_seconds: int
    content: str
    quiz_data: dict | None
    pass_score: int
    activity_type: str
    activity_data: dict | None


class ChapterSectionBriefOut(Schema):
    id: int
    title: str
    section_type: str
    order: int
    is_gating: bool
    is_free_preview: bool
    duration_seconds: int
    activity_type: str
    is_completed: bool = False
    is_locked: bool = False


class ChapterOut(Schema):
    id: int
    title: str
    description: str
    order: int
    lessons: List[LessonOut] = []
    blocks: List[ChapterBlockOut] = []
    sections: List[ChapterSectionBriefOut] = []


class SubjectListOut(Schema):
    id: int
    title: str
    description: str
    thumbnail_url: str
    is_published: bool
    order: int
    chapter_count: int = 0
    lesson_count: int = 0


class SubjectDetailOut(Schema):
    id: int
    title: str
    description: str
    thumbnail_url: str
    is_published: bool
    chapters: List[ChapterOut] = []


class StreamOut(Schema):
    otp: str
    playback_info: str


class VideoOTPOut(Schema):
    otp: str
    playbackInfo: str


class CoursePDFOut(Schema):
    id: int
    title: str
    file_url: str
    order: int


class LessonDetailOut(Schema):
    id: int
    title: str
    vdocipher_id: str
    duration_seconds: int
    is_free_preview: bool
    order: int
    chapter_id: int
    chapter_title: str
    subject_id: int
    subject_title: str


class ActivityOut(Schema):
    id: int
    title: str
    activity_type: str
    config_json: dict
