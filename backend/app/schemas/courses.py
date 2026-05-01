from typing import Any, Optional

from pydantic import BaseModel


class LessonOut(BaseModel):
    id: int
    title: str
    vdocipher_id: str
    duration_seconds: int
    is_free_preview: bool
    order: int

    model_config = {"from_attributes": True}


class ChapterBlockOut(BaseModel):
    id: int
    title: str
    content: str
    block_type: str
    order: int

    model_config = {"from_attributes": True}


class ChapterSectionBriefOut(BaseModel):
    id: int
    title: str
    section_type: str
    order: int
    is_gating: bool
    is_free_preview: bool
    duration_seconds: int
    activity_type: str

    model_config = {"from_attributes": True}


class ChapterSectionOut(BaseModel):
    id: int
    title: str
    section_type: str
    order: int
    is_gating: bool
    is_free_preview: bool
    vdocipher_id: str
    duration_seconds: int
    content: str
    quiz_data: Optional[dict] = None
    pass_score: int
    activity_type: str
    activity_data: Optional[dict] = None
    chapter_id: int

    model_config = {"from_attributes": True}


class ChapterOut(BaseModel):
    id: int
    title: str
    description: str
    order: int
    lessons: list[LessonOut] = []
    blocks: list[ChapterBlockOut] = []
    sections: list[ChapterSectionBriefOut] = []

    model_config = {"from_attributes": True}


class SubjectListOut(BaseModel):
    id: int
    title: str
    description: str
    thumbnail_url: str
    is_published: bool
    order: int
    chapter_count: int = 0
    lesson_count: int = 0

    model_config = {"from_attributes": True}


class SubjectDetailOut(BaseModel):
    id: int
    title: str
    description: str
    thumbnail_url: str
    is_published: bool
    chapters: list[ChapterOut] = []

    model_config = {"from_attributes": True}


class StreamOut(BaseModel):
    otp: str
    playback_info: str


class CoursePDFOut(BaseModel):
    id: int
    title: str
    file_url: str
    order: int

    model_config = {"from_attributes": True}


class LessonDetailOut(BaseModel):
    id: int
    title: str
    vdocipher_id: str
    duration_seconds: int
    is_free_preview: bool
    order: int
    chapter_id: int
    chapter_title: str = ""
    subject_id: int = 0
    subject_title: str = ""

    model_config = {"from_attributes": True}


class ActivityOut(BaseModel):
    id: int
    title: str
    activity_type: str
    config_json: dict

    model_config = {"from_attributes": True}


class VideoQuizTriggerOut(BaseModel):
    id: int
    timestamp_seconds: int
    quiz_id: int
    is_blocking: bool

    model_config = {"from_attributes": True}
