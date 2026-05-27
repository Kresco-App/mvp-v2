from datetime import date, datetime, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.gamification import DailyQuest, UserXP, XPTransaction
from app.models.users import User
from app.services.xp import XPAward, award_xp, award_xp_bulk, generate_daily_quests


async def _seed_xp_user(email: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(email=email, full_name="XP User", is_active=True, is_email_verified=True, password="!")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


async def _daily_quest_progress(user_id: int, quest_date: date) -> dict[str, int]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(DailyQuest).where(DailyQuest.user_id == user_id, DailyQuest.date == quest_date)
        )
        return {quest.quest_type: quest.progress for quest in result.scalars().all()}


async def _daily_quest_count(user_id: int) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.scalar(select(func.count()).where(DailyQuest.user_id == user_id))


def test_generate_daily_quests_uses_explicit_quest_date(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-explicit-date@example.com"))
    quest_date = date(2031, 1, 15)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            quests = await generate_daily_quests(user_id, db, quest_date=quest_date)
            await db.commit()
            return quests

    quests = run_db(_exercise())

    assert len(quests) == 3
    assert {quest.date for quest in quests} == {quest_date}


def test_award_xp_updates_quests_for_explicit_active_date(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-active-date@example.com"))
    active_date = date(2031, 2, 20)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await generate_daily_quests(user_id, db, quest_date=active_date)
            amount = await award_xp(
                user_id,
                "quiz_pass",
                "Explicit active date quiz",
                db,
                active_date=active_date,
            )
            await db.commit()
            return amount

    assert run_db(_exercise()) == 20
    assert run_db(_daily_quest_progress(user_id, active_date)) == {
        "complete_lesson": 0,
        "pass_quiz": 1,
        "earn_xp": 20,
    }


def test_bulk_award_xp_batches_transactions_and_quest_updates(app_client, query_counter, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-bulk-awards@example.com"))
    active_date = date(2031, 2, 21)

    async def _seed_quests():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await generate_daily_quests(user_id, db, quest_date=active_date)
            await db.commit()

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount = await award_xp_bulk(
                user_id,
                [
                    XPAward("quiz_correct", "Question 1 first correct", idempotency_key=f"bulk:user:{user_id}:q:1"),
                    XPAward("quiz_correct", "Question 2 first correct", idempotency_key=f"bulk:user:{user_id}:q:2"),
                    XPAward("quiz_pass", "Question set passed", idempotency_key=f"bulk:user:{user_id}:pass"),
                ],
                db,
                active_date=active_date,
            )
            await db.commit()
            return amount

    async def _assert_state():
        session_factory = get_session_factory()
        async with session_factory() as db:
            total_xp = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_id))
            transaction_count = await db.scalar(select(func.count()).where(XPTransaction.user_id == user_id))
            return total_xp, transaction_count

    run_db(_seed_quests())
    with query_counter() as queries:
        amount = run_db(_exercise())

    assert amount == 30
    assert queries.count <= 5, queries.statements
    assert run_db(_daily_quest_progress(user_id, active_date)) == {
        "complete_lesson": 0,
        "pass_quiz": 1,
        "earn_xp": 30,
    }
    assert run_db(_exercise()) == 0
    assert run_db(_assert_state()) == (30, 3)


def test_generate_daily_quests_does_not_rollback_caller_transaction_on_flush_error(app_client, monkeypatch, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-no-helper-rollback@example.com"))

    async def failing_flush(self, *args, **kwargs):
        raise RuntimeError("flush failed")

    async def forbidden_rollback(self):
        raise AssertionError("generate_daily_quests must not rollback caller transaction")

    monkeypatch.setattr(AsyncSession, "flush", failing_flush)
    monkeypatch.setattr(AsyncSession, "rollback", forbidden_rollback)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await generate_daily_quests(user_id, db, quest_date=date(2031, 3, 10))

    with pytest.raises(RuntimeError, match="flush failed"):
        run_db(_exercise())


def test_daily_quests_route_persists_generated_quests(app_client, auth_token, run_db):
    token, user_id = auth_token(email="xp-route-daily-quests@example.com")

    response = app_client.get(
        "/api/progress/daily-quests",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert len(response.json()) == 3
    assert run_db(_daily_quest_count(user_id)) == 3


def test_xp_history_supports_bounded_pagination(app_client, auth_token, run_db):
    token, user_id = auth_token(email="xp-history-pagination@example.com")

    async def _seed_transactions():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add_all([
                XPTransaction(user_id=user_id, amount=10 + index, reason="test", description=f"history {index}")
                for index in range(3)
            ])
            await db.commit()

    run_db(_seed_transactions())

    headers = {"Authorization": f"Bearer {token}"}
    first_page = app_client.get("/api/progress/xp/history?limit=2", headers=headers)
    second_page = app_client.get("/api/progress/xp/history?limit=2&offset=2", headers=headers)
    invalid_limit = app_client.get("/api/progress/xp/history?limit=101", headers=headers)

    assert first_page.status_code == 200
    assert len(first_page.json()) == 2
    assert second_page.status_code == 200
    assert len(second_page.json()) == 1
    assert invalid_limit.status_code == 422


def test_daily_quest_claim_uses_idempotent_xp_transaction(app_client, auth_token, run_db):
    token, user_id = auth_token(email="xp-claim-idempotency@example.com")
    today = datetime.now(timezone.utc).date()

    async def _seed_claimable_quest():
        session_factory = get_session_factory()
        async with session_factory() as db:
            quest = DailyQuest(
                user_id=user_id,
                quest_type="earn_xp",
                title="Claimable quest",
                target=1,
                progress=1,
                xp_reward=25,
                date=today,
            )
            db.add(quest)
            await db.commit()
            await db.refresh(quest)
            return quest.id

    quest_id = run_db(_seed_claimable_quest())

    first = app_client.post(f"/api/progress/daily-quests/{quest_id}/claim", headers={"Authorization": f"Bearer {token}"})
    duplicate = app_client.post(f"/api/progress/daily-quests/{quest_id}/claim", headers={"Authorization": f"Bearer {token}"})

    assert first.status_code == 200
    assert first.json()["xp_awarded"] == 25
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Quest already claimed"

    async def _assert_xp():
        session_factory = get_session_factory()
        async with session_factory() as db:
            xp_total = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_id))
            rows = (
                await db.execute(
                    select(XPTransaction).where(
                        XPTransaction.user_id == user_id,
                        XPTransaction.reason == "daily_quest",
                    )
                )
            ).scalars().all()
            assert xp_total == 25
            assert len(rows) == 1
            assert rows[0].amount == 25
            assert rows[0].idempotency_key == f"daily_quest_claim:user:{user_id}:quest:{quest_id}"

    run_db(_assert_xp())
