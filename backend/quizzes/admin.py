from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline, StackedInline
from quizzes.models import Quiz, QuizQuestion, QuizOption


class QuizOptionInline(TabularInline):
    model = QuizOption
    extra = 4
    fields = ('text', 'is_correct')
    min_num = 2


class QuizQuestionInline(StackedInline):
    model = QuizQuestion
    extra = 1
    fields = ('text', 'order')
    show_change_link = True
    classes = ['collapse']


@admin.register(Quiz)
class QuizAdmin(ModelAdmin):
    list_display = ('title', 'lesson', 'question_count', 'pass_score', 'created_at')
    list_filter = ('lesson__chapter__subject',)
    search_fields = ('title', 'lesson__title')
    inlines = [QuizQuestionInline]
    fieldsets = (
        ('Informations du Quiz', {
            'fields': ('lesson', 'title', 'pass_score'),
            'description': 'Score minimum de 80% requis pour debloquer la lecon suivante.',
        }),
    )

    def question_count(self, obj):
        return obj.questions.count()
    question_count.short_description = 'Questions'


@admin.register(QuizQuestion)
class QuizQuestionAdmin(ModelAdmin):
    list_display = ('short_text', 'quiz', 'option_count', 'order')
    list_filter = ('quiz__lesson__chapter__subject',)
    search_fields = ('text',)
    inlines = [QuizOptionInline]

    def short_text(self, obj):
        return obj.text[:80] + ('...' if len(obj.text) > 80 else '')
    short_text.short_description = 'Question'

    def option_count(self, obj):
        return obj.options.count()
    option_count.short_description = 'Options'


@admin.register(QuizOption)
class QuizOptionAdmin(ModelAdmin):
    list_display = ('text', 'question', 'is_correct')
    list_filter = ('is_correct',)
