from datetime import date

from sqlalchemy import select

from app.database import get_session_factory
from app.models.gamification import UserXP, XPTransaction
from app.models.users import User
from app.security.passwords import hash_password
from app.services.email import generate_verification_token
from app.services.xp import XP_DAILY_CAPS, XP_REWARDS, award_daily_login_xp


async def _seed_login_user(email: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Daily Login",
            is_active=True,
            is_email_verified=True,
            password=hash_password("strong-pass-123"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


async def _xp_rows(user_id: int) -> list[tuple[str, int]]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        rows = (
            await db.execute(
                select(XPTransaction.reason, XPTransaction.amount)
                .where(XPTransaction.user_id == user_id)
                .order_by(XPTransaction.reason)
            )
        ).all()
        return [(reason, amount) for reason, amount in rows]


async def _xp_state(user_id: int) -> tuple[int, int, date | None]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        xp = await db.scalar(select(UserXP).where(UserXP.user_id == user_id))
        assert xp is not None
        return xp.total_xp, xp.streak_days, xp.last_active_date


async def _user_id_by_email(email: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user_id = await db.scalar(select(User.id).where(User.email == email))
        assert user_id is not None
        return user_id


def test_daily_login_xp_is_idempotent_per_day_and_awards_streak_bonus(app_client, run_db):
    del app_client
    user_id = run_db(_seed_login_user("daily-login-service@example.com"))
    first_day = date(2031, 8, 1)
    second_day = date(2031, 8, 2)

    async def _award(active_date: date) -> int:
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount = await award_daily_login_xp(db, user_id=user_id, active_date=active_date)
            await db.commit()
            return amount

    assert run_db(_award(first_day)) == XP_REWARDS["daily_login"]
    assert run_db(_award(first_day)) == 0
    assert run_db(_award(second_day)) == XP_REWARDS["daily_login"] + XP_REWARDS["streak_bonus"]

    assert run_db(_xp_rows(user_id)) == [
        ("daily_login", XP_REWARDS["daily_login"]),
        ("daily_login", XP_REWARDS["daily_login"]),
        ("streak_bonus", XP_REWARDS["streak_bonus"]),
    ]
    assert run_db(_xp_state(user_id)) == (
        XP_REWARDS["daily_login"] * 2 + XP_REWARDS["streak_bonus"],
        2,
        second_day,
    )


def test_daily_login_xp_touches_activity_when_daily_cap_exhausted(app_client, run_db, monkeypatch):
    del app_client
    user_id = run_db(_seed_login_user("daily-login-cap@example.com"))
    login_day = date(2031, 8, 3)
    monkeypatch.setitem(XP_DAILY_CAPS, "daily_quest", 0)

    async def _award() -> int:
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount = await award_daily_login_xp(db, user_id=user_id, active_date=login_day)
            await db.commit()
            return amount

    assert run_db(_award()) == 0
    assert run_db(_award()) == 0
    assert run_db(_xp_rows(user_id)) == [("daily_login", 0)]
    assert run_db(_xp_state(user_id)) == (0, 1, login_day)


def test_password_login_awards_daily_login_once(app_client, run_db):
    user_id = run_db(_seed_login_user("daily-login-route@example.com"))

    first = app_client.post(
        "/api/auth/login",
        json={"email": "daily-login-route@example.com", "password": "strong-pass-123"},
    )
    app_client.cookies.clear()
    second = app_client.post(
        "/api/auth/login",
        json={"email": "daily-login-route@example.com", "password": "strong-pass-123"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert run_db(_xp_rows(user_id)) == [("daily_login", XP_REWARDS["daily_login"])]


def test_email_verification_session_awards_daily_login(app_client, run_db, test_settings):
    async def _seed_unverified():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = User(
                email="daily-login-verify@example.com",
                full_name="Daily Verify",
                is_active=True,
                is_email_verified=False,
                password=hash_password("strong-pass-123"),
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            return user.id

    user_id = run_db(_seed_unverified())
    token = generate_verification_token("daily-login-verify@example.com", test_settings)

    response = app_client.post("/api/auth/verify-email", json={"token": token})

    assert response.status_code == 200
    assert response.cookies.get("kresco_token")
    assert run_db(_xp_rows(user_id)) == [("daily_login", XP_REWARDS["daily_login"])]


def test_google_login_session_awards_daily_login(app_client, run_db, monkeypatch):
    email = "daily-login-google@example.com"

    def _verify_firebase_token(credential: str, project_id: str):
        assert credential == "valid-google-credential"
        assert project_id
        return {
            "email": email,
            "email_verified": True,
            "sub": "google-daily-login",
            "name": "Daily Google",
            "picture": "",
        }

    monkeypatch.setattr("app.routers.users.verify_firebase_token", _verify_firebase_token)

    response = app_client.post("/api/google-login", json={"credential": "valid-google-credential"})

    assert response.status_code == 200
    user_id = run_db(_user_id_by_email(email))
    assert run_db(_xp_rows(user_id)) == [("daily_login", XP_REWARDS["daily_login"])]
