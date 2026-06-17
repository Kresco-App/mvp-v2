from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.limits import (
    JsonBounds,
    LongText,
    ShortText,
    StrictInputModel,
    TokenText,
    UrlText,
    validate_bounded_json_object,
)


PROFESSOR_CHANGE_REQUEST_JSON_BOUNDS = JsonBounds(
    max_container_depth=6,
    max_dict_items=250,
    max_list_items=250,
    max_string_length=10000,
    max_total_bytes=128 * 1024,
)


class ProgramTrackOut(BaseModel):
    id: int
    niveau: str
    filiere: str
    title: str
    status: str

    model_config = {"from_attributes": True}


class CourseOfferingOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str
    track: ProgramTrackOut
    professor_user_id: int
    title: str
    status: str


class LiveSessionOut(BaseModel):
    id: int
    course_offering_id: int
    title: str
    description: str
    starts_at: datetime
    ends_at: datetime
    status: str
    join_url: str
    vdocipher_live_id: str
    notification_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfessorLiveSessionOut(LiveSessionOut):
    has_stream_credentials: bool = False


class LiveSessionStreamCredentialsOut(BaseModel):
    id: int
    stream_ingest_url: str = ""
    stream_key: str = ""


class LiveSessionViewerOut(LiveSessionOut):
    offering_title: str = ""
    subject_title: str = ""
    niveau: str = ""
    filiere: str = ""
    teacher_name: str = ""
    viewer_url: str = ""
    can_join: bool = False
    provider: str = "vdocipher"


class LiveSessionEmbedOut(BaseModel):
    id: int
    title: str
    status: str
    provider: str = "vdocipher"
    embed_url: str
    chat_embed_url: str = ""
    vdocipher_live_id: str


class LiveProviderConfigOut(BaseModel):
    provider: str = "vdocipher"
    has_api_secret: bool
    can_auto_create: bool
    missing: list[str] = []
    create_endpoint_configured: bool


class LiveSessionIn(StrictInputModel):
    course_offering_id: int
    title: str = Field(min_length=1, max_length=255)
    description: LongText = ""
    starts_at: datetime
    ends_at: datetime
    join_url: UrlText = ""
    vdocipher_live_id: ShortText = ""
    stream_ingest_url: UrlText = ""
    stream_key: TokenText = ""
    auto_create_vdocipher: bool = False
    chat_mode: ShortText = "off"


class LiveSessionUpdateIn(StrictInputModel):
    course_offering_id: Optional[int] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[LongText] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    join_url: Optional[UrlText] = None
    vdocipher_live_id: Optional[ShortText] = None
    stream_ingest_url: Optional[UrlText] = None
    stream_key: Optional[TokenText] = None
    status: Optional[ShortText] = None


class LiveSessionInteractionOut(BaseModel):
    id: int
    live_session_id: int
    course_offering_id: int
    professor_user_id: int
    student_user_id: int
    student_name: str = ""
    kind: str
    body: str
    status: str
    answer: str = ""
    answered_by_user_id: Optional[int] = None
    answered_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class LiveSessionInteractionIn(StrictInputModel):
    kind: ShortText = "question"
    body: str = Field(min_length=1, max_length=2000)


class LiveSessionInteractionPatchIn(StrictInputModel):
    status: Optional[ShortText] = None
    answer: Optional[str] = Field(default=None, max_length=4000)


class LiveSessionCheckpointOut(BaseModel):
    id: int
    live_session_id: int
    course_offering_id: int
    professor_user_id: int
    title: str
    prompt: str = ""
    checkpoint_type: str
    status: str
    created_at: datetime
    closed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class LiveSessionCheckpointIn(StrictInputModel):
    title: str = Field(min_length=1, max_length=255)
    prompt: str = Field(default="", max_length=4000)
    checkpoint_type: ShortText = "prompt"


class LiveSessionCheckpointPatchIn(StrictInputModel):
    status: Optional[ShortText] = None


class ProfessorChangeRequestOut(BaseModel):
    id: int
    course_offering_id: int
    target_type: str
    target_id: int
    change_type: str
    proposed_patch_json: dict[str, Any]
    current_snapshot_json: dict[str, Any]
    status: str
    admin_note: str
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProfessorChangeRequestIn(StrictInputModel):
    course_offering_id: int
    target_type: ShortText
    target_id: int
    change_type: ShortText = "update_fields"
    proposed_patch_json: dict[str, Any]
    current_snapshot_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("proposed_patch_json", "current_snapshot_json")
    @classmethod
    def validate_change_request_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_bounded_json_object(value, bounds=PROFESSOR_CHANGE_REQUEST_JSON_BOUNDS)


# ── Professor Studio ────────────────────────────────────────────────────────

STUDIO_OP_TYPES = {"create", "update_fields", "update_content", "delete", "reorder"}
STUDIO_ENTITY_TYPES = {"chapter", "lesson", "tab"}


class StudioTabOut(BaseModel):
    id: int
    label: str
    tab_type: str
    status: str
    order: int
    content: str = ""
    resource_url: str = ""
    renderer_key: str = ""
    config_json: dict[str, Any] = Field(default_factory=dict)


class StudioLessonOut(BaseModel):
    id: int
    title: str
    description: str = ""
    item_type: str
    status: str
    order: int
    is_free_preview: bool = False
    required_tier: str = ""
    duration_seconds: int = 0
    # Primary VdoCipher video id for the lesson (the player resolves the stream
    # from this). Empty when the lesson has no hosted video.
    video_id: str = ""
    tabs: list[StudioTabOut] = Field(default_factory=list)


class StudioChapterOut(BaseModel):
    id: int
    title: str
    description: str = ""
    status: str
    order: int
    is_free_preview: bool = False
    required_tier: str = ""
    lessons: list[StudioLessonOut] = Field(default_factory=list)


class StudioTreeOut(BaseModel):
    course_offering_id: int
    offering_title: str
    subject_title: str
    chapters: list[StudioChapterOut] = Field(default_factory=list)
    has_pending_request: bool = False
    pending_request_id: Optional[int] = None
    # Ids of existing items that are referenced by a still-pending change
    # request, so the studio can flag them "En attente de validation".
    pending_chapter_ids: list[int] = Field(default_factory=list)
    pending_lesson_ids: list[int] = Field(default_factory=list)
    pending_tab_ids: list[int] = Field(default_factory=list)


class StudioOperationIn(StrictInputModel):
    op_type: ShortText
    entity_type: ShortText
    # Real id of an existing item (None for create ops).
    target_id: Optional[int] = None
    # Temporary id assigned by the studio for items created in this batch.
    client_ref: ShortText = ""
    # Parent reference: a real id (int as str) or a sibling create op's client_ref.
    parent_ref: ShortText = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    snapshot: dict[str, Any] = Field(default_factory=dict)

    @field_validator("op_type")
    @classmethod
    def validate_op_type(cls, value: str) -> str:
        if value not in STUDIO_OP_TYPES:
            raise ValueError(f"Unsupported op_type: {value}")
        return value

    @field_validator("entity_type")
    @classmethod
    def validate_entity_type(cls, value: str) -> str:
        if value not in STUDIO_ENTITY_TYPES:
            raise ValueError(f"Unsupported entity_type: {value}")
        return value

    @field_validator("payload", "snapshot")
    @classmethod
    def validate_op_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_bounded_json_object(value, bounds=PROFESSOR_CHANGE_REQUEST_JSON_BOUNDS)


class StudioSubmitIn(StrictInputModel):
    course_offering_id: int
    summary: LongText = ""
    operations: list[StudioOperationIn] = Field(default_factory=list, max_length=200)


class ProfessorChangeOperationOut(BaseModel):
    id: int
    seq: int
    op_type: str
    entity_type: str
    target_id: Optional[int] = None
    client_ref: str = ""
    parent_ref: str = ""
    payload_json: dict[str, Any] = Field(default_factory=dict)
    snapshot_json: dict[str, Any] = Field(default_factory=dict)
    status: str
    applied_target_id: Optional[int] = None
    error_detail: str = ""

    model_config = {"from_attributes": True}


class ProfessorChangeRequestDetailOut(ProfessorChangeRequestOut):
    summary: str = ""
    professor_name: str = ""
    professor_email: str = ""
    offering_title: str = ""
    operations: list[ProfessorChangeOperationOut] = Field(default_factory=list)


class ProfessorChangeRequestSummaryOut(BaseModel):
    id: int
    course_offering_id: int
    offering_title: str = ""
    summary: str = ""
    status: str
    operation_count: int = 0
    pending_count: int = 0
    applied_count: int = 0
    rejected_count: int = 0
    admin_note: str = ""
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminChangeRequestListItemOut(BaseModel):
    id: int
    course_offering_id: int
    offering_title: str = ""
    professor_name: str = ""
    professor_email: str = ""
    summary: str = ""
    status: str
    operation_count: int = 0
    pending_count: int = 0
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminOperationDecisionIn(StrictInputModel):
    operation_id: int
    decision: ShortText  # approve | reject

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: str) -> str:
        if value not in {"approve", "reject"}:
            raise ValueError("decision must be 'approve' or 'reject'")
        return value


class AdminReviewIn(StrictInputModel):
    decisions: list[AdminOperationDecisionIn] = Field(default_factory=list, max_length=200)
    admin_note: LongText = ""


class ProfessorDashboardOut(BaseModel):
    offerings: list[CourseOfferingOut]
    active_offering: Optional[CourseOfferingOut]
    upcoming_live_sessions: list[ProfessorLiveSessionOut]
    pending_change_requests: list[ProfessorChangeRequestSummaryOut]
    chat_unread_count: int
    chat_pinned_count: int


class ChatParticipantOut(BaseModel):
    id: int
    full_name: str
    avatar_url: str = ""
    tier: str = "basic"


class ProfessorChatConversationOut(BaseModel):
    id: int
    course_offering_id: int
    offering_title: str
    subject_title: str
    niveau: str
    filiere: str
    professor: ChatParticipantOut
    student: ChatParticipantOut
    status: str
    last_message_preview: str
    unread_for_professor: int
    unread_for_student: int
    is_pinned_by_professor: bool
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime


class StudentProfessorThreadOut(BaseModel):
    course_offering_id: int
    offering_title: str
    subject_title: str
    niveau: str
    filiere: str
    professor: ChatParticipantOut
    conversation: Optional[ProfessorChatConversationOut] = None
    last_message_preview: str = ""
    last_message_sender_role: str = ""
    unread_count: int = 0
    last_message_at: Optional[datetime] = None


class ProfessorChatMessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_user_id: int
    sender_role: str
    body: str
    attachment_url: str = ""
    attachment_mime_type: str = ""
    attachment_name: str = ""
    attachment_size: int = 0
    status: str
    created_at: datetime
    read_at: Optional[datetime] = None


class ChatMessageIn(StrictInputModel):
    body: str = Field(min_length=1, max_length=4000)


class ChatMessagePatchIn(StrictInputModel):
    body: str = Field(min_length=1, max_length=4000)


class StudentStartConversationIn(ChatMessageIn):
    course_offering_id: int


class ChatConversationPatchIn(StrictInputModel):
    is_pinned_by_professor: Optional[bool] = None
    mark_read: bool = False


class StudentProfessorChatStatusOut(BaseModel):
    eligible: bool
    reason: str = ""
    offerings: list[CourseOfferingOut] = []
    conversations: list[ProfessorChatConversationOut] = []
    teacher_threads: list[StudentProfessorThreadOut] = []
