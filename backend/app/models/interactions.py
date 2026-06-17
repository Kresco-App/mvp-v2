from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.courses import TopicItem
    from app.models.exercises import Exercise
    from app.models.users import User

ALLOWED_TARGET_TYPES = {"topic", "topic_item", "resource", "question_set", "question", "exam_problem", "tab_content", "exercise"}
CANVAS_TARGET_TYPES = {"topic_item", "exercise", "exam_problem"}
COMMENT_STATUSES = {"visible", "hidden", "deleted"}


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        CheckConstraint(
            "(topic_item_id IS NOT NULL AND exercise_id IS NULL) OR "
            "(topic_item_id IS NULL AND exercise_id IS NOT NULL)",
            name="ck_comments_exactly_one_target",
        ),
        Index("ix_comments_topic_item_created", "topic_item_id", "created_at"),
        Index("ix_comments_exercise_created", "exercise_id", "created_at"),
        Index("ix_comments_status_created", "status", "created_at"),
        CheckConstraint("status IN ('visible', 'hidden', 'deleted')", name="ck_comments_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topic_items.id", ondelete="CASCADE"), nullable=True, index=True)
    exercise_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=True, index=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="visible", server_default="visible")
    moderated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    moderated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    moderation_reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="comments", foreign_keys=[user_id])
    topic_item: Mapped["TopicItem"] = relationship("TopicItem")
    exercise: Mapped[Optional["Exercise"]] = relationship("Exercise")
    replies: Mapped[list["Comment"]] = relationship(
        "Comment", back_populates="parent", foreign_keys=[parent_id]
    )
    parent: Mapped[Optional["Comment"]] = relationship(
        "Comment", back_populates="replies", remote_side=[id], foreign_keys=[parent_id]
    )


class UserNote(Base):
    __tablename__ = "user_notes"
    __table_args__ = (
        Index("ix_user_notes_user_topic_updated", "user_id", "topic_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tab_content_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tab_contents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User")


class CanvasDocument(Base):
    __tablename__ = "canvas_documents"
    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_canvas_documents_user_target"),
        CheckConstraint(
            "target_type IN ('topic_item', 'exercise', 'exam_problem')",
            name="ck_canvas_documents_target_type",
        ),
        Index("ix_canvas_documents_user_target", "user_id", "target_type", "target_id"),
        Index("ix_canvas_documents_user_updated", "user_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[int] = mapped_column(Integer)
    subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    topic_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    topic_item_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scene_json: Mapped[dict] = mapped_column(JSON, default=dict)
    scene_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User")


class SavedItem(Base):
    __tablename__ = "saved_items"
    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_saved_items_user_target"),
        Index("ix_saved_items_user_target", "user_id", "target_type", "target_id"),
        Index("ix_saved_items_target_lookup", "target_type", "target_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[int] = mapped_column(Integer)
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    label: Mapped[str] = mapped_column(String(255), default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")
