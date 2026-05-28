from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.views import UserAdmin
from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.security.csrf import ADMIN_CSRF_COOKIE_NAME, ADMIN_CSRF_FIELD_NAME
from app.models.users import User
from app.security.passwords import hash_password


TRUSTED_ORIGIN = "http://testserver"
STAFF_PASSWORD = "strong-admin-pass-123"


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
