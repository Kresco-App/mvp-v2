from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from unfold.admin import ModelAdmin
from users.models import User


@admin.register(User)
class UserAdmin(ModelAdmin, BaseUserAdmin):
    list_display = ('email', 'full_name', 'role', 'is_pro', 'is_active', 'created_at')
    list_filter = ('role', 'is_pro', 'is_active', 'is_staff')
    search_fields = ('email', 'full_name')
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at', 'google_id')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('full_name', 'avatar_url', 'google_id')}),
        ('Permissions', {'fields': ('role', 'is_pro', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'full_name', 'password1', 'password2'),
        }),
    )
