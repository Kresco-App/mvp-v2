import asyncio
import ast
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.admin.views import (
    AdminAuditLogAdmin,
    DailyQuestAdmin,
    QuizAttemptAdmin,
    TopicItemAdmin,
    UserAdmin,
    UserXPAdmin,
)
from app.models.courses import Subject, Topic
from app.models.users import User, UserSubjectEntitlement
from app.services.auth import create_token


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ADMIN_ROUTER = BACKEND_ROOT / "app" / "routers" / "admin.py"
ADMIN_OVERVIEW_SERVICE = BACKEND_ROOT / "app" / "services" / "admin_overview.py"


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


def test_admin_overview_does_not_parallelize_group_by_breakdowns():
    tree = ast.parse(ADMIN_OVERVIEW_SERVICE.read_text(encoding="utf-8"))
    violations: list[int] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Name) or node.func.id != "_gather_reads":
            continue
        if any(_calls_function(arg, "_breakdown") for arg in node.args):
            violations.append(node.lineno)

    assert violations == []


def test_admin_overview_caps_parallel_database_reads():
    from app.services import admin_overview

    assert admin_overview.ADMIN_OVERVIEW_PARALLELISM <= 2


def test_admin_overview_gather_reads_keeps_partial_results(monkeypatch, run_db, caplog):
    from app.services import admin_overview

    async def fake_run_read(operation):
        return await operation(None)

    async def ok(_session):
        return 7

    async def failed(_session):
        raise TimeoutError("slow admin panel")

    async def also_ok(_session):
        return 11

    monkeypatch.setattr(admin_overview, "_run_read", fake_run_read)
    caplog.set_level("WARNING", logger="kresco.admin_overview")

    result = run_db(admin_overview._gather_reads(ok, failed, also_ok))

    assert result == [7, 0, 11]
    assert any(
        "Admin overview read operation 1 failed" in record.message
        for record in caplog.records
    )


def test_admin_overview_gather_reads_propagates_cancellation(monkeypatch, run_db):
    from app.services import admin_overview

    async def fake_run_read(operation):
        return await operation(None)

    async def cancelled(_session):
        raise asyncio.CancelledError()

    monkeypatch.setattr(admin_overview, "_run_read", fake_run_read)

    with pytest.raises(asyncio.CancelledError):
        run_db(admin_overview._gather_reads(cancelled))


def test_admin_overview_router_stays_thin():
    router_source = ADMIN_ROUTER.read_text(encoding="utf-8")
    tree = ast.parse(router_source)

    function_names = [
        node.name for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]

    assert function_names == ["get_admin_overview"]
    assert "build_admin_overview" in router_source
    assert "_ops_readiness" not in router_source
    assert "_gather_reads" not in router_source
    assert "select(" not in router_source


def test_power_admin_views_are_searchable_filterable_and_safe():
    assert "password" not in [column.key for column in UserAdmin.column_list]
    assert "password" not in [column.key for column in UserAdmin.column_searchable_list]
    assert {
        "auth_token_version",
        "is_staff",
        "is_superuser",
        "password",
        "password_changed_at",
        "role",
        "stripe_customer_id",
    }.issubset(set(UserAdmin.form_excluded_columns))
    assert {"role", "niveau", "filiere", "is_staff", "is_active"}.issubset(
        {column_filter.column.key for column_filter in UserAdmin.column_filters}
    )
    assert UserAdmin.can_create is False
    assert UserAdmin.can_edit is True
    assert UserAdmin.can_delete is False

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
    for view in (UserXPAdmin, DailyQuestAdmin, QuizAttemptAdmin):
        assert view.can_create is False
        assert view.can_edit is False
        assert view.can_delete is False


def test_power_admin_view_has_defense_in_depth_accessibility_check():
    user_admin = UserAdmin()

    class Request:
        session = {}

    assert user_admin.is_accessible(Request()) is False
    assert user_admin.is_visible(Request()) is False

    Request.session = {"admin_authenticated": True, "admin_user_id": 123}

    assert user_admin.is_accessible(Request()) is True
    assert user_admin.is_visible(Request()) is True


def _calls_function(node: ast.AST, name: str) -> bool:
    return any(
        isinstance(child, ast.Call)
        and isinstance(child.func, ast.Name)
        and child.func.id == name
        for child in ast.walk(node)
    )
