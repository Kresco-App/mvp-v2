from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


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


class LiveSessionIn(BaseModel):
    course_offering_id: int
    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    starts_at: datetime
    ends_at: datetime
    join_url: str = ""
    vdocipher_live_id: str = ""
    stream_ingest_url: str = ""
    stream_key: str = ""
    auto_create_vdocipher: bool = False
    chat_mode: str = "off"


class LiveSessionUpdateIn(BaseModel):
    course_offering_id: Optional[int] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    join_url: Optional[str] = None
    vdocipher_live_id: Optional[str] = None
    stream_ingest_url: Optional[str] = None
    stream_key: Optional[str] = None
    status: Optional[str] = None


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


class LiveSessionInteractionIn(BaseModel):
    kind: str = "question"
    body: str = Field(min_length=1, max_length=2000)


class LiveSessionInteractionPatchIn(BaseModel):
    status: Optional[str] = None
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


class LiveSessionCheckpointIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    prompt: str = Field(default="", max_length=4000)
    checkpoint_type: str = "prompt"


class LiveSessionCheckpointPatchIn(BaseModel):
    status: Optional[str] = None


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


class ProfessorChangeRequestIn(BaseModel):
    course_offering_id: int
    target_type: str
    target_id: int
    change_type: str = "update_fields"
    proposed_patch_json: dict[str, Any]
    current_snapshot_json: dict[str, Any] = Field(default_factory=dict)


class ProfessorDashboardOut(BaseModel):
    offerings: list[CourseOfferingOut]
    active_offering: Optional[CourseOfferingOut]
    upcoming_live_sessions: list[ProfessorLiveSessionOut]
    pending_change_requests: list[ProfessorChangeRequestOut]
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


class ChatMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ChatMessagePatchIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class StudentStartConversationIn(ChatMessageIn):
    course_offering_id: int


class ChatConversationPatchIn(BaseModel):
    is_pinned_by_professor: Optional[bool] = None
    mark_read: bool = False


class StudentProfessorChatStatusOut(BaseModel):
    eligible: bool
    reason: str = ""
    offerings: list[CourseOfferingOut] = []
    conversations: list[ProfessorChatConversationOut] = []
    teacher_threads: list[StudentProfessorThreadOut] = []
