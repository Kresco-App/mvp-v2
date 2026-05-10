from datetime import datetime
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


class ResourceOut(BaseModel):
    id: int
    title: str
    resource_type: str
    provider: str = ""
    provider_resource_id: str = ""
    url: str = ""
    summary: str = ""
    metadata_json: dict = {}
    is_free_preview: bool = False
    required_tier: str = ""
    required_feature_key: str = ""

    model_config = {"from_attributes": True}


class TabContentOut(BaseModel):
    id: int
    label: str
    tab_type: str
    content: str = ""
    config_json: dict = {}
    renderer_key: str = ""
    order: int
    is_recommended: bool = False
    concept_slugs: list[str] = []
    resource: Optional[ResourceOut] = None

    model_config = {"from_attributes": True}


class TopicItemOut(BaseModel):
    id: int
    topic_id: int
    section_id: int
    title: str
    description: str = ""
    item_type: str
    renderer_key: str = ""
    duration_seconds: int = 0
    order: int
    completion_policy: str = "manual"
    is_free_preview: bool = False
    concept_slugs: list[str] = []
    primary_resource: Optional[ResourceOut] = None
    tabs: list[TabContentOut] = []
    progress_status: str = "not_started"
    best_score: Optional[int] = None

    model_config = {"from_attributes": True}


class TopicSectionOut(BaseModel):
    id: int
    title: str
    section_type: str
    order: int
    items: list[TopicItemOut] = []

    model_config = {"from_attributes": True}


class TopicCardOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str
    slug: str
    title: str
    description: str
    is_free_preview: bool
    item_count: int = 0
    completed_count: int = 0
    progress_pct: int = 0
    concepts: list[str] = []


class StudyToolsOut(BaseModel):
    quizzes: list[TabContentOut] = []
    interactive: list[TabContentOut] = []
    resources: list[ResourceOut] = []
    notes: list[dict] = []


class TopicWorkspaceOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str
    slug: str
    title: str
    description: str
    progress_pct: int
    completed_count: int
    item_count: int
    active_item_id: Optional[int]
    sections: list[TopicSectionOut]
    active_item: Optional[TopicItemOut]
    study_tools: StudyToolsOut
    search_results: list[TopicItemOut] = []


class ActivityEventIn(BaseModel):
    event_type: str
    target_type: str = "topic_item"
    target_id: int
    topic_id: Optional[int] = None
    topic_item_id: Optional[int] = None
    metadata_json: dict = {}


class TopicItemCompleteIn(BaseModel):
    watched_seconds: int = 0
    score: Optional[int] = None


class TabQuizSubmitIn(BaseModel):
    answers: dict[str, Any]
    duration_seconds: int = 0


class TabQuizResultOut(BaseModel):
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    xp_earned: int
    grading: dict


class ExamProblemOut(BaseModel):
    id: int
    exam_id: int
    topic_id: Optional[int] = None
    title: str
    statement: str
    written_solution: str
    written_solution_url: str
    difficulty: str
    concept_slugs: list[str] = []
    video_resource: Optional[ResourceOut] = None

    model_config = {"from_attributes": True}


class ExamOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str = ""
    title: str
    year: int
    session: str
    statement_url: str
    problems: list[ExamProblemOut] = []

    model_config = {"from_attributes": True}
