from typing import Any

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, inspect as sa_inspect
from sqladmin import ModelView
from sqladmin.filters import AllUniqueStringValuesFilter, BooleanFilter

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import (
    Activity, Chapter, ChapterBlock, ChapterSection, ConceptTag, CoursePDF, Exam,
    ExamProblem, Lesson, Resource, Subject, TabContent, Topic, TopicItem, TopicSection,
    VideoQuizTrigger,
)
from app.models.gamification import (
    ActivityEvent, ContentProgress, DailyQuest, LessonProgress, QuestionAttempt, QuizAttempt, QuizResult,
    TopicItemProgress, UserXP, XPTransaction,
)
from app.models.interactions import Comment, SavedItem, UserNote
from app.models.notifications import Notification
from app.models.professor import (
    CourseOffering,
    LiveSession,
    LiveSessionCheckpoint,
    LiveSessionInteraction,
    ProfessorChangeRequest,
    ProfessorChatConversation,
    ProfessorChatMessage,
    ProgramTrack,
)
from app.models.quizzes import Question, QuestionSet, Quiz, QuizOption, QuizQuestion
from app.models.users import User, UserSubjectEntitlement


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return str(value)


def _object_pk(model: Any) -> str:
    try:
        identity = sa_inspect(model).identity
    except Exception:
        identity = None
    if not identity:
        return ""
    return ":".join(str(part) for part in identity)


class PowerModelView(ModelView):
    async def _write_audit_log(self, action: str, data: dict, model: Any, request) -> None:
        if model.__class__.__name__ == "AdminAuditLog":
            return
        session_factory = get_session_factory()
        if session_factory is None:
            return

        async with session_factory() as db:
            db.add(AdminAuditLog(
                action=action,
                model_name=model.__class__.__name__,
                object_pk=_object_pk(model),
                object_repr=str(model)[:500],
                changed_data={str(key): _json_safe(value) for key, value in (data or {}).items()},
                request_path=str(request.url.path) if request else "",
                client_host=request.client.host if request and request.client else "",
                note="Recorded from SQLAdmin power admin",
            ))
            await db.commit()

    async def after_model_change(self, data: dict, model: Any, is_created: bool, request) -> None:
        await self._write_audit_log("create" if is_created else "update", data, model, request)

    async def after_model_delete(self, model: Any, request) -> None:
        await self._write_audit_log("delete", {}, model, request)


class UserAdmin(PowerModelView, model=User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    column_list = [User.id, User.email, User.full_name, User.role, User.tier, User.is_pro, User.niveau, User.filiere, User.is_active, User.is_email_verified, User.created_at]
    column_searchable_list = [User.email, User.full_name]
    column_sortable_list = [User.created_at, User.is_pro, User.role, User.tier]
    form_excluded_columns = ["password", "last_login", "lesson_progress", "content_progress",
                             "xp", "xp_transactions", "quiz_results", "daily_quests", "comments", "notifications",
                             "subject_entitlements"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class UserSubjectEntitlementAdmin(PowerModelView, model=UserSubjectEntitlement):
    name = "Subject Entitlement"
    name_plural = "Subject Entitlements"
    icon = "fa-solid fa-key"
    column_list = [
        UserSubjectEntitlement.id, UserSubjectEntitlement.user_id,
        UserSubjectEntitlement.subject_id, UserSubjectEntitlement.status,
        UserSubjectEntitlement.source, UserSubjectEntitlement.starts_at,
        UserSubjectEntitlement.ends_at,
    ]
    column_sortable_list = [UserSubjectEntitlement.starts_at, UserSubjectEntitlement.ends_at]
    form_excluded_columns = ["user"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class SubjectAdmin(PowerModelView, model=Subject):
    name = "Subject"
    name_plural = "Subjects"
    icon = "fa-solid fa-book"
    column_list = [Subject.id, Subject.title, Subject.is_published, Subject.order, Subject.created_at]
    column_searchable_list = [Subject.title]
    column_sortable_list = [Subject.order, Subject.created_at]
    form_excluded_columns = ["chapters"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ChapterAdmin(PowerModelView, model=Chapter):
    name = "Chapter"
    name_plural = "Chapters"
    icon = "fa-solid fa-bookmark"
    column_list = [Chapter.id, Chapter.title, Chapter.subject_id, Chapter.order, Chapter.created_at]
    column_searchable_list = [Chapter.title]
    column_sortable_list = [Chapter.order]
    form_excluded_columns = ["subject", "lessons", "blocks", "sections"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class LessonAdmin(PowerModelView, model=Lesson):
    name = "Lesson"
    name_plural = "Lessons"
    icon = "fa-solid fa-video"
    column_list = [Lesson.id, Lesson.title, Lesson.chapter_id, Lesson.duration_seconds, Lesson.is_free_preview, Lesson.order]
    column_searchable_list = [Lesson.title]
    column_sortable_list = [Lesson.order]
    form_excluded_columns = ["chapter", "activities", "pdfs", "quiz", "quiz_triggers"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ChapterSectionAdmin(PowerModelView, model=ChapterSection):
    name = "Chapter Section"
    name_plural = "Chapter Sections"
    icon = "fa-solid fa-layer-group"
    column_list = [ChapterSection.id, ChapterSection.title, ChapterSection.chapter_id, ChapterSection.section_type, ChapterSection.order, ChapterSection.is_gating, ChapterSection.is_free_preview]
    column_searchable_list = [ChapterSection.title]
    column_sortable_list = [ChapterSection.order]
    form_excluded_columns = ["chapter"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ChapterBlockAdmin(PowerModelView, model=ChapterBlock):
    name = "Chapter Block"
    name_plural = "Chapter Blocks"
    icon = "fa-solid fa-paragraph"
    column_list = [ChapterBlock.id, ChapterBlock.title, ChapterBlock.chapter_id, ChapterBlock.block_type, ChapterBlock.order]
    form_excluded_columns = ["chapter"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ActivityAdmin(PowerModelView, model=Activity):
    name = "Activity"
    name_plural = "Activities"
    icon = "fa-solid fa-flask"
    column_list = [Activity.id, Activity.title, Activity.lesson_id, Activity.activity_type, Activity.order]
    column_searchable_list = [Activity.title]
    form_excluded_columns = ["lesson"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class CoursePDFAdmin(PowerModelView, model=CoursePDF):
    name = "Course PDF"
    name_plural = "Course PDFs"
    icon = "fa-solid fa-file-pdf"
    column_list = [CoursePDF.id, CoursePDF.title, CoursePDF.lesson_id, CoursePDF.order]
    form_excluded_columns = ["lesson"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizAdmin(PowerModelView, model=Quiz):
    name = "Quiz"
    name_plural = "Quizzes"
    icon = "fa-solid fa-question-circle"
    column_list = [Quiz.id, Quiz.title, Quiz.lesson_id, Quiz.pass_score, Quiz.created_at]
    form_excluded_columns = ["lesson", "questions", "results"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizQuestionAdmin(PowerModelView, model=QuizQuestion):
    name = "Quiz Question"
    name_plural = "Quiz Questions"
    icon = "fa-solid fa-list-ol"
    column_list = [QuizQuestion.id, QuizQuestion.quiz_id, QuizQuestion.text, QuizQuestion.order]
    column_searchable_list = [QuizQuestion.text]
    form_excluded_columns = ["quiz", "options"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizOptionAdmin(PowerModelView, model=QuizOption):
    name = "Quiz Option"
    name_plural = "Quiz Options"
    icon = "fa-solid fa-check-square"
    column_list = [QuizOption.id, QuizOption.question_id, QuizOption.text, QuizOption.is_correct]
    form_excluded_columns = ["question"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuestionSetAdmin(PowerModelView, model=QuestionSet):
    name = "Question Set"
    name_plural = "Question Sets"
    icon = "fa-solid fa-layer-group"
    column_list = [
        QuestionSet.id, QuestionSet.title, QuestionSet.subject_id, QuestionSet.topic_id,
        QuestionSet.topic_section_id, QuestionSet.topic_item_id, QuestionSet.tab_content_id,
        QuestionSet.pass_score, QuestionSet.status,
    ]
    column_searchable_list = [QuestionSet.title]
    form_excluded_columns = ["questions"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuestionAdmin(PowerModelView, model=Question):
    name = "Question"
    name_plural = "Questions"
    icon = "fa-solid fa-circle-question"
    column_list = [
        Question.id, Question.question_set_id, Question.external_id, Question.type,
        Question.title, Question.difficulty, Question.status, Question.order,
    ]
    column_searchable_list = [Question.title, Question.prompt, Question.external_id]
    form_excluded_columns = ["question_set", "attempts"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class LessonProgressAdmin(PowerModelView, model=LessonProgress):
    name = "Lesson Progress"
    name_plural = "Lesson Progress Records"
    icon = "fa-solid fa-chart-line"
    column_list = [LessonProgress.id, LessonProgress.user_id, LessonProgress.lesson_id, LessonProgress.watched_seconds, LessonProgress.status, LessonProgress.updated_at]
    form_excluded_columns = ["user", "lesson"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class UserXPAdmin(PowerModelView, model=UserXP):
    name = "User XP"
    name_plural = "User XP Records"
    icon = "fa-solid fa-star"
    column_list = [UserXP.id, UserXP.user_id, UserXP.total_xp, UserXP.streak_days, UserXP.last_active_date]
    column_sortable_list = [UserXP.total_xp, UserXP.streak_days]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class XPTransactionAdmin(PowerModelView, model=XPTransaction):
    name = "XP Transaction"
    name_plural = "XP Transactions"
    icon = "fa-solid fa-coins"
    column_list = [XPTransaction.id, XPTransaction.user_id, XPTransaction.amount, XPTransaction.reason, XPTransaction.description, XPTransaction.created_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class QuizResultAdmin(PowerModelView, model=QuizResult):
    name = "Quiz Result"
    name_plural = "Quiz Results"
    icon = "fa-solid fa-trophy"
    column_list = [QuizResult.id, QuizResult.user_id, QuizResult.quiz_id, QuizResult.score, QuizResult.passed, QuizResult.created_at]
    form_excluded_columns = ["user", "quiz"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class DailyQuestAdmin(PowerModelView, model=DailyQuest):
    name = "Daily Quest"
    name_plural = "Daily Quests"
    icon = "fa-solid fa-calendar-check"
    column_list = [DailyQuest.id, DailyQuest.user_id, DailyQuest.quest_type, DailyQuest.title, DailyQuest.progress, DailyQuest.target, DailyQuest.completed, DailyQuest.date]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class CalendarEventAdmin(PowerModelView, model=CalendarEvent):
    name = "Calendar Event"
    name_plural = "Calendar Events"
    icon = "fa-solid fa-calendar-days"
    column_list = [
        CalendarEvent.id, CalendarEvent.event_type, CalendarEvent.title,
        CalendarEvent.subject_id, CalendarEvent.topic_id, CalendarEvent.starts_at,
        CalendarEvent.ends_at, CalendarEvent.status,
    ]
    column_searchable_list = [CalendarEvent.title, CalendarEvent.subtitle, CalendarEvent.teacher_name]
    column_sortable_list = [CalendarEvent.starts_at, CalendarEvent.ends_at, CalendarEvent.status]
    form_excluded_columns = ["subject", "topic"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ContentProgressAdmin(PowerModelView, model=ContentProgress):
    name = "Content Progress"
    name_plural = "Content Progress Records"
    icon = "fa-solid fa-check"
    column_list = [ContentProgress.id, ContentProgress.user_id, ContentProgress.item_type, ContentProgress.item_id, ContentProgress.completed_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class VideoQuizTriggerAdmin(PowerModelView, model=VideoQuizTrigger):
    name = "Video Quiz Trigger"
    name_plural = "Video Quiz Triggers"
    icon = "fa-solid fa-clock"
    column_list = [VideoQuizTrigger.id, VideoQuizTrigger.lesson_id, VideoQuizTrigger.timestamp_seconds, VideoQuizTrigger.quiz_id, VideoQuizTrigger.is_blocking]
    form_excluded_columns = ["lesson"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TopicAdmin(PowerModelView, model=Topic):
    name = "Topic"
    name_plural = "Topics"
    icon = "fa-solid fa-diagram-project"
    column_list = [
        Topic.id, Topic.title, Topic.subject_id, Topic.status, Topic.order,
        Topic.is_free_preview, Topic.required_tier, Topic.required_feature_key,
    ]
    column_searchable_list = [Topic.title, Topic.slug]
    column_sortable_list = [Topic.order, Topic.created_at]
    form_excluded_columns = ["subject", "course_offering", "sections", "resources"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TopicSectionAdmin(PowerModelView, model=TopicSection):
    name = "Topic Section"
    name_plural = "Topic Sections"
    icon = "fa-solid fa-list"
    column_list = [TopicSection.id, TopicSection.topic_id, TopicSection.title, TopicSection.section_type, TopicSection.order]
    form_excluded_columns = ["topic", "items"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TopicItemAdmin(PowerModelView, model=TopicItem):
    name = "Topic Item"
    name_plural = "Topic Items"
    icon = "fa-solid fa-play"
    column_list = [
        TopicItem.id, TopicItem.topic_id, TopicItem.section_id, TopicItem.title,
        TopicItem.item_type, TopicItem.status, TopicItem.order,
        TopicItem.is_free_preview, TopicItem.required_tier, TopicItem.required_feature_key,
    ]
    column_searchable_list = [TopicItem.title]
    form_excluded_columns = ["topic", "section", "primary_resource", "tabs"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ResourceAdmin(PowerModelView, model=Resource):
    name = "Resource"
    name_plural = "Resources"
    icon = "fa-solid fa-folder-open"
    column_list = [
        Resource.id, Resource.topic_id, Resource.title, Resource.resource_type,
        Resource.provider, Resource.status, Resource.is_free_preview,
        Resource.required_tier, Resource.required_feature_key,
    ]
    column_searchable_list = [Resource.title]
    form_excluded_columns = ["topic"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TabContentAdmin(PowerModelView, model=TabContent):
    name = "Tab Content"
    name_plural = "Tab Contents"
    icon = "fa-solid fa-table-columns"
    column_list = [
        TabContent.id, TabContent.topic_item_id, TabContent.label, TabContent.tab_type,
        TabContent.status, TabContent.order, TabContent.required_tier,
        TabContent.required_feature_key,
    ]
    form_excluded_columns = ["topic_item", "resource"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ConceptTagAdmin(PowerModelView, model=ConceptTag):
    name = "Concept Tag"
    name_plural = "Concept Tags"
    icon = "fa-solid fa-tag"
    column_list = [ConceptTag.id, ConceptTag.slug, ConceptTag.label, ConceptTag.tag_type]
    column_searchable_list = [ConceptTag.slug, ConceptTag.label]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ExamAdmin(PowerModelView, model=Exam):
    name = "Exam"
    name_plural = "Exams"
    icon = "fa-solid fa-file-lines"
    column_list = [
        Exam.id, Exam.subject_id, Exam.title, Exam.year, Exam.session,
        Exam.status, Exam.is_free_preview, Exam.required_tier, Exam.required_feature_key,
    ]
    form_excluded_columns = ["subject", "problems"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ExamProblemAdmin(PowerModelView, model=ExamProblem):
    name = "Exam Problem"
    name_plural = "Exam Problems"
    icon = "fa-solid fa-clipboard-question"
    column_list = [
        ExamProblem.id, ExamProblem.exam_id, ExamProblem.topic_id, ExamProblem.title,
        ExamProblem.difficulty, ExamProblem.status, ExamProblem.is_free_preview,
        ExamProblem.required_tier, ExamProblem.required_feature_key,
    ]
    column_searchable_list = [ExamProblem.title, ExamProblem.statement]
    form_excluded_columns = ["exam", "topic", "video_resource"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class UserNoteAdmin(PowerModelView, model=UserNote):
    name = "User Note"
    name_plural = "User Notes"
    icon = "fa-solid fa-note-sticky"
    column_list = [UserNote.id, UserNote.user_id, UserNote.topic_id, UserNote.topic_item_id, UserNote.updated_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class SavedItemAdmin(PowerModelView, model=SavedItem):
    name = "Saved Item"
    name_plural = "Saved Items"
    icon = "fa-solid fa-bookmark"
    column_list = [SavedItem.id, SavedItem.user_id, SavedItem.target_type, SavedItem.target_id, SavedItem.label, SavedItem.created_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class ActivityEventAdmin(PowerModelView, model=ActivityEvent):
    name = "Activity Event"
    name_plural = "Activity Events"
    icon = "fa-solid fa-wave-square"
    column_list = [ActivityEvent.id, ActivityEvent.user_id, ActivityEvent.event_type, ActivityEvent.target_type, ActivityEvent.target_id, ActivityEvent.created_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class TopicItemProgressAdmin(PowerModelView, model=TopicItemProgress):
    name = "Topic Item Progress"
    name_plural = "Topic Item Progress"
    icon = "fa-solid fa-bars-progress"
    column_list = [TopicItemProgress.id, TopicItemProgress.user_id, TopicItemProgress.topic_id, TopicItemProgress.topic_item_id, TopicItemProgress.status, TopicItemProgress.best_score]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizAttemptAdmin(PowerModelView, model=QuizAttempt):
    name = "Quiz Attempt"
    name_plural = "Quiz Attempts"
    icon = "fa-solid fa-circle-check"
    column_list = [
        QuizAttempt.id, QuizAttempt.user_id, QuizAttempt.question_set_id,
        QuizAttempt.subject_id, QuizAttempt.topic_id, QuizAttempt.topic_section_id,
        QuizAttempt.topic_item_id, QuizAttempt.tab_content_id, QuizAttempt.score,
        QuizAttempt.passed, QuizAttempt.attempt_number,
    ]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class QuestionAttemptAdmin(PowerModelView, model=QuestionAttempt):
    name = "Question Attempt"
    name_plural = "Question Attempts"
    icon = "fa-solid fa-check-double"
    column_list = [
        QuestionAttempt.id, QuestionAttempt.user_id, QuestionAttempt.quiz_attempt_id,
        QuestionAttempt.question_id, QuestionAttempt.subject_id, QuestionAttempt.topic_id,
        QuestionAttempt.topic_section_id, QuestionAttempt.topic_item_id,
        QuestionAttempt.is_correct, QuestionAttempt.created_at,
    ]
    form_excluded_columns = ["user", "quiz_attempt", "question"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class CommentAdmin(PowerModelView, model=Comment):
    name = "Comment"
    name_plural = "Comments"
    icon = "fa-solid fa-comment"
    column_list = [Comment.id, Comment.user_id, Comment.target_type, Comment.target_id, Comment.body, Comment.parent_id, Comment.created_at]
    column_searchable_list = [Comment.body]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class NotificationAdmin(PowerModelView, model=Notification):
    name = "Notification"
    name_plural = "Notifications"
    icon = "fa-solid fa-bell"
    column_list = [Notification.id, Notification.user_id, Notification.type, Notification.title, Notification.body, Notification.is_read, Notification.created_at]
    column_searchable_list = [Notification.title, Notification.body]
    column_sortable_list = [Notification.created_at, Notification.is_read]
    form_excluded_columns = ["user"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ProgramTrackAdmin(PowerModelView, model=ProgramTrack):
    name = "Program Track"
    name_plural = "Program Tracks"
    icon = "fa-solid fa-route"
    column_list = [ProgramTrack.id, ProgramTrack.niveau, ProgramTrack.filiere, ProgramTrack.title, ProgramTrack.status]
    column_searchable_list = [ProgramTrack.niveau, ProgramTrack.filiere, ProgramTrack.title]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class CourseOfferingAdmin(PowerModelView, model=CourseOffering):
    name = "Course Offering"
    name_plural = "Course Offerings"
    icon = "fa-solid fa-chalkboard-user"
    column_list = [CourseOffering.id, CourseOffering.subject_id, CourseOffering.track_id, CourseOffering.professor_user_id, CourseOffering.title, CourseOffering.status]
    column_searchable_list = [CourseOffering.title]
    form_excluded_columns = ["subject", "track", "professor"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class LiveSessionAdmin(PowerModelView, model=LiveSession):
    name = "Live Session"
    name_plural = "Live Sessions"
    icon = "fa-solid fa-tower-broadcast"
    column_list = [
        LiveSession.id,
        LiveSession.course_offering_id,
        LiveSession.professor_user_id,
        LiveSession.title,
        LiveSession.starts_at,
        LiveSession.status,
        LiveSession.notification_status,
        LiveSession.vdocipher_live_id,
        LiveSession.stream_ingest_url,
        LiveSession.stream_key,
    ]
    column_searchable_list = [LiveSession.title, LiveSession.description, LiveSession.vdocipher_live_id, LiveSession.stream_ingest_url, LiveSession.stream_key]
    form_excluded_columns = ["course_offering", "professor", "calendar_event", "recording_resource"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class LiveSessionInteractionAdmin(PowerModelView, model=LiveSessionInteraction):
    name = "Live Interaction"
    name_plural = "Live Interactions"
    icon = "fa-solid fa-circle-question"
    column_list = [
        LiveSessionInteraction.id,
        LiveSessionInteraction.live_session_id,
        LiveSessionInteraction.student_user_id,
        LiveSessionInteraction.kind,
        LiveSessionInteraction.status,
        LiveSessionInteraction.created_at,
    ]
    column_searchable_list = [LiveSessionInteraction.body, LiveSessionInteraction.answer]
    form_excluded_columns = ["live_session", "course_offering", "professor", "student", "answered_by"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class LiveSessionCheckpointAdmin(PowerModelView, model=LiveSessionCheckpoint):
    name = "Live Checkpoint"
    name_plural = "Live Checkpoints"
    icon = "fa-solid fa-list-check"
    column_list = [
        LiveSessionCheckpoint.id,
        LiveSessionCheckpoint.live_session_id,
        LiveSessionCheckpoint.professor_user_id,
        LiveSessionCheckpoint.title,
        LiveSessionCheckpoint.checkpoint_type,
        LiveSessionCheckpoint.status,
        LiveSessionCheckpoint.created_at,
    ]
    column_searchable_list = [LiveSessionCheckpoint.title, LiveSessionCheckpoint.prompt]
    form_excluded_columns = ["live_session", "course_offering", "professor"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class ProfessorChangeRequestAdmin(PowerModelView, model=ProfessorChangeRequest):
    name = "Professor Change Request"
    name_plural = "Professor Change Requests"
    icon = "fa-solid fa-pen-to-square"
    column_list = [ProfessorChangeRequest.id, ProfessorChangeRequest.course_offering_id, ProfessorChangeRequest.professor_user_id, ProfessorChangeRequest.target_type, ProfessorChangeRequest.target_id, ProfessorChangeRequest.status, ProfessorChangeRequest.created_at]
    form_excluded_columns = ["course_offering", "professor", "admin"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class ProfessorChatConversationAdmin(PowerModelView, model=ProfessorChatConversation):
    name = "Professor Chat Conversation"
    name_plural = "Professor Chat Conversations"
    icon = "fa-solid fa-comments"
    column_list = [ProfessorChatConversation.id, ProfessorChatConversation.course_offering_id, ProfessorChatConversation.professor_user_id, ProfessorChatConversation.student_user_id, ProfessorChatConversation.unread_for_professor, ProfessorChatConversation.is_pinned_by_professor, ProfessorChatConversation.last_message_at]
    form_excluded_columns = ["course_offering", "professor", "student", "messages"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class ProfessorChatMessageAdmin(PowerModelView, model=ProfessorChatMessage):
    name = "Professor Chat Message"
    name_plural = "Professor Chat Messages"
    icon = "fa-solid fa-message"
    column_list = [ProfessorChatMessage.id, ProfessorChatMessage.conversation_id, ProfessorChatMessage.sender_user_id, ProfessorChatMessage.status, ProfessorChatMessage.created_at]
    column_searchable_list = [ProfessorChatMessage.body]
    form_excluded_columns = ["conversation", "sender"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class AdminAuditLogAdmin(PowerModelView, model=AdminAuditLog):
    name = "Admin Audit Log"
    name_plural = "Admin Audit Logs"
    icon = "fa-solid fa-clipboard-list"
    can_create = False
    can_edit = False
    can_delete = False
    can_view_details = True


ALL_VIEWS = [
    UserAdmin, UserSubjectEntitlementAdmin, SubjectAdmin, ChapterAdmin, LessonAdmin, ChapterSectionAdmin,
    ChapterBlockAdmin, ActivityAdmin, CoursePDFAdmin, QuizAdmin, QuizQuestionAdmin,
    QuizOptionAdmin, QuestionSetAdmin, QuestionAdmin, LessonProgressAdmin, UserXPAdmin, XPTransactionAdmin,
    QuizResultAdmin, DailyQuestAdmin, CalendarEventAdmin, ContentProgressAdmin, VideoQuizTriggerAdmin,
    TopicAdmin, TopicSectionAdmin, TopicItemAdmin, ResourceAdmin, TabContentAdmin,
    ConceptTagAdmin, ExamAdmin, ExamProblemAdmin, UserNoteAdmin, SavedItemAdmin,
    ActivityEventAdmin, TopicItemProgressAdmin, QuizAttemptAdmin, QuestionAttemptAdmin, CommentAdmin,
    NotificationAdmin, ProgramTrackAdmin, CourseOfferingAdmin, LiveSessionAdmin,
    LiveSessionInteractionAdmin, LiveSessionCheckpointAdmin,
    ProfessorChangeRequestAdmin, ProfessorChatConversationAdmin, ProfessorChatMessageAdmin,
    AdminAuditLogAdmin,
]


TRACKING_COLUMN_NAMES = {
    "id",
    "created_at",
    "updated_at",
    "completed_at",
    "starts_at",
    "ends_at",
    "date",
    "last_active_date",
    "last_login",
    "order",
    "status",
    "is_active",
    "is_published",
    "is_free_preview",
    "is_pro",
    "is_staff",
    "is_superuser",
    "is_email_verified",
    "is_pinned_by_professor",
    "passed",
    "completed",
    "score",
    "best_score",
    "latest_score",
    "total_xp",
    "streak_days",
    "attempt_number",
    "duration_seconds",
    "watched_seconds",
    "year",
}

SENSITIVE_COLUMN_NAMES = {
    "password",
}

IMMUTABLE_ADMIN_MODELS = {
    "AdminAuditLog",
}

FILTERABLE_CHOICE_COLUMN_NAMES = {
    "activity_type",
    "block_type",
    "category",
    "content_type",
    "event_type",
    "filiere",
    "item_type",
    "niveau",
    "notification_type",
    "provider",
    "renderer_key",
    "role",
    "section_type",
    "source",
    "status",
    "subject_type",
    "type",
}


def _model_columns(view: type[ModelView]):
    return list(view.model.__mapper__.columns)


def _admin_attr(model, column):
    return getattr(model, column.key)


def _is_searchable_column(column) -> bool:
    return column.key not in SENSITIVE_COLUMN_NAMES and isinstance(column.type, (String, Text))


def _is_sortable_column(column) -> bool:
    if column.key in SENSITIVE_COLUMN_NAMES:
        return False
    return column.key in TRACKING_COLUMN_NAMES or isinstance(
        column.type,
        (String, Integer, Boolean, Date, DateTime),
    )


def _admin_filter_for_column(model: type, column):
    if column.key in SENSITIVE_COLUMN_NAMES:
        return None

    attr = _admin_attr(model, column)
    if isinstance(column.type, Boolean):
        return BooleanFilter(attr)
    if column.key in FILTERABLE_CHOICE_COLUMN_NAMES and isinstance(column.type, String):
        return AllUniqueStringValuesFilter(attr)
    return None


def configure_power_admin_view(view: type[ModelView]) -> None:
    model = view.model
    columns = _model_columns(view)
    visible_columns = [column for column in columns if column.key not in SENSITIVE_COLUMN_NAMES]
    scalar_attrs = [_admin_attr(model, column) for column in visible_columns]

    view.column_list = scalar_attrs
    view.column_details_list = scalar_attrs
    view.column_export_list = scalar_attrs
    view.column_searchable_list = [
        _admin_attr(model, column)
        for column in columns
        if _is_searchable_column(column)
    ]
    view.column_sortable_list = [
        _admin_attr(model, column)
        for column in columns
        if _is_sortable_column(column)
    ]
    view.column_filters = [
        column_filter
        for column in columns
        if (column_filter := _admin_filter_for_column(model, column)) is not None
    ]
    view.column_default_sort = [(model.created_at, True)] if hasattr(model, "created_at") else [(model.id, True)]
    view.page_size = 50
    view.page_size_options = [25, 50, 100, 250]
    is_immutable = model.__name__ in IMMUTABLE_ADMIN_MODELS
    view.can_create = not is_immutable
    view.can_edit = not is_immutable
    view.can_delete = not is_immutable
    view.can_export = True
    view.can_view_details = True


for admin_view in ALL_VIEWS:
    configure_power_admin_view(admin_view)


def register_admin_views(admin) -> None:
    for view in ALL_VIEWS:
        admin.add_view(view)
