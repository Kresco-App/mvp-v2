import asyncio
import ast
from pathlib import Path

import pytest
from sqlalchemy import select
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
from app.models.courses import Subject, Topic, TopicItem, TopicSection
from app.models.gamification import QuizAttempt, TopicItemProgress
from app.models.admin_audit import AdminAuditLog
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.services.auth import create_token


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ADMIN_ROUTER = BACKEND_ROOT / "app" / "routers" / "admin.py"
ADMIN_OVERVIEW_SERVICE = BACKEND_ROOT / "app" / "services" / "admin_overview.py"


async def _permission_audits_for_permission(permission_id: int) -> list[AdminAuditLog]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.model_name == "UserPermission",
                AdminAuditLog.object_pk == str(permission_id),
            )
            .order_by(AdminAuditLog.id.asc())
        )
        return list(result.scalars().all())


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
            unverified_staff = User(
                email="admin-overview-unverified-staff@example.com",
                full_name="Unverified Staff",
                is_active=True,
                is_email_verified=False,
                is_staff=True,
                password="!",
            )
            subject = Subject(title="Admin Physics", is_published=True, order=99)
            db.add_all([student, staff, unverified_staff, subject])
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="admin-overview-topic",
                title="Admin Overview Topic",
                status="published",
                order=99,
            )
            empty_topic = Topic(
                subject_id=subject.id,
                slug="admin-overview-empty-topic",
                title="Admin Overview Empty Topic",
                status="published",
                order=100,
            )
            db.add_all([topic, empty_topic])
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            topic_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Admin Overview Item",
                item_type="reading",
                status="published",
            )
            db.add(topic_item)
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
                QuizAttempt(
                    user_id=student.id,
                    subject_id=subject.id,
                    topic_id=topic.id,
                    topic_item_id=topic_item.id,
                    source_type="tab",
                    score=90,
                    passed=True,
                    answers={},
                    grading={},
                )
            )
            db.add(
                TopicItemProgress(
                    user_id=student.id,
                    topic_id=topic.id,
                    topic_item_id=topic_item.id,
                    status="completed",
                    watched_seconds=120,
                )
            )
            await db.commit()
            return (
                create_token(student.id, test_settings),
                create_token(staff.id, test_settings),
                create_token(unverified_staff.id, test_settings),
            )

    student_token, staff_token, unverified_staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    unverified_blocked = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {unverified_staff_token}"},
    )
    assert unverified_blocked.status_code == 403

    response = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["totals"]["users"] >= 2
    assert data["totals"]["subjects"] >= 1
    assert data["totals"]["quiz_attempts"] >= 1
    assert data["totals"]["quiz_results"] >= 1
    assert data["content_status"]["topics"]["published"] >= 1
    assert "engagement" in data
    assert data["engagement"]["active_users_7d"] >= 1
    assert data["engagement"]["quiz_attempt_pass_rate"] > 0
    assert data["engagement"]["quiz_result_pass_rate"] > 0
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


def test_admin_permission_management_requires_roles_manage(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = User(
                email="permission-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            staff = User(
                email="permission-plain-staff@example.com",
                full_name="Plain Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            manager = User(
                email="permission-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            db.add_all([student, staff, manager])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return (
                manager.id,
                staff.id,
                create_token(student.id, test_settings),
                create_token(staff.id, test_settings),
                create_token(manager.id, test_settings),
            )

    manager_id, staff_id, student_token, staff_token, manager_token = run_db(_seed())

    student_response = app_client.get(
        "/api/admin/permissions",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    staff_response = app_client.get(
        "/api/admin/permissions",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    manager_response = app_client.get(
        f"/api/admin/permissions?user_id={manager_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    grant_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": staff_id, "permission": "finance:read", "reason": "finance viewer"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert student_response.status_code == 403
    assert student_response.json()["detail"] == "Staff access required"
    assert staff_response.status_code == 403
    assert staff_response.json()["detail"] == "Permission required: roles:manage"
    assert manager_response.status_code == 200
    assert [item["permission"] for item in manager_response.json()] == ["roles:manage"]
    assert grant_response.status_code == 200
    grant = grant_response.json()
    assert grant["user_id"] == staff_id
    assert grant["permission"] == "finance:read"
    assert grant["status"] == "active"
    assert grant["reason"] == "finance viewer"


def test_admin_permission_grant_revoke_and_reactivate(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-cycle-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            target = User(
                email="permission-cycle-target@example.com",
                full_name="Target Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            db.add_all([manager, target])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return manager.id, target.id, create_token(manager.id, test_settings)

    manager_id, target_id, manager_token = run_db(_seed())
    headers = {"Authorization": f"Bearer {manager_token}"}

    unsupported_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:typo", "reason": "typo"},
        headers=headers,
    )
    grant_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:export", "reason": "export access"},
        headers=headers,
    )
    permission_id = grant_response.json()["id"]
    revoke_response = app_client.post(
        f"/api/admin/permissions/{permission_id}/revoke",
        json={"reason": "remove export access"},
        headers=headers,
    )
    repeat_revoke_response = app_client.post(
        f"/api/admin/permissions/{permission_id}/revoke",
        json={"reason": "already removed"},
        headers=headers,
    )
    reactivate_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:export", "reason": "restore export access"},
        headers=headers,
    )
    list_response = app_client.get(
        f"/api/admin/permissions?user_id={target_id}&status=active",
        headers=headers,
    )
    missing_response = app_client.post(
        "/api/admin/permissions/999999999/revoke",
        json={"reason": "bad id, not a permission id"},
        headers=headers,
    )
    xp_grant_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "xp:adjust", "reason": "xp correction access"},
        headers=headers,
    )

    assert unsupported_response.status_code == 400
    assert unsupported_response.json()["detail"] == "Unsupported permission"
    assert grant_response.status_code == 200
    assert grant_response.json()["granted_by_user_id"] == manager_id
    assert revoke_response.status_code == 200
    assert revoke_response.json()["status"] == "revoked"
    assert revoke_response.json()["reason"] == "remove export access"
    assert revoke_response.json()["revoked_at"] is not None
    assert repeat_revoke_response.status_code == 200
    assert repeat_revoke_response.json()["status"] == "revoked"
    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["id"] == permission_id
    assert reactivate_response.json()["status"] == "active"
    assert reactivate_response.json()["revoked_at"] is None
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [permission_id]
    assert missing_response.status_code == 404
    assert xp_grant_response.status_code == 200
    assert xp_grant_response.json()["permission"] == "xp:adjust"
    assert xp_grant_response.json()["granted_by_user_id"] == manager_id
    audits = run_db(_permission_audits_for_permission(permission_id))
    assert [audit.action for audit in audits] == [
        "permission_grant",
        "permission_revoke",
        "permission_noop",
        "permission_restore",
    ]
    assert [audit.changed_data["actor_user_id"] for audit in audits] == [manager_id] * 4
    assert audits[0].changed_data["reason"] == "export access"
    assert audits[1].changed_data["reason"] == "remove export access"
    assert audits[2].changed_data["reason"] == "already removed"
    assert audits[3].changed_data["reason"] == "restore export access"


def test_admin_permission_grants_require_active_verified_staff_targets(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-target-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            student = User(
                email="permission-target-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            inactive_staff = User(
                email="permission-target-inactive@example.com",
                full_name="Inactive Staff",
                is_active=False,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            unverified_staff = User(
                email="permission-target-unverified@example.com",
                full_name="Unverified Staff",
                is_active=True,
                is_email_verified=False,
                is_staff=True,
                password="!",
            )
            db.add_all([manager, student, inactive_staff, unverified_staff])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return (
                student.id,
                inactive_staff.id,
                unverified_staff.id,
                create_token(manager.id, test_settings),
            )

    student_id, inactive_staff_id, unverified_staff_id, manager_token = run_db(_seed())
    headers = {"Authorization": f"Bearer {manager_token}"}

    responses = [
        app_client.post(
            "/api/admin/permissions",
            json={"user_id": user_id, "permission": "finance:read", "reason": "invalid target"},
            headers=headers,
        )
        for user_id in (student_id, inactive_staff_id, unverified_staff_id)
    ]

    for response in responses:
        assert response.status_code == 400
        assert response.json()["detail"] == "Permissions can only be granted to active verified staff"


def test_admin_permission_grant_recovers_from_duplicate_race(monkeypatch, app_client, run_db, test_settings):
    import app.services.admin_permissions as admin_permissions

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-race-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            target = User(
                email="permission-race-target@example.com",
                full_name="Race Target",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            db.add_all([manager, target])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            db.add(
                UserPermission(
                    user_id=target.id,
                    permission="finance:read",
                    status="revoked",
                    reason="existing race row",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return target.id, create_token(manager.id, test_settings)

    target_id, manager_token = run_db(_seed())
    original_load = admin_permissions._load_user_permission
    calls = {"count": 0}

    async def racey_load(db, *, user_id, permission):
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return await original_load(db, user_id=user_id, permission=permission)

    monkeypatch.setattr(admin_permissions, "_load_user_permission", racey_load)

    response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:read", "reason": "recover race"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["reason"] == "recover race"


def test_admin_permission_manager_cannot_grant_permissions_to_self(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-self-grant-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            db.add(manager)
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return manager.id, create_token(manager.id, test_settings)

    manager_id, manager_token = run_db(_seed())

    response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": manager_id, "permission": "finance:refund", "reason": "self escalate"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot grant permissions to yourself"


def test_admin_permission_manager_cannot_revoke_own_roles_manage(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-self-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            db.add(manager)
            await db.flush()
            grant = UserPermission(
                user_id=manager.id,
                permission="roles:manage",
                status="active",
                reason="seed manager",
                granted_by_user_id=manager.id,
            )
            db.add(grant)
            await db.commit()
            await db.refresh(grant)
            return grant.id, create_token(manager.id, test_settings)

    permission_id, manager_token = run_db(_seed())

    response = app_client.post(
        f"/api/admin/permissions/{permission_id}/revoke",
        json={"reason": "remove myself"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot revoke your own roles:manage permission"


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


def test_admin_overview_batches_metric_reads_by_phase(monkeypatch, run_db):
    from app.services import admin_overview

    calls = 0
    original_run_read = admin_overview._run_read

    async def counted_run_read(operation):
        nonlocal calls
        calls += 1
        return await original_run_read(operation)

    async def build_empty_overview():
        session_factory = get_session_factory()
        async with session_factory() as db:
            return await admin_overview.build_admin_overview(db)

    monkeypatch.setattr(admin_overview, "_run_read", counted_run_read)

    overview = run_db(build_empty_overview())

    assert overview.totals["users"] >= 0
    assert calls <= 20


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

    assert function_names == [
        "get_admin_overview",
        "list_permissions",
        "grant_permission",
        "revoke_permission",
        "create_admin_xp_adjustment",
        "get_admin_xp_audit",
        "list_reports",
        "update_report",
        "moderate_reported_comment",
    ]
    assert "build_admin_overview" in router_source
    assert "list_user_permissions" in router_source
    assert "grant_user_permission" in router_source
    assert "revoke_user_permission" in router_source
    assert "create_xp_adjustment" in router_source
    assert "build_admin_xp_audit" in router_source
    assert "list_admin_content_reports" in router_source
    assert "update_admin_content_report" in router_source
    assert "apply_reported_comment_moderation_action" in router_source
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
