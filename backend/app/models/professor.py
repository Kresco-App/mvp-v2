from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ProgramTrack(Base):
    __tablename__ = "program_tracks"
    __table_args__ = (
        UniqueConstraint("niveau", "filiere", name="uq_program_tracks_niveau_filiere"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    niveau: Mapped[str] = mapped_column(String(40), default="", index=True)
    filiere: Mapped[str] = mapped_column(String(120), default="", index=True)
    title: Mapped[str] = mapped_column(String(180), default="")
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CourseOffering(Base):
    __tablename__ = "course_offerings"
    __table_args__ = (
        UniqueConstraint("subject_id", "track_id", name="uq_course_offerings_subject_track"),
        Index("ix_course_offerings_professor_status", "professor_user_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    track_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("program_tracks.id", ondelete="CASCADE"), index=True)
    professor_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subject = relationship("Subject")
    track = relationship("ProgramTrack")
    professor = relationship("User", foreign_keys=[professor_user_id])


class ProfessorChangeRequest(Base):
    __tablename__ = "professor_change_requests"
    __table_args__ = (
        Index("ix_professor_change_requests_offering_status", "course_offering_id", "status"),
        Index("ix_professor_change_requests_professor_created", "professor_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_offering_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True)
    professor_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[int] = mapped_column(Integer)
    change_type: Mapped[str] = mapped_column(String(60), default="update_fields")
    proposed_patch_json: Mapped[dict] = mapped_column(JSON, default=dict)
    current_snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    admin_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    admin_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    course_offering = relationship("CourseOffering")
    professor = relationship("User", foreign_keys=[professor_user_id])
    admin = relationship("User", foreign_keys=[admin_user_id])


class LiveSession(Base):
    __tablename__ = "live_sessions"
    __table_args__ = (
        Index("ix_live_sessions_offering_status_starts", "course_offering_id", "status", "starts_at"),
        Index("ix_live_sessions_professor_starts", "professor_user_id", "starts_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_offering_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True)
    professor_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    calendar_event_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("calendar_events.id", ondelete="SET NULL"), nullable=True, index=True)
    vdocipher_live_id: Mapped[str] = mapped_column(String(255), default="")
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(30), default="scheduled", index=True)
    join_url: Mapped[str] = mapped_column(String(500), default="")
    stream_ingest_url: Mapped[str] = mapped_column(String(500), default="")
    stream_key: Mapped[str] = mapped_column(String(500), default="")
    provider_payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    notification_status: Mapped[str] = mapped_column(String(30), default="not_sent")
    recording_resource_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("resources.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    course_offering = relationship("CourseOffering")
    professor = relationship("User", foreign_keys=[professor_user_id])
    calendar_event = relationship("CalendarEvent")
    recording_resource = relationship("Resource")
    interactions: Mapped[list["LiveSessionInteraction"]] = relationship(
        "LiveSessionInteraction",
        back_populates="live_session",
        order_by="LiveSessionInteraction.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    checkpoints: Mapped[list["LiveSessionCheckpoint"]] = relationship(
        "LiveSessionCheckpoint",
        back_populates="live_session",
        order_by="LiveSessionCheckpoint.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class LiveSessionCheckpoint(Base):
    __tablename__ = "live_session_checkpoints"
    __table_args__ = (
        Index("ix_live_session_checkpoints_session_created", "live_session_id", "created_at"),
        Index("ix_live_session_checkpoints_session_status", "live_session_id", "status"),
        Index("ix_live_session_checkpoints_professor_status", "professor_user_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    live_session_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("live_sessions.id", ondelete="CASCADE"), index=True)
    course_offering_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True)
    professor_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    prompt: Mapped[str] = mapped_column(Text, default="")
    checkpoint_type: Mapped[str] = mapped_column(String(30), default="prompt", index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    live_session: Mapped["LiveSession"] = relationship("LiveSession", back_populates="checkpoints")
    course_offering = relationship("CourseOffering")
    professor = relationship("User", foreign_keys=[professor_user_id])


class LiveSessionInteraction(Base):
    __tablename__ = "live_session_interactions"
    __table_args__ = (
        Index("ix_live_session_interactions_session_created", "live_session_id", "created_at"),
        Index("ix_live_session_interactions_session_status", "live_session_id", "status"),
        Index("ix_live_session_interactions_professor_status", "professor_user_id", "status"),
        Index("ix_live_session_interactions_student_session_created", "student_user_id", "live_session_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    live_session_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("live_sessions.id", ondelete="CASCADE"), index=True)
    course_offering_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True)
    professor_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="question", index=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    answer: Mapped[str] = mapped_column(Text, default="")
    answered_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    answered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    live_session: Mapped["LiveSession"] = relationship("LiveSession", back_populates="interactions")
    course_offering = relationship("CourseOffering")
    professor = relationship("User", foreign_keys=[professor_user_id])
    student = relationship("User", foreign_keys=[student_user_id])
    answered_by = relationship("User", foreign_keys=[answered_by_user_id])


class ProfessorChatConversation(Base):
    __tablename__ = "professor_chat_conversations"
    __table_args__ = (
        UniqueConstraint("course_offering_id", "student_user_id", name="uq_professor_chat_offering_student"),
        CheckConstraint("unread_for_professor >= 0", name="ck_professor_chat_unread_for_professor_nonnegative"),
        CheckConstraint("unread_for_student >= 0", name="ck_professor_chat_unread_for_student_nonnegative"),
        Index("ix_professor_chat_professor_updated", "professor_user_id", "updated_at"),
        Index("ix_professor_chat_student_updated", "student_user_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_offering_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True)
    professor_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    last_message_preview: Mapped[str] = mapped_column(String(255), default="")
    unread_for_professor: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    unread_for_student: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_pinned_by_professor: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    course_offering = relationship("CourseOffering")
    professor = relationship("User", foreign_keys=[professor_user_id])
    student = relationship("User", foreign_keys=[student_user_id])
    messages: Mapped[list["ProfessorChatMessage"]] = relationship(
        "ProfessorChatMessage",
        back_populates="conversation",
        order_by="ProfessorChatMessage.created_at",
    )


class ProfessorChatMessage(Base):
    __tablename__ = "professor_chat_messages"
    __table_args__ = (
        Index("ix_professor_chat_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("professor_chat_conversations.id", ondelete="CASCADE"), index=True)
    sender_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    attachment_url: Mapped[str] = mapped_column(String(500), default="")
    attachment_mime_type: Mapped[str] = mapped_column(String(120), default="")
    attachment_name: Mapped[str] = mapped_column(String(255), default="")
    attachment_size: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="sent")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    conversation: Mapped["ProfessorChatConversation"] = relationship("ProfessorChatConversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_user_id])


class RealtimeOutbox(Base):
    __tablename__ = "realtime_outbox"
    __table_args__ = (
        Index("ix_realtime_outbox_status_available", "status", "available_at", "id"),
        Index("ix_realtime_outbox_channel_created", "channel", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel: Mapped[str] = mapped_column(String(255), index=True)
    event_name: Mapped[str] = mapped_column(String(120), index=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="pending", server_default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str] = mapped_column(Text, default="")
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
