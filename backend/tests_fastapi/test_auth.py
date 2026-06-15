import inspect
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from itsdangerous import URLSafeTimedSerializer
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.database import get_session_factory
from app.models.users import EmailDispatchThrottle, User
from app.security.passwords import hash_password, is_unusable_password
from app.services import auth_account
from app.services import auth_email_dispatch
from app.services import auth_google
from app.services import auth_signup
from app.services import auth_users
from app.services.email import generate_reset_token, generate_verification_token, verify_reset_token


async def _failing_send_email(*args, **kwargs):
    raise RuntimeError("email provider unavailable")


async def _seed_user(email: str, *, is_email_verified: bool = False):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Seed User",
            password=hash_password("strong-pass-123"),
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


async def _get_email_throttle(email: str, purpose: str) -> EmailDispatchThrottle | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(EmailDispatchThrottle).where(
                EmailDispatchThrottle.email == email,
                EmailDispatchThrottle.purpose == purpose,
            )
        )
        return result.scalar_one_or_none()


def test_auth_email_dispatch_throttle_stays_out_of_router():
    import app.routers.users as users_router

    router_source = inspect.getsource(users_router)
    dispatch_route_source = "\n".join([
        inspect.getsource(users_router.signup),
        inspect.getsource(users_router.resend_verification),
        inspect.getsource(users_router.forgot_password),
    ])
    dispatch_source = inspect.getsource(auth_email_dispatch)

    assert "from app.services.auth_email_dispatch import" in router_source
    assert "select(EmailDispatchThrottle)" not in router_source
    assert "EmailDispatchReservation" not in router_source
    assert "db.delete(throttle)" not in router_source
    assert "with_for_update()" not in router_source
    assert "auth_email_dispatch_failed" not in router_source
    assert "prepare_signup_verification_dispatch(" in dispatch_route_source
    assert "prepare_resend_verification_dispatch(" in dispatch_route_source
    assert "prepare_password_reset_dispatch(" in dispatch_route_source
    assert "BackgroundTasks" in router_source
    assert "background_tasks.add_task(" in dispatch_route_source
    assert "deliver_verification_email_dispatch" in dispatch_route_source
    assert "deliver_password_reset_email_dispatch" in dispatch_route_source
    assert "await send_verification_email(" not in dispatch_route_source
    assert "await send_reset_email(" not in dispatch_route_source
    assert "select(User)" not in dispatch_route_source
    assert "await db.commit()" not in dispatch_route_source
    assert "generate_verification_token(" not in dispatch_route_source
    assert "generate_reset_token(" not in dispatch_route_source
    assert "reserve_email_dispatch(" in dispatch_source
    assert "release_email_dispatch_reservation(" in dispatch_source
    assert "deliver_verification_email_dispatch(" in dispatch_source
    assert "deliver_password_reset_email_dispatch(" in dispatch_source
    assert "prepare_signup_verification_dispatch(" in dispatch_source
    assert "prepare_resend_verification_dispatch(" in dispatch_source
    assert "prepare_password_reset_dispatch(" in dispatch_source
    assert "select(EmailDispatchThrottle)" in dispatch_source
    assert "with_for_update()" in dispatch_source
    assert "auth_email_dispatch_failed" in dispatch_source


def test_signup_account_lifecycle_stays_out_of_router():
    import app.routers.users as users_router

    signup_source = inspect.getsource(users_router.signup)
    service_source = inspect.getsource(auth_signup)

    assert "create_or_reclaim_signup_user(" in signup_source
    assert "select(User)" not in signup_source
    assert "UserXP(" not in signup_source
    assert "IntegrityError" not in signup_source
    assert "db.add(" not in signup_source
    assert "db.flush(" not in signup_source
    assert "auth_token_version = (existing.auth_token_version or 0) + 1" not in signup_source
    assert "async def create_or_reclaim_signup_user" in service_source
    assert "get_user_by_email(" in service_source
    assert "select(User)" in inspect.getsource(auth_users)
    assert "UserXP(" in service_source
    assert "except IntegrityError" in service_source
    assert "Could not complete signup." in service_source
    assert "Un compte existe deja avec cet email" in service_source


def test_signup_service_normalizes_email_before_lookup_and_persistence(run_db):
    email = "  Mixed.Case+Signup@Example.Com  "

    async def _create_user():
        session_factory = get_session_factory()
        async with session_factory() as db:
            return await auth_signup.create_or_reclaim_signup_user(
                db,
                email=email,
                full_name="Normalized Signup",
                plain_password="signup-pass-123",
            )

    user = run_db(_create_user())

    assert user.email == "mixed.case+signup@example.com"
    stored = run_db(_get_user("mixed.case+signup@example.com"))
    assert stored is not None
    assert stored.email == "mixed.case+signup@example.com"


def test_google_login_persistence_stays_out_of_router():
    import app.routers.users as users_router

    route_source = inspect.getsource(users_router.google_login)
    service_source = inspect.getsource(auth_google)

    assert "verify_google_token(" in route_source
    assert "complete_google_login(" in route_source
    assert "select(User)" not in route_source
    assert "UserXP(" not in route_source
    assert "IntegrityError" not in route_source
    assert "db.add(" not in route_source
    assert "db.flush(" not in route_source
    assert "make_unusable_password(" not in route_source
    assert "google_login_persistence_failed" not in route_source
    assert "async def complete_google_login" in service_source
    assert "get_user_by_email(" in service_source
    assert "select(User)" in inspect.getsource(auth_users)
    assert "UserXP(" in service_source
    assert "except IntegrityError" in service_source
    assert "make_unusable_password(" in service_source
    assert "google_login_persistence_failed" in service_source
    assert "Could not complete Google login." in service_source


def test_token_guarded_auth_mutations_stay_out_of_router():
    import app.routers.users as users_router

    service_source = inspect.getsource(auth_account)
    route_sources = {
        "verify_email": inspect.getsource(users_router.verify_email),
        "login": inspect.getsource(users_router.login),
        "reset_password": inspect.getsource(users_router.reset_password),
        "logout": inspect.getsource(users_router.logout),
    }

    assert "verify_email_account(" in route_sources["verify_email"]
    assert "authenticate_password_login(" in route_sources["login"]
    assert "reset_password_account(" in route_sources["reset_password"]
    assert "revoke_user_sessions(" in route_sources["logout"]
    for source in route_sources.values():
        assert "select(User)" not in source
        assert "verify_verification_token(" not in source
        assert "verify_reset_token(" not in source
        assert "_verify_password_async(" not in source
        assert "_hash_password_async(" not in source
        assert "is_unusable_password(" not in source
        assert "auth_token_version = (user.auth_token_version or 0) + 1" not in source
    assert "async def verify_email_account" in service_source
    assert "async def authenticate_password_login" in service_source
    assert "async def reset_password_account" in service_source
    assert "async def revoke_user_sessions" in service_source
    assert "Lien de verification invalide ou expire" in service_source
    assert "Email ou mot de passe incorrect" in service_source
    assert "Lien de reinitialisation invalide ou expire" in service_source
    assert "verify_password_async(" in service_source
    assert "hash_password_async(" in service_source


def test_password_reset_dispatch_and_account_flow_normalize_email(run_db, test_settings):
    email = "  Reset.Lookup+Case@Example.Com  "
    normalized_email = "reset.lookup+case@example.com"

    run_db(_seed_user(normalized_email, is_email_verified=True))

    async def _prepare_dispatch():
        session_factory = get_session_factory()
        async with session_factory() as db:
            return await auth_email_dispatch.prepare_password_reset_dispatch(
                db,
                email=email,
                settings=test_settings,
            )

    dispatch = run_db(_prepare_dispatch())
    assert dispatch is not None
    assert dispatch.email == normalized_email

    serializer = URLSafeTimedSerializer(test_settings.jwt_secret_key)
    raw_token = serializer.dumps(
        {"email": email, "token_version": 0},
        salt="password-reset",
    )
    normalized_generated = verify_reset_token(
        generate_reset_token(email, test_settings, token_version=0),
        test_settings,
    )
    assert normalized_generated is not None
    assert normalized_generated.email == normalized_email

    async def _reset_password():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await auth_account.reset_password_account(
                db,
                token=raw_token,
                password="new-reset-pass-123",
                settings=test_settings,
            )

    run_db(_reset_password())

    user = run_db(_get_user(normalized_email))
    assert user is not None
    assert user.email == normalized_email


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
    verify_body = verify.json()
    assert "access_token" not in verify_body
    assert verify_body["user"]["email"] == email
    assert "HttpOnly" in verify.headers["set-cookie"]

    login = app_client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    login_body = login.json()
    assert "access_token" not in login_body
    assert login_body["user"]["email"] == email
    assert login.cookies.get("kresco_token")


def test_signup_rejects_passwords_shorter_than_eight_characters(app_client):
    response = app_client.post(
        "/api/auth/signup",
        json={"email": "short-password@example.com", "password": "1234567", "full_name": "Short Password"},
    )

    assert response.status_code == 400
    assert "au moins 8" in response.json()["detail"]


def test_reclaiming_unverified_signup_invalidates_old_verification_token(app_client, test_settings, run_db):
    email = "reclaim-unverified@example.com"
    run_db(_seed_user(email, is_email_verified=False))
    old_token = generate_verification_token(email, test_settings, token_version=0)

    reclaim = app_client.post(
        "/api/auth/signup",
        json={"email": email.upper(), "password": "owner-pass-123", "full_name": "Real Owner"},
    )
    assert reclaim.status_code == 202

    stale_verify = app_client.post("/api/auth/verify-email", json={"token": old_token})
    assert stale_verify.status_code == 400
    assert stale_verify.json()["detail"] == "Lien de verification invalide ou expire"

    user = run_db(_get_user(email))
    assert user is not None
    fresh_token = generate_verification_token(email, test_settings, token_version=user.auth_token_version or 0)
    verify = app_client.post("/api/auth/verify-email", json={"token": fresh_token})
    assert verify.status_code == 200

    old_password = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert old_password.status_code == 401
    new_password = app_client.post("/api/auth/login", json={"email": email, "password": "owner-pass-123"})
    assert new_password.status_code == 200


def test_signup_recovers_from_insert_race_and_reuses_existing_unverified_user(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "signup-race@example.com"
    password = "race-pass-123"
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
                        full_name="Concurrent User",
                        password=hash_password("other-pass-123"),
                        is_active=True,
                        is_email_verified=False,
                    )
                )
                await original_commit(race_db)

    monkeypatch.setattr(AsyncSession, "flush", racing_flush)
    monkeypatch.setattr(AsyncSession, "rollback", rollback_and_seed)

    response = app_client.post(
        "/api/auth/signup",
        json={"email": email.upper(), "password": password, "full_name": "Race Winner"},
    )

    assert response.status_code == 202
    user = run_db(_get_user(email))
    assert user is not None
    assert user.full_name == "Race Winner"
    assert user.is_email_verified is False
    assert user.auth_token_version == 1


def test_email_verification_token_is_single_use(app_client, test_settings, run_db):
    email = "single-use-verify@example.com"
    run_db(_seed_user(email, is_email_verified=False))
    token = generate_verification_token(email, test_settings, token_version=0)

    first = app_client.post("/api/auth/verify-email", json={"token": token})
    assert first.status_code == 200

    replay = app_client.post("/api/auth/verify-email", json={"token": token})
    assert replay.status_code == 400
    assert replay.json()["detail"] == "Lien de verification invalide ou expire"


def test_google_login_happy_path(app_client, monkeypatch):
    import app.routers.users as users_router

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": "googleuser@example.com",
            "email_verified": True,
            "name": "Google User",
            "picture": "https://example.com/avatar.png",
            "sub": "google-sub-1",
        },
    )

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})
    assert response.status_code == 200
    body = response.json()
    assert "access_token" not in body
    assert body["user"]["email"] == "googleuser@example.com"
    assert response.cookies.get("kresco_token")


def test_google_login_recovers_from_insert_race_and_uses_existing_user(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "google-race@example.com"
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
                        full_name="Concurrent Google User",
                        password="!",
                        is_active=True,
                        is_email_verified=True,
                    )
                )
                await original_commit(race_db)

    monkeypatch.setattr(AsyncSession, "flush", racing_flush)
    monkeypatch.setattr(AsyncSession, "rollback", rollback_and_seed)
    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": email,
            "email_verified": True,
            "name": "Google Race Winner",
            "picture": "https://example.com/avatar.png",
            "sub": "google-race-sub",
        },
    )

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == email
    user = run_db(_get_user(email))
    assert user is not None
    assert user.google_id == "google-race-sub"
    assert user.is_email_verified is True


def test_google_login_normalizes_email_and_neutralizes_unverified_password(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "google-pre-ato@example.com"
    run_db(_seed_user(email, is_email_verified=False))

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": "  GOOGLE-PRE-ATO@EXAMPLE.COM  ",
            "email_verified": True,
            "name": "Google Owner",
            "picture": "https://example.com/avatar.png",
            "sub": "google-pre-ato-sub",
        },
    )

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})

    assert response.status_code == 200
    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is True
    assert user.google_id == "google-pre-ato-sub"
    assert is_unusable_password(user.password)
    assert user.password != "!"

    password_login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert password_login.status_code == 401


def test_google_login_activation_invalidates_pending_verification_token(app_client, monkeypatch, test_settings, run_db):
    import app.routers.users as users_router

    email = "google-activation-stale-verify@example.com"
    run_db(_seed_user(email, is_email_verified=False))
    stale_token = generate_verification_token(email, test_settings, token_version=0)

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": email,
            "email_verified": True,
            "name": "Google Owner",
            "picture": "https://example.com/avatar.png",
            "sub": "google-activation-sub",
        },
    )

    login = app_client.post("/api/google-login", json={"credential": "fake-credential"})
    assert login.status_code == 200

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is True
    assert user.email_token_version == 1
    assert user.auth_token_version == 1

    stale_verify = app_client.post("/api/auth/verify-email", json={"token": stale_token})
    assert stale_verify.status_code == 400
    assert stale_verify.json()["detail"] == "Lien de verification invalide ou expire"


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "google-unverified@example.com", "email_verified": False, "sub": "google-unverified-sub"},
        {"email": "google-missing-verification@example.com", "sub": "google-missing-verification-sub"},
        {"email": "google-missing-sub@example.com", "email_verified": True},
        {"email": None, "email_verified": True, "sub": "google-null-email-sub"},
    ],
)
def test_google_login_rejects_unverified_or_malformed_identity_payload(app_client, monkeypatch, payload):
    import app.routers.users as users_router

    monkeypatch.setattr(users_router, "verify_google_token", lambda *_: payload)

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid Google credential"
    assert "access_token" not in response.text


def test_legacy_unusable_password_sentinel_still_cannot_login(app_client, run_db):
    email = "legacy-unusable@example.com"

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(User(
                email=email,
                full_name="Legacy Unusable",
                password="!",
                is_active=True,
                is_email_verified=True,
            ))
            await db.commit()

    run_db(_seed())

    response = app_client.post("/api/auth/login", json={"email": email, "password": "anything"})

    assert response.status_code == 401


def test_google_login_does_not_mint_token_after_persistence_failure(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "google-commit-failure@example.com"
    run_db(_seed_user(email, is_email_verified=False))

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": email,
            "email_verified": True,
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
            "email_verified": True,
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


def test_verify_email_does_not_require_active_professor_offering(app_client, test_settings, run_db):
    email = "verify-unassigned-professor@example.com"
    run_db(_seed_unassigned_google_professor(email))
    token = generate_verification_token(email, test_settings)

    response = app_client.post("/api/auth/verify-email", json={"token": token})

    assert response.status_code == 200
    assert "access_token" not in response.text

    user = run_db(_get_user(email))
    assert user is not None
    assert user.is_email_verified is True


def test_demo_login_endpoint_is_removed(app_client):
    response = app_client.post("/api/auth/demo-login", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 404
    assert "access_token" not in response.text


def test_signup_does_not_block_when_verification_email_fails(app_client, monkeypatch, caplog):
    import app.routers.users as users_router

    monkeypatch.setattr(users_router, "send_verification_email", _failing_send_email)
    caplog.set_level("WARNING", logger="kresco.auth")

    response = app_client.post(
        "/api/auth/signup",
        json={"email": "email-failure@example.com", "password": "strong-pass-123", "full_name": "Email Failure"},
    )

    assert response.status_code == 202
    assert response.json()["email"] == "email-failure@example.com"
    assert any(
        record.message == "auth_email_dispatch_failed"
        and getattr(record, "flow", "") == "signup_verification"
        for record in caplog.records
    )


def test_email_dispatch_failure_logging_preserves_flow_without_exc_info(caplog):
    caplog.set_level("WARNING", logger="kresco.auth")

    auth_email_dispatch.log_email_dispatch_failure("signup_verification", RuntimeError("email provider unavailable"))

    [record] = [
        entry for entry in caplog.records
        if entry.message == "auth_email_dispatch_failed"
    ]
    assert getattr(record, "flow", "") == "signup_verification"
    assert getattr(record, "error_type", "") == "RuntimeError"
    assert record.exc_info is None


def test_resend_verification_does_not_block_when_email_fails(app_client, monkeypatch, run_db, caplog):
    import app.routers.users as users_router

    run_db(_seed_user("resend-failure@example.com", is_email_verified=False))
    monkeypatch.setattr(users_router, "send_verification_email", _failing_send_email)
    caplog.set_level("WARNING", logger="kresco.auth")

    response = app_client.post("/api/auth/resend-verification", json={"email": "resend-failure@example.com"})

    assert response.status_code == 200
    assert "un email a ete envoye" in response.json()["message"]
    assert any(
        record.message == "auth_email_dispatch_failed"
        and getattr(record, "flow", "") == "resend_verification"
        for record in caplog.records
    )


def test_resend_verification_retry_is_not_blackholed_by_failed_send(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "resend-retry@example.com"
    run_db(_seed_user(email, is_email_verified=False))
    calls = {"count": 0}

    async def flaky_send_verification_email(target_email, *_args, **_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("email provider unavailable")

    monkeypatch.setattr(users_router, "send_verification_email", flaky_send_verification_email)

    first = app_client.post("/api/auth/resend-verification", json={"email": email})
    assert first.status_code == 200
    assert run_db(_get_email_throttle(email, users_router.EMAIL_PURPOSE_VERIFICATION)) is None

    second = app_client.post("/api/auth/resend-verification", json={"email": email})
    assert second.status_code == 200
    throttle = run_db(_get_email_throttle(email, users_router.EMAIL_PURPOSE_VERIFICATION))
    assert throttle is not None
    assert throttle.sent_count == 1
    assert calls["count"] == 2


def test_email_dispatch_release_does_not_rewind_newer_reservation(run_db):
    email = "resend-release-race@example.com"
    purpose = auth_email_dispatch.EMAIL_PURPOSE_VERIFICATION
    original_sent_at = datetime.now(timezone.utc) - timedelta(minutes=10)

    async def _reserve_mutate_and_release():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(
                EmailDispatchThrottle(
                    email=email,
                    purpose=purpose,
                    window_started_at=original_sent_at,
                    sent_count=1,
                    last_sent_at=original_sent_at,
                )
            )
            await db.commit()

        async with session_factory() as db:
            reservation = await auth_email_dispatch.reserve_email_dispatch(db, email, purpose)
            assert reservation is not None
            assert reservation.created is False
            await db.commit()

        newer_sent_at = datetime.now(timezone.utc)
        async with session_factory() as db:
            throttle = (
                await db.execute(
                    select(EmailDispatchThrottle).where(
                        EmailDispatchThrottle.email == email,
                        EmailDispatchThrottle.purpose == purpose,
                    )
                )
            ).scalar_one()
            throttle.sent_count = 3
            throttle.last_sent_at = newer_sent_at
            await db.commit()

        await auth_email_dispatch.release_email_dispatch_reservation(reservation)
        return await _get_email_throttle(email, purpose)

    throttle = run_db(_reserve_mutate_and_release())

    assert throttle is not None
    assert throttle.sent_count == 3
    assert throttle.last_sent_at is not None
    assert auth_email_dispatch.as_aware_utc(throttle.last_sent_at) > original_sent_at


def test_resend_verification_commits_throttle_before_email_io(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "resend-commit-before-send@example.com"
    run_db(_seed_user(email, is_email_verified=False))

    async def assert_throttle_committed(target_email, *_args, **_kwargs):
        throttle = await _get_email_throttle(target_email, users_router.EMAIL_PURPOSE_VERIFICATION)
        assert throttle is not None
        assert throttle.sent_count == 1

    monkeypatch.setattr(users_router, "send_verification_email", assert_throttle_committed)

    response = app_client.post("/api/auth/resend-verification", json={"email": email})

    assert response.status_code == 200


def test_resend_verification_throttle_insert_race_is_neutral_no_send(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "resend-throttle-insert-race@example.com"
    run_db(_seed_user(email, is_email_verified=False))
    sent_emails = []
    calls = {"flush": 0, "commit": 0}
    original_flush = AsyncSession.flush
    original_commit = AsyncSession.commit

    async def fake_send_verification_email(target_email, *_args, **_kwargs):
        sent_emails.append(target_email)

    async def racing_flush(self, *args, **kwargs):
        calls["flush"] += 1
        if calls["flush"] == 1:
            now = datetime.now(timezone.utc)
            session_factory = get_session_factory()
            async with session_factory() as race_db:
                await race_db.execute(
                    insert(EmailDispatchThrottle).values(
                        email=email,
                        purpose=users_router.EMAIL_PURPOSE_VERIFICATION,
                        window_started_at=now,
                        sent_count=1,
                        last_sent_at=now,
                    )
                )
                await original_commit(race_db)
            raise IntegrityError("insert", {}, Exception("duplicate key"))
        return await original_flush(self, *args, **kwargs)

    async def commit_would_have_surfaced_old_race(self):
        calls["commit"] += 1
        raise IntegrityError("insert", {}, Exception("duplicate key"))

    monkeypatch.setattr(users_router, "send_verification_email", fake_send_verification_email)
    monkeypatch.setattr(AsyncSession, "flush", racing_flush)
    monkeypatch.setattr(AsyncSession, "commit", commit_would_have_surfaced_old_race)

    response = app_client.post("/api/auth/resend-verification", json={"email": email})

    assert response.status_code == 200
    assert sent_emails == []
    assert calls == {"flush": 1, "commit": 0}
    throttle = run_db(_get_email_throttle(email, users_router.EMAIL_PURPOSE_VERIFICATION))
    assert throttle is not None
    assert throttle.sent_count == 1


def test_forgot_password_does_not_block_when_email_fails(app_client, monkeypatch, run_db, caplog):
    import app.routers.users as users_router

    run_db(_seed_user("forgot-failure@example.com", is_email_verified=True))
    monkeypatch.setattr(users_router, "send_reset_email", _failing_send_email)
    caplog.set_level("WARNING", logger="kresco.auth")

    response = app_client.post("/api/auth/forgot-password", json={"email": "forgot-failure@example.com"})

    assert response.status_code == 200
    assert "email de reinitialisation" in response.json()["message"]
    assert any(
        record.message == "auth_email_dispatch_failed"
        and getattr(record, "flow", "") == "forgot_password"
        for record in caplog.records
    )


def test_resend_verification_is_throttled_by_target_email(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "resend-throttle@example.com"
    calls = []
    run_db(_seed_user(email, is_email_verified=False))

    async def fake_send_verification_email(target_email, *_args, **_kwargs):
        calls.append(target_email)

    monkeypatch.setattr(users_router, "send_verification_email", fake_send_verification_email)

    first = app_client.post("/api/auth/resend-verification", json={"email": email})
    second = app_client.post("/api/auth/resend-verification", json={"email": email})

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == [email]
    throttle = run_db(_get_email_throttle(email, users_router.EMAIL_PURPOSE_VERIFICATION))
    assert throttle is not None
    assert throttle.sent_count == 1


def test_forgot_password_is_throttled_by_target_email(app_client, monkeypatch, run_db):
    import app.routers.users as users_router

    email = "forgot-throttle@example.com"
    calls = []
    run_db(_seed_user(email, is_email_verified=True))

    async def fake_send_reset_email(target_email, *_args, **_kwargs):
        calls.append(target_email)

    monkeypatch.setattr(users_router, "send_reset_email", fake_send_reset_email)

    first = app_client.post("/api/auth/forgot-password", json={"email": email})
    second = app_client.post("/api/auth/forgot-password", json={"email": email})

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == [email]
    throttle = run_db(_get_email_throttle(email, users_router.EMAIL_PURPOSE_PASSWORD_RESET))
    assert throttle is not None
    assert throttle.sent_count == 1


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
    assert "access_token" not in login.json()
    assert login.cookies.get("kresco_token")


def test_reset_password_hides_missing_accounts(app_client, test_settings):
    reset_token = generate_reset_token("missing-reset-user@example.com", test_settings, token_version=0)

    response = app_client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "password": "new-strong-pass-123"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Lien de reinitialisation invalide ou expire"


def test_reset_password_rejects_passwords_shorter_than_eight_characters(app_client, test_settings, run_db):
    email = "short-reset-password@example.com"
    run_db(_seed_user(email, is_email_verified=True))
    reset_token = generate_reset_token(email, test_settings, token_version=0)

    response = app_client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "password": "1234567"},
    )

    assert response.status_code == 400
    assert "au moins 8" in response.json()["detail"]


def test_profile_accepts_auth_cookie(app_client, run_db):
    email = "cookie-auth@example.com"
    run_db(_seed_user(email, is_email_verified=True))

    login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert login.status_code == 200
    assert login.cookies.get("kresco_token")

    profile = app_client.get("/api/profile/me")
    assert profile.status_code == 200
    assert profile.json()["email"] == email


def test_logout_revokes_existing_cookie_token(app_client, run_db):
    email = "logout-revokes-token@example.com"
    run_db(_seed_user(email, is_email_verified=True))

    login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert login.status_code == 200
    old_token = login.cookies.get("kresco_token")
    csrf_token = login.cookies.get("kresco_csrf")
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


def test_logout_does_not_invalidate_pending_password_reset_link(app_client, test_settings, run_db):
    email = "logout-keeps-reset-link@example.com"
    run_db(_seed_user(email, is_email_verified=True))
    reset_token = generate_reset_token(email, test_settings, token_version=0)

    login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert login.status_code == 200
    csrf_token = login.cookies.get("kresco_csrf")
    assert csrf_token

    logout = app_client.post(
        "/api/auth/logout",
        headers={"Origin": "http://localhost:3000", "x-csrf-token": csrf_token},
    )
    assert logout.status_code == 200

    reset = app_client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "password": "new-logout-reset-pass"},
    )
    assert reset.status_code == 200

    old_password = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    new_password = app_client.post("/api/auth/login", json={"email": email, "password": "new-logout-reset-pass"})
    assert old_password.status_code == 401
    assert new_password.status_code == 200


def test_session_revocation_does_not_invalidate_pending_verification_link(app_client, test_settings, run_db):
    email = "session-revoke-keeps-verify@example.com"
    run_db(_seed_user(email, is_email_verified=False))
    verify_token = generate_verification_token(email, test_settings, token_version=0)

    async def _revoke_sessions_without_rotating_email_token():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            await auth_account.revoke_user_sessions(db, user)

    run_db(_revoke_sessions_without_rotating_email_token())

    verify = app_client.post("/api/auth/verify-email", json={"token": verify_token})
    assert verify.status_code == 200


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


def test_password_reset_revokes_existing_bearer_tokens(app_client, test_settings, run_db):
    email = "reset-revokes-token@example.com"
    run_db(_seed_user(email, is_email_verified=True))

    login = app_client.post("/api/auth/login", json={"email": email, "password": "strong-pass-123"})
    assert login.status_code == 200
    old_token = login.cookies.get("kresco_token")
    assert old_token

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
    new_token = new_login.cookies.get("kresco_token")
    assert new_token
    profile = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {new_token}"})
    assert profile.status_code == 200
    assert profile.json()["email"] == email
