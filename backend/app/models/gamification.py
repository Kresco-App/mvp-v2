from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Integer, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.courses import Lesson
    from app.models.quizzes import Question, QuestionSet, Quiz


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (
        Index("ix_lesson_progress_user_lesson", "user_id", "lesson_id"),
        Index("ix_lesson_progress_user_status", "user_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    lesson_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("lessons.id", ondelete="CASCADE"))
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="started")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="lesson_progress")
    lesson: Mapped["Lesson"] = relationship("Lesson")


class ContentProgress(Base):
    __tablename__ = "content_progress"
    __table_args__ = (
        Index("ix_content_progress_user_item", "user_id", "item_type", "item_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    item_type: Mapped[str] = mapped_column(String(20))
    item_id: Mapped[int] = mapped_column(Integer)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="content_progress")


class UserXP(Base):
    __tablename__ = "user_xp"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    total_xp: Mapped[int] = mapped_column(Integer, default=0)
    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_active_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="xp")


class XPTransaction(Base):
    __tablename__ = "xp_transactions"
    __table_args__ = (
        Index("ix_xp_transactions_user_created", "user_id", "created_at"),
        Index("ix_xp_transactions_reason", "reason"),
        Index("ix_xp_transactions_idempotency", "idempotency_key", unique=True),
        Index("ix_xp_transactions_context", "subject_id", "topic_id", "topic_section_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(String(200), default="")
    subject_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    question_set_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    question_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quiz_attempt_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    question_attempt_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="xp_transactions")


class QuizResult(Base):
    __tablename__ = "quiz_results"
    __table_args__ = (
        Index("ix_quiz_results_user_passed", "user_id", "passed"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    quiz_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("quizzes.id", ondelete="CASCADE"))
    score: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="quiz_results")
    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="results")


class DailyQuest(Base):
    __tablename__ = "daily_quests"
    __table_args__ = (
        Index("ix_daily_quests_user_date", "user_id", "date"),
        Index("ix_daily_quests_user_type_date_completed", "user_id", "quest_type", "date", "completed"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    quest_type: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    target: Mapped[int] = mapped_column(Integer, default=1)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    xp_reward: Mapped[int] = mapped_column(Integer, default=25)
    date: Mapped[date] = mapped_column(Date)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="daily_quests")


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_events_created_at", "created_at"),
        Index("ix_activity_events_user_created", "user_id", "created_at"),
        Index("ix_activity_events_event_type", "event_type"),
        Index("ix_activity_events_target_type", "target_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[int] = mapped_column(Integer)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")


class TopicItemProgress(Base):
    __tablename__ = "topic_item_progress"
    __table_args__ = (
        Index("ix_topic_item_progress_user_item", "user_id", "topic_item_id"),
        Index("ix_topic_item_progress_user_topic_status", "user_id", "topic_id", "status"),
        Index("ix_topic_item_progress_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    topic_id: Mapped[int] = mapped_column(Integer)
    topic_item_id: Mapped[int] = mapped_column(Integer)
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
        Index("ix_quiz_attempts_user_tab_created", "user_id", "tab_content_id", "created_at"),
        Index("ix_quiz_attempts_user_set_created", "user_id", "question_set_id", "created_at"),
        Index("ix_quiz_attempts_subject_topic", "subject_id", "topic_id"),
        Index("ix_quiz_attempts_passed", "passed"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    question_set_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("question_sets.id", ondelete="SET NULL"), nullable=True)
    subject_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), default="tab")
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
    quiz_attempt_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("quiz_attempts.id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("questions.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    subject_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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
