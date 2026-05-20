from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.admin.views import AdminAuditLogAdmin, TopicItemAdmin, UserAdmin
from app.models.courses import Subject, Topic
from app.models.users import User, UserSubjectEntitlement
from app.services.auth import create_token


def test_admin_overview_requires_staff_and_returns_catalog(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = User(
                email="admin-overview-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            staff = User(
                email="admin-overview-staff@example.com",
                full_name="Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            subject = Subject(title="Admin Physics", is_published=True, order=99)
            db.add_all([student, staff, subject])
            await db.flush()
            db.add(
                UserSubjectEntitlement(
                    user_id=student.id,
                    subject_id=subject.id,
                    source="test",
                    status="active",
                )
            )
            db.add(
                Topic(
                    subject_id=subject.id,
                    slug="admin-overview-topic",
                    title="Admin Overview Topic",
                    status="published",
                    order=99,
                )
            )
            await db.commit()
            return create_token(student.id, test_settings), create_token(staff.id, test_settings)

    student_token, staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    response = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["totals"]["users"] >= 2
    assert data["totals"]["subjects"] >= 1
    assert data["content_status"]["topics"]["published"] >= 1
    assert "engagement" in data
    assert "progress_xp" in data
    assert "admin_audit" in data
    assert data["ops_readiness"]["access"]["active_entitlements_now"] >= 1
    assert data["ops_readiness"]["access"]["users_with_entitlement_rows"] >= 1
    assert data["ops_readiness"]["content_gaps"]["topics_without_items"] >= 1
    assert data["ops_readiness"]["local_validation"] == {
        "mode": "local_only",
        "deployment_checks": "paused",
        "build_check": "skipped_by_policy",
    }

    topic_item = next(item for item in data["crud_catalog"] if item["model"] == "TopicItem")
    assert topic_item["admin_url"] == "/admin/topic-item/list"
    assert topic_item["actions"] == {
        "create": True,
        "read": True,
        "update": True,
        "delete": True,
    }

    audit_log = next(item for item in data["crud_catalog"] if item["model"] == "AdminAuditLog")
    assert audit_log["admin_url"] == "/admin/admin-audit-log/list"
    assert audit_log["actions"] == {
        "create": False,
        "read": True,
        "update": False,
        "delete": False,
    }


def test_power_admin_views_are_searchable_filterable_and_safe():
    assert "password" not in [column.key for column in UserAdmin.column_list]
    assert "password" not in [column.key for column in UserAdmin.column_searchable_list]
    assert {"role", "niveau", "filiere", "is_staff", "is_active"}.issubset(
        {column_filter.column.key for column_filter in UserAdmin.column_filters}
    )

    assert {"title", "description", "item_type", "renderer_key", "status"}.issubset(
        {column.key for column in TopicItemAdmin.column_searchable_list}
    )
    assert {"id", "topic_id", "status", "created_at"}.issubset(
        {column.key for column in TopicItemAdmin.column_sortable_list}
    )
    assert TopicItemAdmin.can_create is True
    assert TopicItemAdmin.can_edit is True
    assert TopicItemAdmin.can_delete is True
    assert TopicItemAdmin.can_export is True
    assert TopicItemAdmin.page_size == 50

    assert AdminAuditLogAdmin.can_create is False
    assert AdminAuditLogAdmin.can_edit is False
    assert AdminAuditLogAdmin.can_delete is False
