import pytest
import inspect

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.admin.auth as admin_auth
from app.admin.views import LiveSessionAdmin, SENSITIVE_COLUMN_NAMES, UserAdmin
from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.security.csrf import ADMIN_CSRF_COOKIE_NAME, ADMIN_CSRF_FIELD_NAME
from app.models.users import User, UserPermission
from app.security.passwords import hash_password


TRUSTED_ORIGIN = "http://testserver"
STAFF_PASSWORD = "strong-admin-pass-123"


def _admin_column_keys(values) -> set[str]:
    return {
        key
        for value in values or []
        if (key := getattr(value, "key", str(value)))
    }


async def _seed_admin_auth_users(prefix: str) -> dict[str, int | str]:
    session_factory = get_session_factory()
    async with session_factory() as db:  # type: AsyncSession
        staff = User(
            email=f"{prefix}-staff@example.com",
            full_name="Staff Admin",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
            password=hash_password(STAFF_PASSWORD),
        )
        student = User(
            email=f"{prefix}-student@example.com",
            full_name="Student",
            is_active=True,
            is_email_verified=True,
            is_staff=False,
            password=hash_password(STAFF_PASSWORD),
        )
        db.add_all([staff, student])
        await db.flush()
        db.add(
            UserPermission(
                user_id=staff.id,
                permission="sqladmin:access",
                status="active",
                reason="seed sqladmin auth test",
                granted_by_user_id=staff.id,
            )
        )
        await db.commit()
        await db.refresh(staff)
        await db.refresh(student)
        return {
            "staff_id": staff.id,
            "staff_email": staff.email,
            "student_id": student.id,
            "student_email": student.email,
        }


async def _latest_admin_audit(action: str, email: str = "") -> AdminAuditLog | None:
    session_factory = get_session_factory()
    async with session_factory() as db:  # type: AsyncSession
        query = select(AdminAuditLog).where(AdminAuditLog.action == action)
        if email:
            query = query.where(AdminAuditLog.object_repr == email)
        result = await db.execute(query.order_by(AdminAuditLog.id.desc()))
        return result.scalars().first()


def _admin_login(client, email: str, password: str = STAFF_PASSWORD):
    login_form = client.get("/admin/login")
    assert login_form.status_code == 200
    csrf_token = client.cookies.get(ADMIN_CSRF_COOKIE_NAME)
    assert csrf_token
    return client.post(
        "/admin/login",
        data={"username": email, "password": password, ADMIN_CSRF_FIELD_NAME: csrf_token},
        headers={"Origin": TRUSTED_ORIGIN},
        follow_redirects=False,
    )


def test_sqladmin_login_requires_database_staff_user_and_audits(app_client, run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-login"))

    student_response = _admin_login(app_client, str(users["student_email"]))
    assert student_response.status_code == 400

    failed_audit = run_db(_latest_admin_audit("admin_login", str(users["student_email"])))
    assert failed_audit is not None
    assert failed_audit.changed_data["success"] is False
    assert failed_audit.changed_data["reason"] == "invalid_credentials_or_staff_boundary"

    response = _admin_login(app_client, str(users["staff_email"]))
    assert response.status_code == 302
    assert response.headers["location"].endswith("/admin/")

    success_audit = run_db(_latest_admin_audit("admin_login", str(users["staff_email"])))
    assert success_audit is not None
    assert success_audit.changed_data["success"] is True
    assert success_audit.note == f"admin_user_id={users['staff_id']}"

    admin_home = app_client.get("/admin/")
    assert admin_home.status_code == 200


def test_sqladmin_login_delegates_password_authentication_to_account_service():
    source = inspect.getsource(admin_auth.StaffAdminAuth.login)

    assert "authenticate_password_login(" in source
    assert "verify_password(" not in source
    assert "verify_password_async(" not in source
    assert "is_unusable_password(" not in source


def test_sqladmin_login_requires_superuser_or_sqladmin_access(app_client, run_db):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            plain_staff = User(
                email="sqladmin-boundary-plain@example.com",
                full_name="Plain Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password=hash_password(STAFF_PASSWORD),
            )
            permitted_staff = User(
                email="sqladmin-boundary-permitted@example.com",
                full_name="Permitted Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password=hash_password(STAFF_PASSWORD),
            )
            superuser = User(
                email="sqladmin-boundary-superuser@example.com",
                full_name="Super Admin",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                is_superuser=True,
                password=hash_password(STAFF_PASSWORD),
            )
            db.add_all([plain_staff, permitted_staff, superuser])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=permitted_staff.id,
                    permission="sqladmin:access",
                    status="active",
                    reason="sqladmin boundary",
                    granted_by_user_id=superuser.id,
                )
            )
            await db.commit()
            return {
                "plain_email": plain_staff.email,
                "permitted_email": permitted_staff.email,
                "superuser_email": superuser.email,
            }

    users = run_db(_seed())

    plain_response = _admin_login(app_client, str(users["plain_email"]))
    assert plain_response.status_code == 400
    failed_audit = run_db(_latest_admin_audit("admin_login", str(users["plain_email"])))
    assert failed_audit is not None
    assert failed_audit.changed_data["reason"] == "sqladmin_access_required"

    permitted_response = _admin_login(app_client, str(users["permitted_email"]))
    assert permitted_response.status_code == 302
    app_client.cookies.clear()

    superuser_response = _admin_login(app_client, str(users["superuser_email"]))
    assert superuser_response.status_code == 302


def test_sqladmin_hides_sensitive_columns_from_read_and_export_surfaces():
    sensitive_live_session_keys = {"provider_payload_json", "stream_ingest_url", "stream_key"}
    sensitive_user_keys = {
        "auth_token_version",
        "email_token_version",
        "google_id",
        "password",
        "password_changed_at",
        "stripe_customer_id",
    }

    for view, sensitive_keys in (
        (LiveSessionAdmin, sensitive_live_session_keys),
        (UserAdmin, sensitive_user_keys),
    ):
        assert sensitive_keys <= SENSITIVE_COLUMN_NAMES
        for configured_columns in (
            view.column_list,
            view.column_details_list,
            view.column_export_list,
            view.column_searchable_list,
        ):
            assert _admin_column_keys(configured_columns).isdisjoint(sensitive_keys)
        assert set(view.form_excluded_columns) >= sensitive_keys


def test_sqladmin_rejects_untrusted_origin_before_login(app_client, run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-origin"))

    response = app_client.post(
        "/admin/login",
        data={"username": users["staff_email"], "password": STAFF_PASSWORD},
        headers={"Origin": "https://evil.example"},
        follow_redirects=False,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF origin is not trusted"


def test_sqladmin_login_requires_admin_csrf_token(app_client, run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-csrf"))

    login_form = app_client.get("/admin/login")
    assert login_form.status_code == 200
    assert app_client.cookies.get(ADMIN_CSRF_COOKIE_NAME)

    response = app_client.post(
        "/admin/login",
        data={"username": users["staff_email"], "password": STAFF_PASSWORD},
        headers={"Origin": TRUSTED_ORIGIN},
        follow_redirects=False,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin CSRF token is required"


def test_sqladmin_session_revokes_when_staff_status_changes(app_client, run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-revoke"))

    login = _admin_login(app_client, str(users["staff_email"]))
    assert login.status_code == 302
    assert app_client.get("/admin/").status_code == 200

    async def _revoke_staff():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            user = await db.get(User, int(users["staff_id"]))
            user.is_staff = False
            await db.commit()

    run_db(_revoke_staff())

    response = app_client.get("/admin/", follow_redirects=False)
    assert response.status_code == 302
    assert "/admin/login" in response.headers["location"]


def test_sqladmin_session_revokes_when_sqladmin_permission_changes(app_client, run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-permission-revoke"))

    login = _admin_login(app_client, str(users["staff_email"]))
    assert login.status_code == 302
    assert app_client.get("/admin/").status_code == 200

    async def _revoke_permission():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            result = await db.execute(
                select(UserPermission).where(
                    UserPermission.user_id == int(users["staff_id"]),
                    UserPermission.permission == "sqladmin:access",
                )
            )
            permission = result.scalar_one()
            permission.status = "revoked"
            await db.commit()

    run_db(_revoke_permission())

    response = app_client.get("/admin/", follow_redirects=False)
    assert response.status_code == 302
    assert "/admin/login" in response.headers["location"]


def test_sqladmin_model_action_audit_includes_admin_actor(app_client, run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-action-audit"))

    class _Client:
        host = "127.0.0.1"

    class _Url:
        path = "/admin/user/edit/1"

    class _Request:
        url = _Url()
        client = _Client()
        session = {"admin_user_id": users["staff_id"]}

    async def _write_action_audit() -> AdminAuditLog:
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            user = await db.get(User, int(users["staff_id"]))
            await UserAdmin._write_audit_log(
                UserAdmin,
                "update",
                {"full_name": "Updated Staff Admin"},
                user,
                _Request(),
            )

        audit = await _latest_admin_audit("update")
        assert audit is not None
        return audit

    audit = run_db(_write_action_audit())

    assert audit.model_name == "User"
    assert audit.note == f"admin_user_id={users['staff_id']}"
    assert audit.changed_data == {"full_name": "Updated Staff Admin"}


def test_sqladmin_non_superuser_cannot_edit_account_takeover_fields(run_db):
    users = run_db(_seed_admin_auth_users("sqladmin-user-boundary"))

    class _Request:
        session = {"admin_authenticated": True, "admin_user_id": users["staff_id"]}

    async def _check_boundaries():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            staff = await db.get(User, int(users["staff_id"]))
            view = UserAdmin()

            with pytest.raises(HTTPException) as email_error:
                await view.on_model_change({"email": "takeover@example.com"}, student, False, _Request())
            assert email_error.value.status_code == 403

            with pytest.raises(HTTPException) as staff_error:
                await view.on_model_change({"full_name": "Edited Staff"}, staff, False, _Request())
            assert staff_error.value.status_code == 403

    run_db(_check_boundaries())


# ─── Privilege-escalation tests ────────────────────────────────────────────────


async def _seed_priv_esc_users(prefix: str) -> dict:
    """Seed a superuser, a non-superuser staff member, and a plain student."""
    session_factory = get_session_factory()
    async with session_factory() as db:  # type: AsyncSession
        superuser = User(
            email=f"{prefix}-superuser@example.com",
            full_name="Super Admin",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
            is_superuser=True,
            password=hash_password(STAFF_PASSWORD),
        )
        staff = User(
            email=f"{prefix}-staff@example.com",
            full_name="Staff Only",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
            is_superuser=False,
            password=hash_password(STAFF_PASSWORD),
        )
        student = User(
            email=f"{prefix}-student@example.com",
            full_name="Plain Student",
            is_active=True,
            is_email_verified=True,
            is_staff=False,
            is_superuser=False,
            role="student",
            password=hash_password(STAFF_PASSWORD),
        )
        db.add_all([superuser, staff, student])
        await db.commit()
        await db.refresh(superuser)
        await db.refresh(staff)
        await db.refresh(student)
        return {
            "superuser_id": superuser.id,
            "staff_id": staff.id,
            "student_id": student.id,
        }


def _make_request(admin_user_id: int) -> object:
    """Return a minimal fake request with an admin session."""
    class _Request:
        session = {"admin_authenticated": True, "admin_user_id": admin_user_id}
    return _Request()


def test_non_superuser_staff_cannot_create_superuser(run_db):
    """Hole 1: is_created=True must NOT be skipped — privilege check must still run."""
    users = run_db(_seed_priv_esc_users("priv-create-super"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            # The model is a fresh (unsaved) User — simulate the "create" path.
            new_user = User(
                email="new-super@example.com",
                full_name="New Super",
                is_active=True,
                is_email_verified=False,
                is_staff=False,
                is_superuser=False,
                role="student",
            )
            view = UserAdmin()

            # Attempt to create with is_superuser=True in the submitted data.
            with pytest.raises(HTTPException) as exc_info:
                await view.on_model_change(
                    {"email": "new-super@example.com", "is_superuser": True},
                    new_user,
                    True,  # is_created
                    request,
                )
            assert exc_info.value.status_code == 403

            # Attempt to create with is_staff=True in the submitted data.
            with pytest.raises(HTTPException) as exc_info2:
                await view.on_model_change(
                    {"email": "new-staff@example.com", "is_staff": True},
                    new_user,
                    True,
                    request,
                )
            assert exc_info2.value.status_code == 403

    run_db(_run())


def test_non_superuser_staff_cannot_create_elevated_role(run_db):
    """Non-superuser staff cannot create a user with role='professor' or 'admin'."""
    users = run_db(_seed_priv_esc_users("priv-create-role"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        new_user = User(
            email="new-prof@example.com",
            full_name="New Prof",
            is_active=True,
            is_email_verified=False,
            is_staff=False,
            is_superuser=False,
            role="student",
        )
        view = UserAdmin()

        for elevated_role in ("professor", "admin"):
            with pytest.raises(HTTPException) as exc_info:
                await view.on_model_change(
                    {"email": "new-prof@example.com", "role": elevated_role},
                    new_user,
                    True,
                    request,
                )
            assert exc_info.value.status_code == 403, f"Expected 403 for role={elevated_role!r}"

    run_db(_run())


def test_non_superuser_staff_cannot_escalate_existing_user_to_superuser(run_db):
    """Hole 2: non-superuser cannot flip is_superuser/is_staff on an existing plain user."""
    users = run_db(_seed_priv_esc_users("priv-escalate"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            view = UserAdmin()

            # Attempt to elevate is_superuser on an existing regular user.
            with pytest.raises(HTTPException) as exc_info:
                await view.on_model_change(
                    {"full_name": student.full_name, "is_superuser": True},
                    student,
                    False,
                    request,
                )
            assert exc_info.value.status_code == 403

            # Attempt to elevate is_staff.
            with pytest.raises(HTTPException) as exc_info2:
                await view.on_model_change(
                    {"full_name": student.full_name, "is_staff": True},
                    student,
                    False,
                    request,
                )
            assert exc_info2.value.status_code == 403

    run_db(_run())


def test_non_superuser_staff_cannot_escalate_role_on_existing_user(run_db):
    """Non-superuser staff cannot change an existing student's role to professor/admin."""
    users = run_db(_seed_priv_esc_users("priv-escalate-role"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            view = UserAdmin()

            for elevated_role in ("professor", "admin"):
                with pytest.raises(HTTPException) as exc_info:
                    await view.on_model_change(
                        {"role": elevated_role},
                        student,
                        False,
                        request,
                    )
                assert exc_info.value.status_code == 403, f"Expected 403 for role={elevated_role!r}"

    run_db(_run())


def test_superuser_can_create_and_edit_users_normally(run_db):
    """Superusers must still be able to create/edit users without any restrictions."""
    users = run_db(_seed_priv_esc_users("priv-superuser-ok"))
    request = _make_request(int(users["superuser_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            view = UserAdmin()

            # Superuser can edit a regular user without restrictions.
            await view.on_model_change(
                {"full_name": "Updated by Superuser", "role": "professor"},
                student,
                False,
                request,
            )

            # Superuser can create a new superuser (is_created=True with elevated flags).
            new_user = User(
                email="super-created@example.com",
                full_name="New Super",
                is_active=True,
                is_email_verified=False,
                is_staff=False,
                is_superuser=False,
                role="student",
            )
            await view.on_model_change(
                {"email": "super-created@example.com", "is_superuser": True},
                new_user,
                True,
                request,
            )

    run_db(_run())


def test_non_superuser_staff_cannot_modify_auth_token_version(run_db):
    """Non-superuser staff cannot touch auth_token_version (invalidates all sessions)."""
    users = run_db(_seed_priv_esc_users("priv-auth-token"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            view = UserAdmin()

            with pytest.raises(HTTPException) as exc_info:
                await view.on_model_change(
                    {"auth_token_version": 99},
                    student,
                    False,
                    request,
                )
            assert exc_info.value.status_code == 403

    run_db(_run())


def test_non_superuser_staff_cannot_modify_stripe_customer_id(run_db):
    """Non-superuser staff cannot touch stripe_customer_id."""
    users = run_db(_seed_priv_esc_users("priv-stripe"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            view = UserAdmin()

            with pytest.raises(HTTPException) as exc_info:
                await view.on_model_change(
                    {"stripe_customer_id": "cus_evil123"},
                    student,
                    False,
                    request,
                )
            assert exc_info.value.status_code == 403

    run_db(_run())


def test_non_superuser_staff_can_edit_benign_fields(run_db):
    """Non-superuser staff CAN edit innocuous fields like full_name on a regular user."""
    users = run_db(_seed_priv_esc_users("priv-benign-edit"))
    request = _make_request(int(users["staff_id"]))

    async def _run():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = await db.get(User, int(users["student_id"]))
            view = UserAdmin()

            # This must NOT raise.
            await view.on_model_change(
                {"full_name": "Corrected Name"},
                student,
                False,
                request,
            )

    run_db(_run())
