from sqlalchemy import select
from fastapi.testclient import TestClient

from app.database import get_session_factory
from app.models.users import User
from app.services.auth import AUTH_COOKIE_NAME, create_token
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user


async def _seed_session_user(email: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="CSRF User",
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


async def _full_name(email: str) -> str:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(User.full_name).where(User.email == email))
        return result.scalar_one()


def _login_cookie_session(app_client, run_db, test_settings, email: str):
    user = run_db(_seed_session_user(email))
    auth_token = create_token(user, test_settings)
    csrf_token = csrf_token_for_user(user, test_settings)
    app_client.cookies.set(AUTH_COOKIE_NAME, auth_token, domain="testserver.local", path="/")
    app_client.cookies.set(CSRF_COOKIE_NAME, csrf_token, domain="testserver.local", path="/")
    assert app_client.cookies.get(AUTH_COOKIE_NAME)
    assert app_client.cookies.get(CSRF_COOKIE_NAME) == csrf_token
    return csrf_token


def test_cookie_write_requires_csrf_header(app_client, run_db, test_settings):
    _login_cookie_session(app_client, run_db, test_settings, "csrf-missing@example.com")

    response = app_client.patch(
        "/api/profile/me",
        json={"full_name": "Should Not Persist"},
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF token is required for cookie-authenticated writes"
    assert run_db(_full_name("csrf-missing@example.com")) == "CSRF User"


def test_cookie_write_rejects_untrusted_origin_even_with_token(app_client, run_db, test_settings):
    csrf_token = _login_cookie_session(app_client, run_db, test_settings, "csrf-origin@example.com")

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


def test_cookie_write_rejects_spoofed_host_origin_match(app_client, run_db, test_settings):
    user = run_db(_seed_session_user("csrf-host@example.com"))
    auth_token = create_token(user, test_settings)
    csrf_token = csrf_token_for_user(user, test_settings)
    attacker_client = TestClient(app_client.app, base_url="https://attacker.example")
    attacker_client.cookies.set(AUTH_COOKIE_NAME, auth_token, domain="attacker.example", path="/")
    attacker_client.cookies.set(CSRF_COOKIE_NAME, csrf_token, domain="attacker.example", path="/")

    try:
        response = attacker_client.patch(
            "/api/profile/me",
            json={"full_name": "Should Not Persist"},
            headers={
                "Origin": "https://attacker.example",
                CSRF_HEADER_NAME: csrf_token,
            },
        )
    finally:
        attacker_client.close()

    assert response.status_code == 400
    assert "Invalid host header" in response.text
    assert run_db(_full_name("csrf-host@example.com")) == "CSRF User"


def test_cookie_write_accepts_trusted_origin_and_matching_csrf_token(app_client, run_db, test_settings):
    csrf_token = _login_cookie_session(app_client, run_db, test_settings, "csrf-valid@example.com")

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


def test_pre_auth_auth_endpoints_reject_untrusted_origin(app_client):
    response = app_client.post(
        "/api/auth/firebase-session",
        json={"credential": "invalid-token"},
        headers={"Origin": "https://attacker.example"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF origin is not trusted"


def test_pre_auth_auth_endpoints_accept_trusted_origin_without_csrf_token(app_client):
    response = app_client.post(
        "/api/auth/firebase-session",
        json={"credential": "invalid-token"},
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 401


def test_csrf_refresh_endpoint_returns_token_for_cookie_session(app_client, run_db, test_settings):
    _login_cookie_session(app_client, run_db, test_settings, "csrf-refresh@example.com")

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


def test_cmi_callback_path_is_csrf_exempt_for_cookie_sessions(app_client, run_db, test_settings):
    _login_cookie_session(app_client, run_db, test_settings, "csrf-webhook@example.com")

    response = app_client.post(
        "/api/payments/cmi/callback",
        data={},
    )

    assert response.status_code == 503
    assert response.status_code != 403
