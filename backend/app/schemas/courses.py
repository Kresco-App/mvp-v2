from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.limits import StrictInputModel


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

    model_config = {"from_attributes": True}


class StreamOut(BaseModel):
    otp: str
    playback_info: str
    watched_seconds: int = 0
    resume_seconds: int = 0


class AccessGuardedMixin(BaseModel):
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"


class ResourceOut(AccessGuardedMixin):
    id: int
    title: str
    resource_type: str
    provider: str = ""
    provider_resource_id: str = ""
    url: str = ""
    summary: str = ""
    metadata_json: dict = {}
    is_free_preview: bool = False

    model_config = {"from_attributes": True}


class TabContentOut(AccessGuardedMixin):
    id: int
    label: str
    tab_type: str
    content: str = ""
    config_json: dict = {}
    body_omitted: bool = False
    renderer_key: str = ""
    order: int
    concept_slugs: list[str] = []
    resource: Optional[ResourceOut] = None

    model_config = {"from_attributes": True}


class TopicItemOut(AccessGuardedMixin):
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
    primary_tab_content_id: Optional[int] = None
    primary_tab: Optional[TabContentOut] = None
    tabs: list[TabContentOut] = []
    progress_status: str = "not_started"
    watched_seconds: int = 0
    resume_seconds: int = 0
    best_score: Optional[int] = None

    model_config = {"from_attributes": True}


class TopicSectionOut(BaseModel):
    id: int
    title: str
    section_type: str
    order: int
    items: list[TopicItemOut] = []

    model_config = {"from_attributes": True}


class TopicCardOut(AccessGuardedMixin):
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


class TopicWorkspaceOut(AccessGuardedMixin):
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
    search_results: list[TopicItemOut] = []


class TopicItemCompleteIn(StrictInputModel):
    watched_seconds: int = Field(default=0, ge=0)
    score: Optional[int] = Field(default=None, ge=0, le=100)


class TopicItemProgressIn(StrictInputModel):
    watched_seconds: int = Field(default=0, ge=0)


class TopicItemProgressOut(BaseModel):
    ok: bool = True
    watched_seconds: int = 0
    completed: bool = False
