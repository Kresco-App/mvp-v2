from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    JSON,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.quizzes import Question, QuestionSet




class UserXP(Base):
    __tablename__ = "user_xp"
    __table_args__ = (
        CheckConstraint("total_xp >= 0", name="ck_user_xp_total_xp_nonnegative"),
        CheckConstraint("streak_days >= 0", name="ck_user_xp_streak_days_nonnegative"),
        Index("ix_user_xp_total_xp_user", "total_xp", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    total_xp: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    streak_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    last_active_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="xp")


class LeaderboardRank(Base):
    __tablename__ = "leaderboard_ranks"
    __table_args__ = (
        Index("ix_leaderboard_ranks_global_rank_user", "global_rank", "user_id"),
        Index("ix_leaderboard_ranks_total_xp_user", "total_xp", "user_id"),
    )

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_xp: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    global_rank: Mapped[int] = mapped_column(Integer)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User")


class UserStats(Base):
    __tablename__ = "user_stats"
    __table_args__ = (
        CheckConstraint("total_watch_seconds >= 0", name="ck_user_stats_total_watch_seconds_nonnegative"),
        CheckConstraint("lessons_completed >= 0", name="ck_user_stats_lessons_completed_nonnegative"),
        CheckConstraint("quizzes_passed >= 0", name="ck_user_stats_quizzes_passed_nonnegative"),
    )

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_watch_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    lessons_completed: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    quizzes_passed: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="stats")


class XPTransaction(Base):
    __tablename__ = "xp_transactions"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_xp_transactions_amount_nonnegative"),
        Index("ix_xp_transactions_user_created", "user_id", "created_at"),
        Index("ix_xp_transactions_reason", "reason"),
        Index("ix_xp_transactions_user_idempotency", "user_id", "idempotency_key", unique=True),
        Index("ix_xp_transactions_context", "subject_id", "topic_id", "topic_section_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(String(200), default="")
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_sections.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True)
    question_set_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("question_sets.id", ondelete="SET NULL"), nullable=True, index=True)
    question_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("questions.id", ondelete="SET NULL"), nullable=True, index=True)
    quiz_attempt_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("quiz_attempts.id", ondelete="SET NULL"), nullable=True, index=True)
    question_attempt_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("question_attempts.id", ondelete="SET NULL"), nullable=True, index=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="xp_transactions")



class DailyQuest(Base):
    __tablename__ = "daily_quests"
    __table_args__ = (
        UniqueConstraint("user_id", "quest_type", "date", name="uq_daily_quests_user_type_date"),
        Index("ix_daily_quests_user_date", "user_id", "date"),
        Index("ix_daily_quests_user_type_date_completed", "user_id", "quest_type", "date", "completed"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    quest_type: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    target: Mapped[int] = mapped_column(Integer, default=1)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    xp_reward: Mapped[int] = mapped_column(Integer, default=25)
    date: Mapped[date] = mapped_column(Date)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    user: Mapped["User"] = relationship("User", back_populates="daily_quests")



class TopicItemProgress(Base):
    __tablename__ = "topic_item_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "topic_item_id", name="uq_topic_item_progress_user_item"),
        Index("ix_topic_item_progress_user_item", "user_id", "topic_item_id"),
        Index("ix_topic_item_progress_user_item_status", "user_id", "topic_item_id", "status"),
        Index("ix_topic_item_progress_user_topic_item", "user_id", "topic_id", "topic_item_id"),
        Index("ix_topic_item_progress_user_topic_status", "user_id", "topic_id", "status"),
        Index("ix_topic_item_progress_topic_item_id", "topic_item_id"),
        Index("ix_topic_item_progress_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="CASCADE"), index=True)
    topic_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("topic_items.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="started")
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    best_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latest_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        UniqueConstraint("user_id", "question_set_id", "attempt_number", name="uq_quiz_attempts_user_set_attempt_number"),
        Index("ix_quiz_attempts_user_tab_created", "user_id", "tab_content_id", "created_at"),
        Index("ix_quiz_attempts_user_set_created", "user_id", "question_set_id", "created_at"),
        Index("ix_quiz_attempts_user_set_submission", "user_id", "question_set_id", "submission_hash", unique=True),
        Index("ix_quiz_attempts_subject_topic", "subject_id", "topic_id"),
        Index("ix_quiz_attempts_passed", "passed"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question_set_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("question_sets.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_sections.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tab_contents.id", ondelete="SET NULL"), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(40), default="tab")
    submission_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    score: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    grading: Mapped[dict] = mapped_column(JSON, default=dict)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")
    question_set: Mapped[Optional["QuestionSet"]] = relationship("QuestionSet")
    question_attempts: Mapped[list["QuestionAttempt"]] = relationship("QuestionAttempt", back_populates="quiz_attempt")


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"
    __table_args__ = (
        Index("ix_question_attempts_user_question_created", "user_id", "question_id", "created_at"),
        Index("ix_question_attempts_quiz_attempt", "quiz_attempt_id"),
        Index("ix_question_attempts_user_correct", "user_id", "is_correct"),
        Index("ix_question_attempts_context", "subject_id", "topic_id", "topic_section_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_attempt_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("quiz_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_sections.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tab_contents.id", ondelete="SET NULL"), nullable=True, index=True)
    selected_answer_json: Mapped[dict] = mapped_column(JSON, default=dict)
    correct_answer_json: Mapped[dict] = mapped_column(JSON, default=dict)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    score_awarded: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=1)
    time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    grading_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    quiz_attempt: Mapped["QuizAttempt"] = relationship("QuizAttempt", back_populates="question_attempts")
    question: Mapped["Question"] = relationship("Question", back_populates="attempts")
    user: Mapped["User"] = relationship("User")
