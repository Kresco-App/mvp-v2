from django.contrib import admin
from unfold.admin import ModelAdmin
from interactions.models import Comment


@admin.register(Comment)
class CommentAdmin(ModelAdmin):
    list_display = ('user', 'body_preview', 'content_type', 'object_id', 'parent', 'created_at')
    list_filter = ('content_type',)
    search_fields = ('user__email', 'body')
    readonly_fields = ('created_at', 'updated_at', 'content_type', 'object_id')

    def body_preview(self, obj):
        return obj.body[:80]
    body_preview.short_description = 'Body'
