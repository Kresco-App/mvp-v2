from sqlalchemy import select

from app.database import get_session_factory
from app.models.users import User
from app.services.auth import AUTH_COOKIE_NAME
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME


async def _seed_password_user(email: str):
    import app.routers.users as users_router

    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="CSRF User",
            password=users_router._hash_password("strong-pass-123"),
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        await db.commit()


async def _full_name(email: str) -> str:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(User.full_name).where(User.email == email))
        return result.scalar_one()


def _login_cookie_session(app_client, run_db, email: str):
    run_db(_seed_password_user(email))
    response = app_client.post(
        "/api/auth/login",
        json={"email": email, "password": "strong-pass-123"},
    )
    assert response.status_code == 200
    assert app_client.cookies.get(AUTH_COOKIE_NAME)
    csrf_token = app_client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token
    assert response.json()["csrf_token"] == csrf_token
    return csrf_token


def test_cookie_write_requires_csrf_header(app_client, run_db):
    _login_cookie_session(app_client, run_db, "csrf-missing@example.com")

    response = app_client.patch(
        "/api/profile/me",
        json={"full_name": "Should Not Persist"},
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF token is required for cookie-authenticated writes"
    assert run_db(_full_name("csrf-missing@example.com")) == "CSRF User"


def test_cookie_write_rejects_untrusted_origin_even_with_token(app_client, run_db):
    csrf_token = _login_cookie_session(app_client, run_db, "csrf-origin@example.com")

    response = app_client.patch(
        "/api/profile/me",
        json={"full_name": "Should Not Persist"},
        headers={
            "Origin": "https://attacker.example",
            CSRF_HEADER_NAME: csrf_token,
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF origin is not trusted"
    assert run_db(_full_name("csrf-origin@example.com")) == "CSRF User"


def test_cookie_write_accepts_trusted_origin_and_matching_csrf_token(app_client, run_db):
    csrf_token = _login_cookie_session(app_client, run_db, "csrf-valid@example.com")

    response = app_client.patch(
        "/api/profile/me",
        json={"full_name": "CSRF Protected"},
        headers={
            "Origin": "http://localhost:3000",
            CSRF_HEADER_NAME: csrf_token,
        },
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "CSRF Protected"
    assert run_db(_full_name("csrf-valid@example.com")) == "CSRF Protected"


def test_csrf_refresh_endpoint_returns_token_for_cookie_session(app_client, run_db):
    _login_cookie_session(app_client, run_db, "csrf-refresh@example.com")

    response = app_client.get("/api/auth/csrf")

    assert response.status_code == 200
    assert response.json()["csrf_token"]
    assert app_client.cookies.get(CSRF_COOKIE_NAME) == response.json()["csrf_token"]


def test_bearer_write_does_not_require_csrf_token(app_client, auth_token):
    token, _ = auth_token(email="csrf-bearer@example.com")

    response = app_client.patch(
        "/api/profile/me",
        json={"full_name": "Bearer User"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Bearer User"


def test_signed_webhook_path_is_csrf_exempt_for_cookie_sessions(app_client, run_db):
    _login_cookie_session(app_client, run_db, "csrf-webhook@example.com")

    response = app_client.post(
        "/api/payments/webhook",
        content=b"{}",
        headers={"stripe-signature": "sig"},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Webhook secret not configured"
