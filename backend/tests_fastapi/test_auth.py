from app.database import get_session_factory
from app.models.users import User
from app.services.email import generate_reset_token, generate_verification_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def _failing_send_email(*args, **kwargs):
    raise RuntimeError("email provider unavailable")


async def _seed_user(email: str, *, is_email_verified: bool = False):
    import app.routers.users as users_router

    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Seed User",
            password=users_router._hash_password("strong-pass-123"),
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
            password="!",
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


def test_signup_verify_and_login_flow(app_client, test_settings):
    email = "newuser@example.com"
    password = "strong-pass-123"

    signup = app_client.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "full_name": "New User"},
    )
    assert signup.status_code == 202

    verify_token = generate_verification_token(email, test_settings)
    verify = app_client.post("/api/auth/verify-email", json={"token": verify_token})
    assert verify.status_code == 200
    assert "access_token" in verify.json()
    assert "HttpOnly" in verify.headers["set-cookie"]

    login = app_client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    assert "access_token" in login.json()
    assert login.cookies.get("kresco_token")


def test_google_login_happy_path(app_client, monkeypatch):
    import app.routers.users as users_router

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": "googleuser@example.com",
            "name": "Google User",
            "picture": "https://example.com/avatar.png",
            "sub": "google-sub-1",
        },
    )

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["user"]["email"] == "googleuser@example.com"
    assert response.cookies.get("kresco_token")


def test_google_login_does_not_mint_token_after_persistence_failure(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "google-commit-failure@example.com"
    run_db(_seed_user(email, is_email_verified=False))

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": email,
            "name": "Google Commit Failure",
            "picture": "https://example.com/avatar.png",
            "sub": "google-sub-failure",
        },
    )

    async def failing_commit(self):
        raise RuntimeError("database commit failed")

    monkeypatch.setattr(AsyncSession, "commit", failing_commit)

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})

    assert response.status_code == 503
    assert "access_token" not in response.text

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is False
    assert user.google_id is None


def test_google_login_rejected_professor_does_not_persist_profile_mutations(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "google-unassigned-professor@example.com"
    run_db(_seed_unassigned_google_professor(email))

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": email,
            "name": "Google Professor",
            "picture": "https://example.com/professor.png",
            "sub": "google-professor-sub",
        },
    )

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})

    assert response.status_code == 403
    assert response.json()["detail"] == "Active course offering assignment required"
    assert "access_token" not in response.text

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is False
    assert user.google_id is None
    assert user.avatar_url == ""
    assert user.full_name == ""


def test_verify_email_rejected_professor_does_not_persist_verification(app_client, test_settings, run_db):
    email = "verify-unassigned-professor@example.com"
    run_db(_seed_unassigned_google_professor(email))
    token = generate_verification_token(email, test_settings)

    response = app_client.post("/api/auth/verify-email", json={"token": token})

    assert response.status_code == 403
    assert response.json()["detail"] == "Active course offering assignment required"
    assert "access_token" not in response.text

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is False


def test_demo_login_endpoint_is_removed(app_client):
    response = app_client.post("/api/auth/demo-login", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 404
    assert "access_token" not in response.text


def test_signup_does_not_block_when_verification_email_fails(app_client, monkeypatch):
    import app.routers.users as users_router

    monkeypatch.setattr(users_router, "send_verification_email", _failing_send_email)

    response = app_client.post(
        "/api/auth/signup",
        json={"email": "email-failure@example.com", "password": "strong-pass-123", "full_name": "Email Failure"},
    )

    assert response.status_code == 202
    assert response.json()["email"] == "email-failure@example.com"


def test_resend_verification_does_not_block_when_email_fails(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    run_db(_seed_user("resend-failure@example.com", is_email_verified=False))
    monkeypatch.setattr(users_router, "send_verification_email", _failing_send_email)

    response = app_client.post("/api/auth/resend-verification", json={"email": "resend-failure@example.com"})

    assert response.status_code == 200
    assert "un email a ete envoye" in response.json()["message"]


def test_forgot_password_does_not_block_when_email_fails(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    run_db(_seed_user("forgot-failure@example.com", is_email_verified=True))
    monkeypatch.setattr(users_router, "send_reset_email", _failing_send_email)

    response = app_client.post("/api/auth/forgot-password", json={"email": "forgot-failure@example.com"})

    assert response.status_code == 200
    assert "email de reinitialisation" in response.json()["message"]


def test_reset_password_token_is_single_use(app_client, test_settings, run_db):
    email = "reset-single-use@example.com"
    run_db(_seed_user(email, is_email_verified=True))
    reset_token = generate_reset_token(email, test_settings, token_version=0)

    first = app_client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "password": "new-strong-pass-123"},
    )
    assert first.status_code == 200

    replay = app_client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "password": "another-strong-pass-123"},
    )
    assert replay.status_code == 400
    assert replay.json()["detail"] == "Lien de reinitialisation invalide ou expire"

    login = app_client.post("/api/auth/login", json={"email": email, "password": "new-strong-pass-123"})
    assert login.status_code == 200
    assert "access_token" in login.json()


def test_profile_accepts_auth_cookie(app_client, run_db):
    email = "cookie-auth@example.com"
    run_db(_seed_user(email, is_email_verified=True))

    login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert login.status_code == 200
    assert login.cookies.get("kresco_token")

    profile = app_client.get("/api/profile/me")
    assert profile.status_code == 200
    assert profile.json()["email"] == email


def test_password_reset_revokes_existing_bearer_tokens(app_client, test_settings, run_db):
    email = "reset-revokes-token@example.com"
    run_db(_seed_user(email, is_email_verified=True))

    login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert login.status_code == 200
    old_token = login.json()["access_token"]

    reset_token = generate_reset_token(email, test_settings, token_version=0)
    reset = app_client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "password": "new-strong-pass-123"},
    )
    assert reset.status_code == 200

    revoked = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {old_token}"})
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == "Token revoked"

    new_login = app_client.post("/api/auth/login", json={"email": email, "password": "new-strong-pass-123"})
    assert new_login.status_code == 200
    new_token = new_login.json()["access_token"]
    profile = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {new_token}"})
    assert profile.status_code == 200
    assert profile.json()["email"] == email
