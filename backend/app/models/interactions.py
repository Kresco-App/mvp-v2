from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.courses import TopicItem
    from app.models.users import User

ALLOWED_TARGET_TYPES = {"topic", "topic_item", "resource", "question_set", "question", "exam_problem", "tab_content"}


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_topic_item_created", "topic_item_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    topic_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topic_items.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="comments")
    topic_item: Mapped["TopicItem"] = relationship("TopicItem")
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")
