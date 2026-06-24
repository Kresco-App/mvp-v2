from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AdminCrudActionsOut(BaseModel):
    create: bool
    read: bool
    update: bool
    delete: bool


class AdminCrudCatalogItemOut(BaseModel):
    domain: str
    slug: str
    name: str
    name_plural: str
    model: str
    admin_url: str
    actions: AdminCrudActionsOut


class AdminOverviewOut(BaseModel):
    generated_at: datetime
    totals: dict[str, int]
    content_status: dict[str, dict[str, int]]
    access_billing: dict[str, Any]
    ops_readiness: dict[str, Any] = Field(default_factory=dict)
    progress_xp: dict[str, Any]
    exam_bank: dict[str, Any]
    calendar: dict[str, Any]
    engagement: dict[str, Any]
    interactions: dict[str, Any]
    notifications: dict[str, Any]
    finance: dict[str, Any] = Field(default_factory=dict)
    communications: dict[str, Any] = Field(default_factory=dict)
    admin_audit: dict[str, Any] = Field(default_factory=dict)
    crud_catalog: list[AdminCrudCatalogItemOut]


class AdminActivitySummaryOut(BaseModel):
    total_audit_rows: int
    created_24h: int
    created_7d: int
    actors_in_feed: int
    models_in_feed: int


class AdminActivityEntryOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: int
    action: str
    model_name: str
    object_pk: str = ""
    object_repr: str = ""
    summary: str = ""
    actor_user_id: int | None = None
    request_path: str = ""
    client_host: str = ""
    changed_keys: list[str] = Field(default_factory=list)
    changed_data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class AdminActivityOut(BaseModel):
    generated_at: datetime
    summary: AdminActivitySummaryOut
    by_action: dict[str, int]
    by_model: dict[str, int]
    entries: list[AdminActivityEntryOut]


class AdminStudentProgressSummaryOut(BaseModel):
    total_students: int
    active_students_7d: int
    students_with_progress: int
    completed_topic_items: int
    total_watch_minutes: int
    quiz_attempts: int
    quiz_passed: int
    total_xp: int


class AdminStudentProgressRowOut(BaseModel):
    user_id: int
    full_name: str
    email: str
    tier: str
    niveau: str
    filiere: str
    is_pro: bool
    total_xp: int = 0
    streak_days: int = 0
    progress_records: int = 0
    completed_items: int = 0
    in_progress_items: int = 0
    watched_minutes: int = 0
    quiz_attempts: int = 0
    quiz_passed: int = 0
    average_quiz_score: float = 0
    last_activity_at: datetime | None = None


class AdminStudentProgressOut(BaseModel):
    generated_at: datetime
    summary: AdminStudentProgressSummaryOut
    progress_by_status: dict[str, int]
    students: list[AdminStudentProgressRowOut]


class AdminCommunicationsSummaryOut(BaseModel):
    total_conversations: int
    open_conversations: int
    unread_for_professors: int
    unread_for_students: int
    messages_7d: int
    live_sessions_live: int
    pending_live_interactions: int
    open_reports: int
    urgent_open_reports: int


class AdminChatMessageOut(BaseModel):
    message_id: int
    conversation_id: int
    sender_user_id: int
    sender_name: str
    sender_role: str
    body: str
    attachment_url: str = ""
    attachment_name: str = ""
    attachment_mime_type: str = ""
    attachment_size: int = 0
    status: str
    created_at: datetime | None = None
    read_at: datetime | None = None


class AdminChatConversationOut(BaseModel):
    conversation_id: int
    status: str
    course_offering_id: int
    course_title: str
    professor_user_id: int
    professor_name: str
    student_user_id: int
    student_name: str
    unread_for_professor: int
    unread_for_student: int
    last_message_preview: str
    last_message_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[AdminChatMessageOut] = Field(default_factory=list)


class AdminLiveInteractionOut(BaseModel):
    interaction_id: int
    live_session_id: int
    session_title: str
    kind: str
    status: str
    professor_user_id: int
    professor_name: str
    student_user_id: int
    student_name: str
    body: str
    answer: str
    created_at: datetime | None = None
    answered_at: datetime | None = None


class AdminReportQueueItemOut(BaseModel):
    report_id: int
    target_type: str
    target_id: str
    reason: str
    status: str
    priority: str
    title: str
    description: str
    reporter_user_id: int
    reporter_name: str
    assigned_to_user_id: int | None = None
    assigned_to_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AdminCommunicationsOut(BaseModel):
    generated_at: datetime
    summary: AdminCommunicationsSummaryOut
    chat_conversations_by_status: dict[str, int]
    live_interactions_by_status: dict[str, int]
    reports_by_status: dict[str, int]
    reports_by_priority: dict[str, int]
    conversations: list[AdminChatConversationOut]
    live_interactions: list[AdminLiveInteractionOut]
    reports: list[AdminReportQueueItemOut]


class AdminUsersAccessSummaryOut(BaseModel):
    total_users: int
    active_users: int
    verified_users: int
    staff_users: int
    pro_users: int
    active_entitlements: int
    users_with_active_entitlements: int
    active_permissions: int
    paid_users: int
    paid_revenue_centimes: int


class AdminUserPermissionRowOut(BaseModel):
    id: int
    permission: str
    reason: str = ""
    created_at: datetime | None = None


class AdminUserAccessRowOut(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    tier: str
    niveau: str
    filiere: str
    is_active: bool
    is_email_verified: bool
    is_staff: bool
    is_superuser: bool
    is_pro: bool
    active_entitlements: int = 0
    total_entitlements: int = 0
    active_permissions: int = 0
    active_permission_names: list[str] = Field(default_factory=list)
    permissions: list[AdminUserPermissionRowOut] = Field(default_factory=list)
    payment_count: int = 0
    paid_revenue_centimes: int = 0
    latest_payment_at: datetime | None = None
    last_login: datetime | None = None
    created_at: datetime | None = None


class AdminUsersAccessOut(BaseModel):
    generated_at: datetime
    summary: AdminUsersAccessSummaryOut
    users_by_role: dict[str, int]
    users_by_tier: dict[str, int]
    entitlements_by_status: dict[str, int]
    permissions_by_status: dict[str, int]
    users: list[AdminUserAccessRowOut]
