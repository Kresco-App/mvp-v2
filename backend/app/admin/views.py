from sqladmin import ModelView

from app.models.calendar import CalendarEvent
from app.models.courses import (
    Activity, Chapter, ChapterBlock, ChapterSection, ConceptTag, CoursePDF, Exam,
    ExamProblem, Lesson, Resource, Subject, TabContent, Topic, TopicItem, TopicSection,
    VideoQuizTrigger,
)
from app.models.gamification import (
    ActivityEvent, ContentProgress, DailyQuest, LessonProgress, QuizAttempt, QuizResult,
    TopicItemProgress, UserXP, XPTransaction,
)
from app.models.interactions import Comment, SavedItem, UserNote
from app.models.notifications import Notification
from app.models.quizzes import Quiz, QuizOption, QuizQuestion
from app.models.users import User


class UserAdmin(ModelView, model=User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    column_list = [User.id, User.email, User.full_name, User.role, User.is_pro, User.niveau, User.filiere, User.is_active, User.is_email_verified, User.created_at]
    column_searchable_list = [User.email, User.full_name]
    column_sortable_list = [User.created_at, User.is_pro, User.role]
    form_excluded_columns = ["password", "last_login", "lesson_progress", "content_progress",
                             "xp", "xp_transactions", "quiz_results", "daily_quests", "comments", "notifications"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class SubjectAdmin(ModelView, model=Subject):
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


class ChapterAdmin(ModelView, model=Chapter):
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


class LessonAdmin(ModelView, model=Lesson):
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


class ChapterSectionAdmin(ModelView, model=ChapterSection):
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


class ChapterBlockAdmin(ModelView, model=ChapterBlock):
    name = "Chapter Block"
    name_plural = "Chapter Blocks"
    icon = "fa-solid fa-paragraph"
    column_list = [ChapterBlock.id, ChapterBlock.title, ChapterBlock.chapter_id, ChapterBlock.block_type, ChapterBlock.order]
    form_excluded_columns = ["chapter"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ActivityAdmin(ModelView, model=Activity):
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


class CoursePDFAdmin(ModelView, model=CoursePDF):
    name = "Course PDF"
    name_plural = "Course PDFs"
    icon = "fa-solid fa-file-pdf"
    column_list = [CoursePDF.id, CoursePDF.title, CoursePDF.lesson_id, CoursePDF.order]
    form_excluded_columns = ["lesson"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizAdmin(ModelView, model=Quiz):
    name = "Quiz"
    name_plural = "Quizzes"
    icon = "fa-solid fa-question-circle"
    column_list = [Quiz.id, Quiz.title, Quiz.lesson_id, Quiz.pass_score, Quiz.created_at]
    form_excluded_columns = ["lesson", "questions", "results"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizQuestionAdmin(ModelView, model=QuizQuestion):
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


class QuizOptionAdmin(ModelView, model=QuizOption):
    name = "Quiz Option"
    name_plural = "Quiz Options"
    icon = "fa-solid fa-check-square"
    column_list = [QuizOption.id, QuizOption.question_id, QuizOption.text, QuizOption.is_correct]
    form_excluded_columns = ["question"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class LessonProgressAdmin(ModelView, model=LessonProgress):
    name = "Lesson Progress"
    name_plural = "Lesson Progress Records"
    icon = "fa-solid fa-chart-line"
    column_list = [LessonProgress.id, LessonProgress.user_id, LessonProgress.lesson_id, LessonProgress.watched_seconds, LessonProgress.status, LessonProgress.updated_at]
    form_excluded_columns = ["user", "lesson"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class UserXPAdmin(ModelView, model=UserXP):
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


class XPTransactionAdmin(ModelView, model=XPTransaction):
    name = "XP Transaction"
    name_plural = "XP Transactions"
    icon = "fa-solid fa-coins"
    column_list = [XPTransaction.id, XPTransaction.user_id, XPTransaction.amount, XPTransaction.reason, XPTransaction.description, XPTransaction.created_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class QuizResultAdmin(ModelView, model=QuizResult):
    name = "Quiz Result"
    name_plural = "Quiz Results"
    icon = "fa-solid fa-trophy"
    column_list = [QuizResult.id, QuizResult.user_id, QuizResult.quiz_id, QuizResult.score, QuizResult.passed, QuizResult.created_at]
    form_excluded_columns = ["user", "quiz"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class DailyQuestAdmin(ModelView, model=DailyQuest):
    name = "Daily Quest"
    name_plural = "Daily Quests"
    icon = "fa-solid fa-calendar-check"
    column_list = [DailyQuest.id, DailyQuest.user_id, DailyQuest.quest_type, DailyQuest.title, DailyQuest.progress, DailyQuest.target, DailyQuest.completed, DailyQuest.date]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class CalendarEventAdmin(ModelView, model=CalendarEvent):
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


class ContentProgressAdmin(ModelView, model=ContentProgress):
    name = "Content Progress"
    name_plural = "Content Progress Records"
    icon = "fa-solid fa-check"
    column_list = [ContentProgress.id, ContentProgress.user_id, ContentProgress.item_type, ContentProgress.item_id, ContentProgress.completed_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class VideoQuizTriggerAdmin(ModelView, model=VideoQuizTrigger):
    name = "Video Quiz Trigger"
    name_plural = "Video Quiz Triggers"
    icon = "fa-solid fa-clock"
    column_list = [VideoQuizTrigger.id, VideoQuizTrigger.lesson_id, VideoQuizTrigger.timestamp_seconds, VideoQuizTrigger.quiz_id, VideoQuizTrigger.is_blocking]
    form_excluded_columns = ["lesson"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TopicAdmin(ModelView, model=Topic):
    name = "Topic"
    name_plural = "Topics"
    icon = "fa-solid fa-diagram-project"
    column_list = [Topic.id, Topic.title, Topic.subject_id, Topic.status, Topic.order, Topic.is_free_preview]
    column_searchable_list = [Topic.title, Topic.slug]
    column_sortable_list = [Topic.order, Topic.created_at]
    form_excluded_columns = ["subject", "sections", "resources"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TopicSectionAdmin(ModelView, model=TopicSection):
    name = "Topic Section"
    name_plural = "Topic Sections"
    icon = "fa-solid fa-list"
    column_list = [TopicSection.id, TopicSection.topic_id, TopicSection.title, TopicSection.section_type, TopicSection.order]
    form_excluded_columns = ["topic", "items"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TopicItemAdmin(ModelView, model=TopicItem):
    name = "Topic Item"
    name_plural = "Topic Items"
    icon = "fa-solid fa-play"
    column_list = [TopicItem.id, TopicItem.topic_id, TopicItem.section_id, TopicItem.title, TopicItem.item_type, TopicItem.status, TopicItem.order]
    column_searchable_list = [TopicItem.title]
    form_excluded_columns = ["topic", "section", "primary_resource", "tabs"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ResourceAdmin(ModelView, model=Resource):
    name = "Resource"
    name_plural = "Resources"
    icon = "fa-solid fa-folder-open"
    column_list = [Resource.id, Resource.topic_id, Resource.title, Resource.resource_type, Resource.provider, Resource.status]
    column_searchable_list = [Resource.title]
    form_excluded_columns = ["topic"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class TabContentAdmin(ModelView, model=TabContent):
    name = "Tab Content"
    name_plural = "Tab Contents"
    icon = "fa-solid fa-table-columns"
    column_list = [TabContent.id, TabContent.topic_item_id, TabContent.label, TabContent.tab_type, TabContent.status, TabContent.order]
    form_excluded_columns = ["topic_item", "resource"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ConceptTagAdmin(ModelView, model=ConceptTag):
    name = "Concept Tag"
    name_plural = "Concept Tags"
    icon = "fa-solid fa-tag"
    column_list = [ConceptTag.id, ConceptTag.slug, ConceptTag.label, ConceptTag.tag_type]
    column_searchable_list = [ConceptTag.slug, ConceptTag.label]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ExamAdmin(ModelView, model=Exam):
    name = "Exam"
    name_plural = "Exams"
    icon = "fa-solid fa-file-lines"
    column_list = [Exam.id, Exam.subject_id, Exam.title, Exam.year, Exam.session, Exam.status]
    form_excluded_columns = ["subject", "problems"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class ExamProblemAdmin(ModelView, model=ExamProblem):
    name = "Exam Problem"
    name_plural = "Exam Problems"
    icon = "fa-solid fa-clipboard-question"
    column_list = [ExamProblem.id, ExamProblem.exam_id, ExamProblem.topic_id, ExamProblem.title, ExamProblem.difficulty, ExamProblem.status]
    column_searchable_list = [ExamProblem.title, ExamProblem.statement]
    form_excluded_columns = ["exam", "topic", "video_resource"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


class UserNoteAdmin(ModelView, model=UserNote):
    name = "User Note"
    name_plural = "User Notes"
    icon = "fa-solid fa-note-sticky"
    column_list = [UserNote.id, UserNote.user_id, UserNote.topic_id, UserNote.topic_item_id, UserNote.updated_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class SavedItemAdmin(ModelView, model=SavedItem):
    name = "Saved Item"
    name_plural = "Saved Items"
    icon = "fa-solid fa-bookmark"
    column_list = [SavedItem.id, SavedItem.user_id, SavedItem.target_type, SavedItem.target_id, SavedItem.label, SavedItem.created_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class ActivityEventAdmin(ModelView, model=ActivityEvent):
    name = "Activity Event"
    name_plural = "Activity Events"
    icon = "fa-solid fa-wave-square"
    column_list = [ActivityEvent.id, ActivityEvent.user_id, ActivityEvent.event_type, ActivityEvent.target_type, ActivityEvent.target_id, ActivityEvent.created_at]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class TopicItemProgressAdmin(ModelView, model=TopicItemProgress):
    name = "Topic Item Progress"
    name_plural = "Topic Item Progress"
    icon = "fa-solid fa-bars-progress"
    column_list = [TopicItemProgress.id, TopicItemProgress.user_id, TopicItemProgress.topic_id, TopicItemProgress.topic_item_id, TopicItemProgress.status, TopicItemProgress.best_score]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class QuizAttemptAdmin(ModelView, model=QuizAttempt):
    name = "Quiz Attempt"
    name_plural = "Quiz Attempts"
    icon = "fa-solid fa-circle-check"
    column_list = [QuizAttempt.id, QuizAttempt.user_id, QuizAttempt.topic_item_id, QuizAttempt.tab_content_id, QuizAttempt.score, QuizAttempt.passed, QuizAttempt.attempt_number]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = False
    can_delete = True
    can_view_details = True


class CommentAdmin(ModelView, model=Comment):
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


class NotificationAdmin(ModelView, model=Notification):
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


ALL_VIEWS = [
    UserAdmin, SubjectAdmin, ChapterAdmin, LessonAdmin, ChapterSectionAdmin,
    ChapterBlockAdmin, ActivityAdmin, CoursePDFAdmin, QuizAdmin, QuizQuestionAdmin,
    QuizOptionAdmin, LessonProgressAdmin, UserXPAdmin, XPTransactionAdmin,
    QuizResultAdmin, DailyQuestAdmin, CalendarEventAdmin, ContentProgressAdmin, VideoQuizTriggerAdmin,
    TopicAdmin, TopicSectionAdmin, TopicItemAdmin, ResourceAdmin, TabContentAdmin,
    ConceptTagAdmin, ExamAdmin, ExamProblemAdmin, UserNoteAdmin, SavedItemAdmin,
    ActivityEventAdmin, TopicItemProgressAdmin, QuizAttemptAdmin, CommentAdmin,
    NotificationAdmin,
]


def register_admin_views(admin) -> None:
    for view in ALL_VIEWS:
        admin.add_view(view)
