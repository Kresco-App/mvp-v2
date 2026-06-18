import importlib.util
import inspect
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.database import get_session_factory
from app.models.users import User
from app.security.csrf import CSRF_COOKIE_NAME, csrf_token_for_user
from app.services import auth_firebase
from app.services.auth import AUTH_COOKIE_NAME, create_token


async def _seed_user(
    email: str,
    *,
    is_email_verified: bool = False,
):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Seed User",
            is_active=True,
            is_email_verified=is_email_verified,
        )
        db.add(user)
        await db.commit()


async def _seed_unassigned_google_professor(email: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="",
            role="professor",
            is_active=True,
            is_email_verified=False,
            google_id=None,
            avatar_url="",
        )
        db.add(user)
        await db.commit()


async def _get_user(email: str) -> User | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()


async def _count_users() -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(func.count(User.id)))
        return int(result.scalar_one())


async def _seed_cookie_user(email: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Cookie User",
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return SimpleNamespace(
            id=user.id,
            role=user.role,
            is_staff=user.is_staff,
            auth_token_version=user.auth_token_version,
        )


def _install_cookie_session(app_client, run_db, test_settings, email: str) -> tuple[str, str]:
    user = run_db(_seed_cookie_user(email))
    token = create_token(user, test_settings)
    csrf_token = csrf_token_for_user(user, test_settings)
    app_client.cookies.set(AUTH_COOKIE_NAME, token, domain="testserver.local", path="/")
    app_client.cookies.set(CSRF_COOKIE_NAME, csrf_token, domain="testserver.local", path="/")
    return token, csrf_token


def _firebase_google_payload(
    email: str,
    *,
    google_id: str = "google-sub-1",
    firebase_uid: str = "firebase-uid-1",
    name: str = "Google User",
    picture: str = "https://example.com/avatar.png",
    email_verified: bool = True,
) -> dict:
    return {
        "email": email,
        "email_verified": email_verified,
        "name": name,
        "picture": picture,
        "provider": "google.com",
        "google_id": google_id,
        "firebase_uid": firebase_uid,
    }


def _firebase_password_payload(
    email: str,
    *,
    firebase_uid: str = "firebase-password-uid-1",
    name: str = "Firebase User",
    email_verified: bool = True,
) -> dict:
    return {
        "email": email,
        "email_verified": email_verified,
        "name": name,
        "picture": "",
        "provider": "password",
        "google_id": None,
        "firebase_uid": firebase_uid,
    }


def test_legacy_password_auth_modules_are_removed():
    assert importlib.util.find_spec("app.security.passwords") is None
    assert importlib.util.find_spec("app.services.auth_account") is None
    assert importlib.util.find_spec("app.services.auth_signup") is None
    assert importlib.util.find_spec("app.services.auth_email_dispatch") is None
    assert importlib.util.find_spec("app.services.auth_google") is None
    assert importlib.util.find_spec("app.services.email") is None


def test_auth_router_only_persists_users_through_firebase_service():
    import app.routers.users as users_router

    route_source = inspect.getsource(users_router)
    firebase_source = inspect.getsource(auth_firebase)

    assert "verify_firebase_token(" in route_source
    assert "complete_firebase_session(" in route_source
    assert "auth_account" not in route_source
    assert "auth_signup" not in route_source
    assert "auth_email_dispatch" not in route_source
    assert "app.security.passwords" not in route_source
    assert "app.security.passwords" not in firebase_source
    assert "send_verification_email" not in route_source
    assert "send_reset_email" not in route_source
    assert "select(User)" not in route_source
    assert "UserXP(" not in route_source
    assert "make_unusable_password(" not in route_source
    assert "verify_password_async(" not in route_source
    assert "hash_password_async(" not in route_source
    assert '"/auth/login"' not in route_source
    assert '"/auth/signup"' not in route_source
    assert '"/auth/forgot-password"' not in route_source
    assert '"/auth/reset-password"' not in route_source
    assert '"/auth/verify-email"' not in route_source
    assert '"/auth/resend-verification"' not in route_source
    assert "async def complete_firebase_session" in firebase_source
    assert "UserXP(" in firebase_source
    assert "make_unusable_password(" not in firebase_source
    assert "except IntegrityError" in firebase_source


def test_firebase_password_session_flow(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "newuser@example.com"
    monkeypatch.setattr(
        users_router,
        "verify_firebase_token",
        lambda *_: _firebase_password_payload(email, firebase_uid="firebase-password-newuser", name="New User"),
    )

    session = app_client.post("/api/auth/firebase-session", json={"credential": "firebase-id-token"})

    assert session.status_code == 200
    session_body = session.json()
    assert "access_token" not in session_body
    assert session_body["user"]["email"] == email
    assert "HttpOnly" in session.headers["set-cookie"]
    assert session.cookies.get("kresco_token")

    user = run_db(_get_user(email))
    assert user is not None
    assert user.firebase_uid == "firebase-password-newuser"
    assert user.google_id is None


def test_google_compat_route_uses_same_firebase_session_flow(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    monkeypatch.setattr(
        users_router,
        "verify_firebase_token",
        lambda *_: _firebase_google_payload("google-compat@example.com"),
    )

    response = app_client.post("/api/google-login", json={"credential": "firebase-id-token"})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "google-compat@example.com"
    user = run_db(_get_user("google-compat@example.com"))
    assert user is not None
    assert user.google_id == "google-sub-1"
    assert user.firebase_uid == "firebase-uid-1"


def test_google_login_uses_firebase_verifier_when_project_configured(app_client, monkeypatch, test_settings, run_db):
    import app.routers.users as users_router

    old_project_id = test_settings.firebase_project_id
    test_settings.firebase_project_id = "kresco-staging"
    firebase_calls = {"count": 0}

    async def fake_verify_firebase_token(credential, project_id):
        firebase_calls["count"] += 1
        assert credential == "firebase-credential"
        assert project_id == "kresco-staging"
        return _firebase_google_payload(
            "firebase-google@example.com",
            google_id="google-provider-sub",
            firebase_uid="firebase-uid-123",
            name="Firebase Google",
        )

    monkeypatch.setattr(users_router, "verify_firebase_token", fake_verify_firebase_token)

    try:
        response = app_client.post("/api/auth/firebase-session", json={"credential": "firebase-credential"})
    finally:
        test_settings.firebase_project_id = old_project_id

    assert response.status_code == 200
    assert firebase_calls == {"count": 1}
    user = run_db(_get_user("firebase-google@example.com"))
    assert user is not None
    assert user.google_id == "google-provider-sub"
    assert user.firebase_uid == "firebase-uid-123"


def test_firebase_google_login_links_existing_google_id_when_email_changed(
    app_client,
    monkeypatch,
    test_settings,
    run_db,
):
    import app.routers.users as users_router

    old_email = "old-google-email@example.com"
    new_email = "new-google-email@example.com"

    async def seed_existing_google_user():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = User(
                email=old_email,
                full_name="Existing Google User",
                is_active=True,
                is_email_verified=True,
                google_id="existing-google-sub",
            )
            db.add(user)
            await db.commit()
            return user.id

    existing_user_id = run_db(seed_existing_google_user())
    before_count = run_db(_count_users())
    old_project_id = test_settings.firebase_project_id
    test_settings.firebase_project_id = "kresco-staging"

    async def fake_verify_firebase_token(*_args):
        return _firebase_google_payload(
            new_email,
            google_id="existing-google-sub",
            firebase_uid="firebase-uid-linked",
            name="Existing Google User",
            picture="https://example.com/new-avatar.png",
        )

    monkeypatch.setattr(users_router, "verify_firebase_token", fake_verify_firebase_token)

    try:
        response = app_client.post("/api/auth/firebase-session", json={"credential": "firebase-credential"})
    finally:
        test_settings.firebase_project_id = old_project_id

    assert response.status_code == 200
    assert run_db(_count_users()) == before_count
    assert run_db(_get_user(old_email)) is None
    linked = run_db(_get_user(new_email))
    assert linked is not None
    assert linked.id == existing_user_id
    assert linked.google_id == "existing-google-sub"
    assert linked.firebase_uid == "firebase-uid-linked"


def test_firebase_login_recovers_from_insert_race_and_uses_existing_user(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "firebase-race@example.com"
    original_flush = AsyncSession.flush
    original_rollback = AsyncSession.rollback
    original_commit = AsyncSession.commit
    calls = {"count": 0}
    seeded = {"done": False}

    async def racing_flush(self, *args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise IntegrityError("insert", {}, Exception("duplicate key"))
        return await original_flush(self, *args, **kwargs)

    async def rollback_and_seed(self):
        await original_rollback(self)
        if not seeded["done"]:
            seeded["done"] = True
            session_factory = get_session_factory()
            async with session_factory() as race_db:
                race_db.add(
                    User(
                        email=email,
                        full_name="Concurrent Firebase User",
                        is_active=True,
                        is_email_verified=True,
                    )
                )
                await original_commit(race_db)

    monkeypatch.setattr(AsyncSession, "flush", racing_flush)
    monkeypatch.setattr(AsyncSession, "rollback", rollback_and_seed)
    monkeypatch.setattr(
        users_router,
        "verify_firebase_token",
        lambda *_: _firebase_google_payload(
            email,
            google_id="google-race-sub",
            firebase_uid="firebase-race-uid",
            name="Firebase Race Winner",
        ),
    )

    response = app_client.post("/api/auth/firebase-session", json={"credential": "fake-credential"})

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == email
    user = run_db(_get_user(email))
    assert user is not None
    assert user.google_id == "google-race-sub"
    assert user.firebase_uid == "firebase-race-uid"
    assert user.is_email_verified is True


def test_firebase_login_normalizes_email_and_links_existing_user(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "firebase-pre-ato@example.com"
    run_db(_seed_user(email, is_email_verified=False))

    monkeypatch.setattr(
        users_router,
        "verify_firebase_token",
        lambda *_: _firebase_google_payload(
            "  FIREBASE-PRE-ATO@EXAMPLE.COM  ",
            google_id="google-pre-ato-sub",
            firebase_uid="firebase-pre-ato-uid",
            name="Firebase Owner",
        ),
    )

    response = app_client.post("/api/auth/firebase-session", json={"credential": "fake-credential"})

    assert response.status_code == 200
    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is True
    assert user.google_id == "google-pre-ato-sub"

@pytest.mark.parametrize(
    "payload",
    [
        _firebase_google_payload("google-unverified@example.com", email_verified=False),
        {"email": "google-missing-verification@example.com", "provider": "google.com", "google_id": "google-missing-verification-sub", "firebase_uid": "firebase-missing-verification"},
        {"email": "google-missing-sub@example.com", "email_verified": True, "provider": "google.com", "firebase_uid": "firebase-missing-sub"},
        {"email": None, "email_verified": True, "provider": "google.com", "google_id": "google-null-email-sub", "firebase_uid": "firebase-null-email"},
    ],
)
def test_firebase_login_rejects_unverified_or_malformed_identity_payload(app_client, monkeypatch, payload):
    import app.routers.users as users_router

    monkeypatch.setattr(users_router, "verify_firebase_token", lambda *_: payload)

    response = app_client.post("/api/auth/firebase-session", json={"credential": "fake-credential"})

    assert response.status_code in {401, 403}
    assert response.json()["detail"] in {
        "Invalid Firebase credential",
        "Veuillez verifier votre email avant de vous connecter",
    }
    assert "access_token" not in response.text


def test_firebase_login_does_not_mint_token_after_persistence_failure(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "firebase-commit-failure@example.com"
    run_db(_seed_user(email, is_email_verified=False))

    monkeypatch.setattr(
        users_router,
        "verify_firebase_token",
        lambda *_: _firebase_google_payload(
            email,
            google_id="google-sub-failure",
            firebase_uid="firebase-failure-uid",
            name="Firebase Commit Failure",
        ),
    )

    async def failing_commit(self):
        raise RuntimeError("database commit failed")

    monkeypatch.setattr(AsyncSession, "commit", failing_commit)

    response = app_client.post("/api/auth/firebase-session", json={"credential": "fake-credential"})

    assert response.status_code == 503
    assert "access_token" not in response.text

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is False
    assert user.google_id is None
    assert user.firebase_uid is None


def test_firebase_login_rejected_professor_does_not_persist_profile_mutations(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "google-unassigned-professor@example.com"
    run_db(_seed_unassigned_google_professor(email))

    monkeypatch.setattr(
        users_router,
        "verify_firebase_token",
        lambda *_: _firebase_google_payload(
            email,
            google_id="google-professor-sub",
            firebase_uid="firebase-professor-uid",
            name="Google Professor",
            picture="https://example.com/professor.png",
        ),
    )

    response = app_client.post("/api/auth/firebase-session", json={"credential": "fake-credential"})

    assert response.status_code == 403
    assert response.json()["detail"] == "Active course offering assignment required"
    assert "access_token" not in response.text

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is False
    assert user.google_id is None
    assert user.avatar_url == ""
    assert user.full_name == ""


def test_demo_login_endpoint_is_removed(app_client):
    response = app_client.post("/api/auth/demo-login", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 404
    assert "access_token" not in response.text


def test_profile_accepts_auth_cookie(app_client, run_db, test_settings):
    email = "cookie-auth@example.com"
    _install_cookie_session(app_client, run_db, test_settings, email)

    profile = app_client.get("/api/profile/me")

    assert profile.status_code == 200
    assert profile.json()["email"] == email


def test_logout_revokes_existing_cookie_token(app_client, run_db, test_settings):
    email = "logout-revokes-token@example.com"
    old_token, csrf_token = _install_cookie_session(app_client, run_db, test_settings, email)
    assert old_token
    assert csrf_token

    logout = app_client.post(
        "/api/auth/logout",
        headers={"Origin": "http://localhost:3000", "x-csrf-token": csrf_token},
    )
    assert logout.status_code == 200

    revoked = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {old_token}"})
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == "Token revoked"


def test_logout_clears_stale_cookie_without_valid_session(app_client):
    app_client.cookies.set("kresco_token", "not-a-valid-jwt")
    app_client.cookies.set("kresco_user_role", "student")
    app_client.cookies.set("kresco_csrf", "stale-csrf")

    logout = app_client.post(
        "/api/auth/logout",
        headers={"Origin": "http://localhost:3000"},
    )

    assert logout.status_code == 200
    cookies = logout.headers.get_list("set-cookie")
    assert any(cookie.startswith("kresco_token=") and "Max-Age=0" in cookie for cookie in cookies)
    assert any(cookie.startswith("kresco_user_role=") and "Max-Age=0" in cookie for cookie in cookies)
    assert any(cookie.startswith("kresco_csrf=") and "Max-Age=0" in cookie for cookie in cookies)


def test_production_auth_cookie_defaults_to_secure_lax_samesite(test_settings):
    import app.routers.users as users_router

    settings = test_settings.model_copy(update={"environment": "production"})
    response = Response()

    users_router._set_auth_cookies(
        response,
        "jwt-token",
        SimpleNamespace(id=1, role="student", auth_token_version=0),
        settings,
    )

    cookies = [
        value.decode("latin-1")
        for name, value in response.raw_headers
        if name.lower() == b"set-cookie"
    ]
    auth_cookie = next(cookie for cookie in cookies if cookie.startswith("kresco_token="))
    csrf_cookie = next(cookie for cookie in cookies if cookie.startswith("kresco_csrf="))
    assert "HttpOnly" in auth_cookie
    assert "Secure" in auth_cookie
    assert "samesite=lax" in auth_cookie.lower()
    assert "samesite=lax" in csrf_cookie.lower()


def test_auth_cookie_samesite_none_requires_explicit_setting(test_settings):
    import app.routers.users as users_router

    settings = test_settings.model_copy(update={"environment": "production", "auth_cookie_samesite": "none"})
    response = Response()

    users_router._set_auth_cookies(
        response,
        "jwt-token",
        SimpleNamespace(id=1, role="student", auth_token_version=0),
        settings,
    )

    cookies = [
        value.decode("latin-1")
        for name, value in response.raw_headers
        if name.lower() == b"set-cookie"
    ]
    auth_cookie = next(cookie for cookie in cookies if cookie.startswith("kresco_token="))
    csrf_cookie = next(cookie for cookie in cookies if cookie.startswith("kresco_csrf="))
    assert "Secure" in auth_cookie
    assert "samesite=none" in auth_cookie.lower()
    assert "samesite=none" in csrf_cookie.lower()
