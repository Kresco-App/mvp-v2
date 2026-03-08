from django.contrib import admin
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline, StackedInline
from courses.models import Subject, Chapter, Lesson, ChapterBlock, Activity, CoursePDF, ChapterSection


class LessonInline(TabularInline):
    model = Lesson
    extra = 1
    fields = ('title', 'vdocipher_id', 'duration_seconds', 'is_free_preview', 'order')


class ChapterBlockInline(TabularInline):
    model = ChapterBlock
    extra = 1
    fields = ('title', 'block_type', 'content', 'order')


class ChapterSectionInline(TabularInline):
    model = ChapterSection
    extra = 0
    fields = ['order', 'title', 'section_type', 'is_gating', 'is_free_preview', 'vdocipher_id', 'duration_seconds', 'activity_type', 'pass_score']
    ordering = ['order']


class ChapterInline(TabularInline):
    model = Chapter
    extra = 1
    fields = ('title', 'description', 'order')
    show_change_link = True


class ActivityInline(StackedInline):
    model = Activity
    extra = 0
    fields = ('title', 'activity_type', 'config_json', 'react_component_url', 'order')
    classes = ['collapse']


class CoursePDFInline(TabularInline):
    model = CoursePDF
    extra = 0
    fields = ('title', 'file_url', 'order')


@admin.register(Subject)
class SubjectAdmin(ModelAdmin):
    list_display = ('title', 'chapter_count', 'lesson_count', 'is_published', 'order')
    list_filter = ('is_published',)
    search_fields = ('title',)
    list_editable = ('is_published', 'order')
    inlines = [ChapterInline]

    def chapter_count(self, obj):
        return obj.chapters.count()
    chapter_count.short_description = 'Chapitres'

    def lesson_count(self, obj):
        return sum(ch.lessons.count() for ch in obj.chapters.all())
    lesson_count.short_description = 'Lecons'


@admin.register(Chapter)
class ChapterAdmin(ModelAdmin):
    list_display = ('title', 'subject', 'lesson_count', 'block_count', 'section_count', 'order')
    list_filter = ('subject',)
    search_fields = ('title',)
    inlines = [ChapterSectionInline, LessonInline, ChapterBlockInline]

    def lesson_count(self, obj):
        return obj.lessons.count()
    lesson_count.short_description = 'Lecons'

    def block_count(self, obj):
        return obj.blocks.count()
    block_count.short_description = 'Blocs'

    def section_count(self, obj):
        return obj.sections.count()
    section_count.short_description = 'Sections'


@admin.register(Lesson)
class LessonAdmin(ModelAdmin):
    list_display = ('title', 'chapter', 'duration_display', 'is_free_preview', 'has_quiz', 'activity_count', 'order')
    list_filter = ('is_free_preview', 'chapter__subject')
    search_fields = ('title', 'vdocipher_id')
    list_editable = ('is_free_preview', 'order')
    inlines = [ActivityInline, CoursePDFInline]

    def duration_display(self, obj):
        m, s = divmod(obj.duration_seconds, 60)
        return f"{m}:{s:02d}"
    duration_display.short_description = 'Duree'

    def has_quiz(self, obj):
        return hasattr(obj, 'quiz')
    has_quiz.boolean = True
    has_quiz.short_description = 'Quiz'

    def activity_count(self, obj):
        count = obj.activities.count()
        if count:
            return format_html('<span style="color: #4D44DB; font-weight: bold;">{}</span>', count)
        return '—'
    activity_count.short_description = 'Activites'


@admin.register(ChapterSection)
class ChapterSectionAdmin(ModelAdmin):
    list_display = ('title', 'chapter', 'section_type', 'order', 'is_gating')
    list_filter = ('section_type', 'chapter__subject')
    search_fields = ('title',)
    fieldsets = [
        (None, {'fields': ['chapter', 'title', 'section_type', 'order', 'is_gating', 'is_free_preview']}),
        ('Video', {'fields': ['vdocipher_id', 'duration_seconds'], 'classes': ['collapse']}),
        ('Texte', {'fields': ['content'], 'classes': ['collapse']}),
        ('Quiz', {'fields': ['quiz_data', 'pass_score'], 'classes': ['collapse']}),
        ('Activite', {'fields': ['activity_type', 'activity_data'], 'classes': ['collapse']}),
    ]


@admin.register(ChapterBlock)
class ChapterBlockAdmin(ModelAdmin):
    list_display = ('title', 'chapter', 'block_type', 'order')
    list_filter = ('block_type',)


@admin.register(Activity)
class ActivityAdmin(ModelAdmin):
    list_display = ('title', 'lesson', 'activity_type', 'order', 'created_at')
    list_filter = ('activity_type', 'lesson__chapter__subject')
    search_fields = ('title',)
    fieldsets = (
        ('Informations', {
            'fields': ('lesson', 'title', 'activity_type', 'order'),
        }),
        ('Configuration', {
            'fields': ('config_json',),
            'description': '''
                <div style="background:#f8f9ff; padding:12px; border-radius:8px; margin-bottom:12px; font-size:13px;">
                <b>Exemples de config JSON par type :</b><br><br>
                <b>Glisser-deposer :</b><br>
                <code>{"question": "...", "items": [{"id":"a","label":"H2O"}], "zones": [{"id":"z1","label":"Eau","correctItemId":"a"}]}</code><br><br>
                <b>Appariement :</b><br>
                <code>{"question": "...", "pairs": [{"id":"1","left":"France","right":"Paris"}]}</code><br><br>
                <b>Texte a trous :</b><br>
                <code>{"sentence": "L'eau est composee de H{{blank}} et O", "answer": "2", "hint": "..."}</code><br><br>
                <b>Vrai ou Faux :</b><br>
                <code>{"statement": "La Terre est plate.", "isTrue": false, "explanation": "..."}</code><br><br>
                <b>Mise en ordre :</b><br>
                <code>{"question": "...", "items": [{"id":"a","label":"Etape 1"}], "correctOrder": ["a","b","c"]}</code>
                </div>
            ''',
        }),
        ('Composant React personnalise', {
            'fields': ('react_component_url',),
            'classes': ('collapse',),
            'description': 'Uniquement pour le type "Composant React personnalise". Entrez l\'URL du bundle JS.',
        }),
    )


@admin.register(CoursePDF)
class CoursePDFAdmin(ModelAdmin):
    list_display = ('title', 'lesson', 'file_url', 'order')
    search_fields = ('title',)
