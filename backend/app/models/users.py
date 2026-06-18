from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, CheckConstraint, Index, Integer, Boolean, DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.gamification import (
        UserXP,
        XPTransaction,
        DailyQuest,
        UserStats,
    )
    from app.models.interactions import Comment
    from app.models.notifications import Notification


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_role_niveau_filiere_active", "role", "niveau", "filiere", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    banner_url: Mapped[str] = mapped_column(String(500), default="")
    avatar_media_size: Mapped[int] = mapped_column(Integer, default=0)
    banner_media_size: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str] = mapped_column(String(20), default="student")
    niveau: Mapped[str] = mapped_column(String(10), default="")
    filiere: Mapped[str] = mapped_column(String(100), default="")
    tier: Mapped[str] = mapped_column(String(30), default="basic")
    is_pro: Mapped[bool] = mapped_column(Boolean, default=False)
    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    firebase_uid: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    auth_token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    professor_unread_chat_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    xp: Mapped[Optional["UserXP"]] = relationship("UserXP", back_populates="user", uselist=False)
    stats: Mapped[Optional["UserStats"]] = relationship("UserStats", back_populates="user", uselist=False)
    xp_transactions: Mapped[list["XPTransaction"]] = relationship("XPTransaction", back_populates="user")
    daily_quests: Mapped[list["DailyQuest"]] = relationship("DailyQuest", back_populates="user")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="user", foreign_keys="Comment.user_id")
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user")
    subject_entitlements: Mapped[list["UserSubjectEntitlement"]] = relationship("UserSubjectEntitlement", back_populates="user")


class UserSubjectEntitlement(Base):
    __tablename__ = "user_subject_entitlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(60), default="manual")
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="subject_entitlements")


class UserPermission(Base):
    __tablename__ = "user_permissions"
    __table_args__ = (
        UniqueConstraint("user_id", "permission", name="uq_user_permissions_user_permission"),
        CheckConstraint("status IN ('active', 'revoked')", name="ck_user_permissions_status"),
        Index("ix_user_permissions_permission_status", "permission", "status"),
        Index("ix_user_permissions_granted_by_created", "granted_by_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    reason: Mapped[str] = mapped_column(String(255), nullable=False, default="", server_default="")
    granted_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
