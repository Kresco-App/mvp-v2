from django.contrib import admin
from unfold.admin import ModelAdmin
from gamification.models import (
    LessonProgress, ContentProgress, UserXP, XPTransaction, QuizResult, VideoQuizTrigger,
)


@admin.register(LessonProgress)
class LessonProgressAdmin(ModelAdmin):
    list_display = ('user', 'lesson', 'watched_seconds', 'status', 'updated_at')
    list_filter = ('status',)
    search_fields = ('user__email', 'lesson__title')
    readonly_fields = ('updated_at', 'created_at')


@admin.register(ContentProgress)
class ContentProgressAdmin(ModelAdmin):
    list_display = ('user', 'item_type', 'item_id', 'completed_at')
    list_filter = ('item_type',)
    search_fields = ('user__email',)


@admin.register(UserXP)
class UserXPAdmin(ModelAdmin):
    list_display = ('user', 'total_xp', 'level', 'streak_days', 'last_active_date')
    search_fields = ('user__email',)
    readonly_fields = ('level', 'xp_progress_pct', 'xp_for_next_level')


@admin.register(XPTransaction)
class XPTransactionAdmin(ModelAdmin):
    list_display = ('user', 'amount', 'reason', 'description', 'created_at')
    list_filter = ('reason',)
    search_fields = ('user__email', 'description')


@admin.register(QuizResult)
class QuizResultAdmin(ModelAdmin):
    list_display = ('user', 'quiz', 'score', 'passed', 'created_at')
    list_filter = ('passed',)
    search_fields = ('user__email', 'quiz__title')


@admin.register(VideoQuizTrigger)
class VideoQuizTriggerAdmin(ModelAdmin):
    list_display = ('lesson', 'timestamp_seconds', 'quiz', 'is_blocking')
    list_filter = ('is_blocking',)
    search_fields = ('lesson__title',)
