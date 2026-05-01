from sqladmin import ModelView
from sqladmin.filters import AllUniqueStringValuesFilter, BooleanFilter, StaticValuesFilter

from app.models.courses import Activity, Chapter, ChapterBlock, ChapterSection, CoursePDF, Lesson, Subject, VideoQuizTrigger
from app.models.gamification import ContentProgress, DailyQuest, LessonProgress, QuizResult, UserXP, XPTransaction
from app.models.interactions import Comment
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
    column_filters = [
        AllUniqueStringValuesFilter(User.role, title="Role"),
        BooleanFilter(User.is_pro, title="Pro"),
        BooleanFilter(User.is_active, title="Active"),
        BooleanFilter(User.is_email_verified, title="Email Verified"),
        AllUniqueStringValuesFilter(User.niveau, title="Niveau"),
    ]
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
    column_filters = [BooleanFilter(Subject.is_published, title="Published")]
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
    column_filters = [BooleanFilter(Lesson.is_free_preview, title="Free Preview")]
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
    column_filters = [
        StaticValuesFilter(ChapterSection.section_type, title="Type", values=[
            ("video", "Video"), ("quiz", "Quiz"), ("activity", "Activity"), ("text", "Text"),
        ]),
        BooleanFilter(ChapterSection.is_gating, title="Gating"),
        BooleanFilter(ChapterSection.is_free_preview, title="Free Preview"),
    ]
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
    column_filters = [AllUniqueStringValuesFilter(ChapterBlock.block_type, title="Block Type")]
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
    column_filters = [AllUniqueStringValuesFilter(Activity.activity_type, title="Activity Type")]
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
    column_filters = [BooleanFilter(QuizOption.is_correct, title="Correct")]
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
    column_filters = [AllUniqueStringValuesFilter(LessonProgress.status, title="Status")]
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
    column_filters = [AllUniqueStringValuesFilter(XPTransaction.reason, title="Reason")]
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
    column_filters = [BooleanFilter(QuizResult.passed, title="Passed")]
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
    column_filters = [
        BooleanFilter(DailyQuest.completed, title="Completed"),
        AllUniqueStringValuesFilter(DailyQuest.quest_type, title="Quest Type"),
    ]
    form_excluded_columns = ["user"]
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class ContentProgressAdmin(ModelView, model=ContentProgress):
    name = "Content Progress"
    name_plural = "Content Progress Records"
    icon = "fa-solid fa-check"
    column_list = [ContentProgress.id, ContentProgress.user_id, ContentProgress.item_type, ContentProgress.item_id, ContentProgress.completed_at]
    column_filters = [AllUniqueStringValuesFilter(ContentProgress.item_type, title="Item Type")]
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


class CommentAdmin(ModelView, model=Comment):
    name = "Comment"
    name_plural = "Comments"
    icon = "fa-solid fa-comment"
    column_list = [Comment.id, Comment.user_id, Comment.target_type, Comment.target_id, Comment.body, Comment.parent_id, Comment.created_at]
    column_searchable_list = [Comment.body]
    column_filters = [
        StaticValuesFilter(Comment.target_type, title="Target Type", values=[
            ("lesson", "Lesson"), ("chapter", "Chapter"), ("section", "Section"),
        ]),
    ]
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
    column_filters = [
        AllUniqueStringValuesFilter(Notification.type, title="Type"),
        BooleanFilter(Notification.is_read, title="Read"),
    ]
    form_excluded_columns = ["user"]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True


ALL_VIEWS = [
    UserAdmin, SubjectAdmin, ChapterAdmin, LessonAdmin, ChapterSectionAdmin,
    ChapterBlockAdmin, ActivityAdmin, CoursePDFAdmin, QuizAdmin, QuizQuestionAdmin,
    QuizOptionAdmin, LessonProgressAdmin, UserXPAdmin, XPTransactionAdmin,
    QuizResultAdmin, DailyQuestAdmin, ContentProgressAdmin, VideoQuizTriggerAdmin,
    CommentAdmin, NotificationAdmin,
]


def register_admin_views(admin) -> None:
    for view in ALL_VIEWS:
        admin.add_view(view)
