from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.gamification import DailyQuest, UserXP, XPDailyCapUsage, XPTransaction
from app.models.users import User, UserPermission
from app.services.auth import create_token
from app.services.xp import XPAward, XP_DAILY_CAPS, award_xp, award_xp_bulk, generate_daily_quests

BACKEND_ROOT = Path(__file__).resolve().parents[1]


async def _seed_xp_user(email: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(email=email, full_name="XP User", is_active=True, is_email_verified=True, password="!")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


async def _seed_xp_staff(email: str, *, is_superuser: bool = False) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="XP Staff",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
            is_superuser=is_superuser,
            password="!",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


async def _grant_xp_permission(user_id: int, permission: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        grant = UserPermission(user_id=user_id, permission=permission, reason="test xp permission")
        db.add(grant)
        await db.commit()
        await db.refresh(grant)
        return grant.id


async def _xp_transactions_for_user(user_id: int) -> list[XPTransaction]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(XPTransaction).where(XPTransaction.user_id == user_id).order_by(XPTransaction.id.asc())
        )
        return list(result.scalars().all())


async def _force_user_xp_total(user_id: int, total_xp: int) -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        xp = await db.scalar(select(UserXP).where(UserXP.user_id == user_id))
        if xp is None:
            db.add(UserXP(user_id=user_id, total_xp=total_xp, streak_days=0))
        else:
            xp.total_xp = total_xp
        await db.commit()


async def _xp_adjustment_audits(user_id: int | None = None) -> list[AdminAuditLog]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(AdminAuditLog)
            .where(AdminAuditLog.action == "xp_adjustment")
            .order_by(AdminAuditLog.id.asc())
        )
        audits = list(result.scalars().all())
        if user_id is None:
            return audits
        return [audit for audit in audits if (audit.changed_data or {}).get("user_id") == int(user_id)]


def test_xp_transactions_allow_signed_admin_adjustments_model_and_migration():
    constraint_names = {constraint.name for constraint in XPTransaction.__table__.constraints}
    assert "ck_xp_transactions_amount_nonnegative" not in constraint_names

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0070_signed_xp_adjustments.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0069"' in migration_text
    assert "drop_constraint(\"ck_xp_transactions_amount_nonnegative\"" in migration_text
    assert "create_check_constraint(\"ck_xp_transactions_amount_nonnegative\"" in migration_text
    assert "negative XP transactions exist" in migration_text


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


async def _user_xp_state(user_id: int) -> tuple[int, int, date | None]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        xp = await db.scalar(select(UserXP).where(UserXP.user_id == user_id))
        if xp is None:
            return 0, 0, None
        return int(xp.total_xp or 0), int(xp.streak_days or 0), xp.last_active_date


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


def test_generate_daily_quests_backfills_missing_templates(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-partial-quests@example.com"))
    quest_date = date(2031, 1, 16)

    async def _seed_partial_and_generate():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(DailyQuest(
                user_id=user_id,
                quest_type="earn_xp",
                title="Existing XP quest",
                target=100,
                progress=0,
                xp_reward=25,
                date=quest_date,
            ))
            await db.flush()
            quests = await generate_daily_quests(user_id, db, quest_date=quest_date)
            await db.commit()
            return {quest.quest_type for quest in quests}

    assert run_db(_seed_partial_and_generate()) == {"complete_lesson", "pass_quiz", "earn_xp"}
    assert run_db(_daily_quest_count(user_id)) == 3


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
                idempotency_key=f"xp-active-date:user:{user_id}:quiz",
            )
            await db.commit()
            return amount

    assert run_db(_exercise()) == 20
    assert run_db(_daily_quest_progress(user_id, active_date)) == {
        "complete_lesson": 0,
        "pass_quiz": 1,
        "earn_xp": 20,
    }


def test_award_xp_generates_missing_daily_quests_before_progress_update(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-missing-quests-before-award@example.com"))
    active_date = date(2031, 2, 22)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount = await award_xp(
                user_id,
                "quiz_pass",
                "Direct deep-link quiz",
                db,
                active_date=active_date,
                idempotency_key=f"xp-missing-quests:user:{user_id}:quiz",
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
    assert queries.count <= 10, queries.statements
    assert run_db(_daily_quest_progress(user_id, active_date)) == {
        "complete_lesson": 0,
        "pass_quiz": 1,
        "earn_xp": 30,
    }
    assert run_db(_exercise()) == 0
    assert run_db(_assert_state()) == (30, 3)


def test_award_xp_updates_daily_streak_once_per_active_day(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-daily-streak@example.com"))
    first_day = date(2031, 4, 10)
    second_day = date(2031, 4, 11)
    missed_day = date(2031, 4, 13)

    async def _award(reason: str, key_suffix: str, active_date: date):
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount = await award_xp(
                user_id,
                reason,
                f"Streak {key_suffix}",
                db,
                active_date=active_date,
                idempotency_key=f"xp-streak:user:{user_id}:{key_suffix}",
            )
            await db.commit()
            return amount

    assert run_db(_award("video_complete", "first-day-first", first_day)) == 10
    assert run_db(_user_xp_state(user_id)) == (10, 1, first_day)

    assert run_db(_award("quiz_pass", "first-day-second", first_day)) == 20
    assert run_db(_user_xp_state(user_id)) == (30, 1, first_day)

    assert run_db(_award("quiz_pass", "second-day", second_day)) == 20
    assert run_db(_user_xp_state(user_id)) == (50, 2, second_day)

    assert run_db(_award("quiz_pass", "missed-day", missed_day)) == 20
    assert run_db(_user_xp_state(user_id)) == (70, 1, missed_day)


def test_award_xp_rejects_missing_idempotency_key(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-missing-key@example.com"))

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await award_xp(user_id, "quiz_pass", "Missing key", db)

    with pytest.raises(ValueError, match="idempotency key"):
        run_db(_exercise())


def test_award_xp_dedupes_repeated_idempotency_key(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-repeated-key@example.com"))
    key = f"xp-repeat:user:{user_id}:quiz"

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            first = await award_xp(user_id, "quiz_pass", "Repeat key", db, idempotency_key=key)
            second = await award_xp(user_id, "quiz_pass", "Repeat key", db, idempotency_key=key)
            await db.commit()
            rows = (
                await db.execute(select(XPTransaction).where(XPTransaction.user_id == user_id))
            ).scalars().all()
            total_xp = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_id))
            return first, second, len(rows), total_xp

    assert run_db(_exercise()) == (20, 0, 1, 20)


def test_bulk_award_xp_rejects_missing_idempotency_key(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-bulk-missing-key@example.com"))

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await award_xp_bulk(
                user_id,
                [XPAward("quiz_correct", "Missing key")],
                db,
            )

    with pytest.raises(ValueError, match="idempotency key"):
        run_db(_exercise())


def test_bulk_award_xp_dedupes_duplicate_idempotency_keys_in_one_batch(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-bulk-duplicate-key@example.com"))

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount = await award_xp_bulk(
                user_id,
                [
                    XPAward("quiz_correct", "Duplicate key A", idempotency_key=f"bulk-dupe:user:{user_id}:same"),
                    XPAward("quiz_correct", "Duplicate key B", idempotency_key=f"bulk-dupe:user:{user_id}:same"),
                    XPAward("quiz_pass", "Distinct pass", idempotency_key=f"bulk-dupe:user:{user_id}:pass"),
                ],
                db,
            )
            await db.commit()
            rows = (
                await db.execute(select(XPTransaction).where(XPTransaction.user_id == user_id))
            ).scalars().all()
            total_xp = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_id))
            return amount, len(rows), total_xp, {row.idempotency_key for row in rows}

    amount, row_count, total_xp, keys = run_db(_exercise())

    assert amount == 25
    assert row_count == 2
    assert total_xp == 25
    assert keys == {f"bulk-dupe:user:{user_id}:same", f"bulk-dupe:user:{user_id}:pass"}


def test_award_xp_idempotency_key_is_scoped_per_user(app_client, run_db):
    del app_client
    user_a = run_db(_seed_xp_user("xp-idempotency-user-a@example.com"))
    user_b = run_db(_seed_xp_user("xp-idempotency-user-b@example.com"))
    shared_key = "shared-xp-idempotency-key"

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            amount_a = await award_xp(
                user_a,
                "quiz_pass",
                "User A shared key",
                db,
                idempotency_key=shared_key,
            )
            amount_b = await award_xp(
                user_b,
                "quiz_pass",
                "User B shared key",
                db,
                idempotency_key=shared_key,
            )
            await db.commit()
            rows = (
                await db.execute(
                    select(XPTransaction).where(XPTransaction.idempotency_key == shared_key)
                )
            ).scalars().all()
            totals = (
                await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_a)),
                await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_b)),
            )
            return amount_a, amount_b, len(rows), totals

    amount_a, amount_b, row_count, totals = run_db(_exercise())

    assert amount_a == 20
    assert amount_b == 20
    assert row_count == 2
    assert totals == (20, 20)


def test_award_xp_enforces_daily_category_cap_and_audits_capped_rows(app_client, monkeypatch, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-daily-cap@example.com"))
    active_date = date(2031, 5, 1)
    monkeypatch.setitem(XP_DAILY_CAPS, "quiz_correct", 12)

    async def _award(key: str):
        session_factory = get_session_factory()
        async with session_factory() as db:
            awarded = await award_xp(
                user_id,
                "quiz_correct",
                f"Cap award {key}",
                db,
                active_date=active_date,
                idempotency_key=f"xp-cap:user:{user_id}:{key}",
            )
            await db.commit()
            return awarded

    assert run_db(_award("first")) == 5
    assert run_db(_award("second")) == 5
    assert run_db(_award("third")) == 2
    assert run_db(_award("fourth")) == 0

    async def _assert_state():
        session_factory = get_session_factory()
        async with session_factory() as db:
            transactions = (
                await db.execute(
                    select(XPTransaction)
                    .where(XPTransaction.user_id == user_id, XPTransaction.daily_cap_category == "quiz_correct")
                    .order_by(XPTransaction.id.asc())
                )
            ).scalars().all()
            usage = await db.scalar(
                select(XPDailyCapUsage).where(
                    XPDailyCapUsage.user_id == user_id,
                    XPDailyCapUsage.award_date == active_date,
                    XPDailyCapUsage.category == "quiz_correct",
                )
            )
            total_xp = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_id))
            return [
                (row.amount, row.requested_amount, row.cap_applied, row.daily_cap_date)
                for row in transactions
            ], usage.amount_awarded, total_xp

    rows, usage_amount, total_xp = run_db(_assert_state())

    assert rows == [
        (5, 5, False, active_date),
        (5, 5, False, active_date),
        (2, 5, True, active_date),
        (0, 5, True, active_date),
    ]
    assert usage_amount == 12
    assert total_xp == 12


def test_daily_caps_are_per_user_and_active_date(app_client, monkeypatch, run_db):
    del app_client
    user_a = run_db(_seed_xp_user("xp-cap-user-a@example.com"))
    user_b = run_db(_seed_xp_user("xp-cap-user-b@example.com"))
    first_day = date(2031, 5, 2)
    second_day = date(2031, 5, 3)
    monkeypatch.setitem(XP_DAILY_CAPS, "quiz_correct", 5)

    async def _award(user_id: int, active_date: date, key: str):
        session_factory = get_session_factory()
        async with session_factory() as db:
            awarded = await award_xp(
                user_id,
                "quiz_correct",
                f"Per user cap {key}",
                db,
                active_date=active_date,
                idempotency_key=f"xp-cap:user:{user_id}:{active_date}:{key}",
            )
            await db.commit()
            return awarded

    assert run_db(_award(user_a, first_day, "a1")) == 5
    assert run_db(_award(user_a, first_day, "a2")) == 0
    assert run_db(_award(user_a, second_day, "a3")) == 5
    assert run_db(_award(user_b, first_day, "b1")) == 5

    assert run_db(_user_xp_state(user_a))[0] == 10
    assert run_db(_user_xp_state(user_b))[0] == 5


def test_amount_overrides_are_policy_bounded(app_client, run_db):
    del app_client
    user_id = run_db(_seed_xp_user("xp-override-policy@example.com"))
    active_date = date(2031, 5, 4)

    async def _oversized_daily_quest():
        session_factory = get_session_factory()
        async with session_factory() as db:
            awarded = await award_xp(
                user_id,
                "daily_quest",
                "Oversized daily quest",
                db,
                active_date=active_date,
                amount_override=500,
                idempotency_key=f"xp-override:user:{user_id}:daily",
                update_daily_quests=False,
            )
            await db.commit()
            row = await db.scalar(select(XPTransaction).where(XPTransaction.user_id == user_id))
            return awarded, row.amount, row.requested_amount, row.cap_applied

    assert run_db(_oversized_daily_quest()) == (75, 75, 75, False)

    async def _unknown_override():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await award_xp(
                user_id,
                "custom_bonus",
                "Unknown override",
                db,
                active_date=active_date,
                amount_override=10,
                idempotency_key=f"xp-override:user:{user_id}:unknown",
            )

    with pytest.raises(ValueError, match="override"):
        run_db(_unknown_override())


def test_admin_xp_adjustment_requires_xp_adjust_permission(app_client, auth_token, run_db, test_settings):
    student_token, target_user_id = auth_token(email="xp-adjust-permission-student@example.com")
    plain_staff_id = run_db(_seed_xp_staff("xp-adjust-plain-staff@example.com"))
    plain_staff_token = create_token(plain_staff_id, test_settings)
    payload = {
        "user_id": target_user_id,
        "amount": 25,
        "reason": "Support correction",
        "idempotency_key": f"xp-adjust-permission:user:{target_user_id}",
    }

    student_response = app_client.post(
        "/api/admin/xp-adjustments",
        json=payload,
        headers={"Authorization": f"Bearer {student_token}"},
    )
    plain_staff_response = app_client.post(
        "/api/admin/xp-adjustments",
        json=payload,
        headers={"Authorization": f"Bearer {plain_staff_token}"},
    )

    assert student_response.status_code == 403
    assert student_response.json()["detail"] == "Staff access required"
    assert plain_staff_response.status_code == 403
    assert plain_staff_response.json()["detail"] == "Permission required: xp:adjust"
    assert run_db(_user_xp_state(target_user_id)) == (0, 0, None)
    assert run_db(_xp_transactions_for_user(target_user_id)) == []
    assert run_db(_xp_adjustment_audits()) == []


def test_staff_with_xp_adjust_permission_can_apply_signed_audited_adjustments(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    _student_token, target_user_id = auth_token(email="xp-adjust-target@example.com")
    staff_id = run_db(_seed_xp_staff("xp-adjust-staff@example.com"))
    run_db(_grant_xp_permission(staff_id, "xp:adjust"))
    second_staff_id = run_db(_seed_xp_staff("xp-adjust-second-staff@example.com"))
    run_db(_grant_xp_permission(second_staff_id, "xp:adjust"))
    headers = {"Authorization": f"Bearer {create_token(staff_id, test_settings)}"}
    second_headers = {"Authorization": f"Bearer {create_token(second_staff_id, test_settings)}"}

    first_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": 120,
            "reason": "Imported quiz correction",
            "idempotency_key": f"xp-adjust:user:{target_user_id}:grant",
        },
        headers=headers,
    )
    duplicate_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": 120,
            "reason": "Imported quiz correction",
            "idempotency_key": f"xp-adjust:user:{target_user_id}:grant",
        },
        headers=second_headers,
    )
    reversal_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": -40,
            "reason": "Remove duplicate exercise reward",
            "idempotency_key": f"xp-adjust:user:{target_user_id}:reversal",
        },
        headers=headers,
    )

    assert first_response.status_code == 200
    first = first_response.json()
    assert first["user_id"] == target_user_id
    assert first["amount"] == 120
    assert first["requested_amount"] == 120
    assert first["reason"] == "admin_adjustment"
    assert first["description"] == "Imported quiz correction"
    assert first["actor_user_id"] == staff_id
    assert first["total_xp"] == 120

    assert duplicate_response.status_code == 200
    duplicate = duplicate_response.json()
    assert duplicate["transaction_id"] == first["transaction_id"]
    assert duplicate["actor_user_id"] == staff_id
    assert duplicate["total_xp"] == 120

    assert reversal_response.status_code == 200
    reversal = reversal_response.json()
    assert reversal["amount"] == -40
    assert reversal["total_xp"] == 80
    assert run_db(_user_xp_state(target_user_id))[0] == 80

    transactions = run_db(_xp_transactions_for_user(target_user_id))
    assert [(row.amount, row.requested_amount, row.reason, row.description) for row in transactions] == [
        (120, 120, "admin_adjustment", "Imported quiz correction"),
        (-40, -40, "admin_adjustment", "Remove duplicate exercise reward"),
    ]
    assert all(row.daily_cap_category is None and row.daily_cap_date is None for row in transactions)

    audits = run_db(_xp_adjustment_audits(target_user_id))
    assert len(audits) == 2
    assert audits[0].object_pk == str(first["transaction_id"])
    assert audits[0].changed_data["previous_total_xp"] == 0
    assert audits[0].changed_data["next_total_xp"] == 120
    assert audits[0].changed_data["actor_user_id"] == staff_id
    assert audits[1].object_pk == str(reversal["transaction_id"])
    assert audits[1].changed_data["previous_total_xp"] == 120
    assert audits[1].changed_data["next_total_xp"] == 80


def test_admin_xp_adjustment_rejects_negative_final_total_and_self_adjustment(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    _student_token, target_user_id = auth_token(email="xp-adjust-negative-target@example.com")
    staff_id = run_db(_seed_xp_staff("xp-adjust-negative-staff@example.com"))
    run_db(_grant_xp_permission(staff_id, "xp:adjust"))
    headers = {"Authorization": f"Bearer {create_token(staff_id, test_settings)}"}

    negative_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": -1,
            "reason": "Too much reversal",
            "idempotency_key": f"xp-adjust:user:{target_user_id}:negative",
        },
        headers=headers,
    )
    self_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": staff_id,
            "amount": 10,
            "reason": "Self bonus",
            "idempotency_key": f"xp-adjust:user:{staff_id}:self",
        },
        headers=headers,
    )

    assert negative_response.status_code == 400
    assert negative_response.json()["detail"] == "XP adjustment cannot make total XP negative"
    assert self_response.status_code == 400
    assert self_response.json()["detail"] == "Cannot adjust your own XP"
    assert run_db(_user_xp_state(target_user_id)) == (0, 0, None)
    assert run_db(_xp_transactions_for_user(target_user_id)) == []


def test_admin_xp_adjustment_rejects_idempotency_collisions(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    _student_token, target_user_id = auth_token(email="xp-adjust-collision-target@example.com")
    staff_id = run_db(_seed_xp_staff("xp-adjust-collision-staff@example.com"))
    run_db(_grant_xp_permission(staff_id, "xp:adjust"))
    headers = {"Authorization": f"Bearer {create_token(staff_id, test_settings)}"}
    normal_key = f"normal-xp:user:{target_user_id}:quiz"

    async def _seed_normal_xp():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await award_xp(
                target_user_id,
                "quiz_pass",
                "Normal quiz pass",
                db,
                idempotency_key=normal_key,
            )
            await db.commit()

    run_db(_seed_normal_xp())

    normal_collision_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": 10,
            "reason": "Try colliding with normal XP",
            "idempotency_key": normal_key,
        },
        headers=headers,
    )
    first_admin_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": 30,
            "reason": "Admin correction",
            "idempotency_key": f"xp-adjust:user:{target_user_id}:collision",
        },
        headers=headers,
    )
    changed_payload_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": 31,
            "reason": "Admin correction changed",
            "idempotency_key": f"xp-adjust:user:{target_user_id}:collision",
        },
        headers=headers,
    )

    assert normal_collision_response.status_code == 409
    assert normal_collision_response.json()["detail"] == "XP idempotency key already belongs to another XP transaction"
    assert first_admin_response.status_code == 200
    assert changed_payload_response.status_code == 409
    assert changed_payload_response.json()["detail"] == "XP adjustment idempotency key payload mismatch"
    assert run_db(_user_xp_state(target_user_id))[0] == 50
    transactions = run_db(_xp_transactions_for_user(target_user_id))
    assert [(row.amount, row.reason) for row in transactions] == [
        (20, "quiz_pass"),
        (30, "admin_adjustment"),
    ]
    assert len(run_db(_xp_adjustment_audits(target_user_id))) == 1


def test_admin_xp_audit_requires_audit_read_permission(app_client, auth_token, run_db, test_settings):
    student_token, target_user_id = auth_token(email="xp-audit-permission-student@example.com")
    plain_staff_id = run_db(_seed_xp_staff("xp-audit-plain-staff@example.com"))
    plain_staff_token = create_token(plain_staff_id, test_settings)

    student_response = app_client.get(
        f"/api/admin/xp-audit?user_id={target_user_id}",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    plain_staff_response = app_client.get(
        f"/api/admin/xp-audit?user_id={target_user_id}",
        headers={"Authorization": f"Bearer {plain_staff_token}"},
    )

    assert student_response.status_code == 403
    assert student_response.json()["detail"] == "Staff access required"
    assert plain_staff_response.status_code == 403
    assert plain_staff_response.json()["detail"] == "Permission required: audit:read"


def test_admin_xp_audit_explains_totals_adjustments_caps_and_mismatches(
    app_client,
    auth_token,
    monkeypatch,
    run_db,
    test_settings,
):
    _student_token, target_user_id = auth_token(email="xp-audit-target@example.com")
    staff_id = run_db(_seed_xp_staff("xp-audit-staff@example.com"))
    run_db(_grant_xp_permission(staff_id, "audit:read"))
    run_db(_grant_xp_permission(staff_id, "xp:adjust"))
    headers = {"Authorization": f"Bearer {create_token(staff_id, test_settings)}"}
    active_date = date(2032, 1, 3)
    monkeypatch.setitem(XP_DAILY_CAPS, "quiz_correct", 6)

    async def _seed_xp_activity():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await award_xp(
                target_user_id,
                "quiz_correct",
                "First capped question",
                db,
                active_date=active_date,
                idempotency_key=f"xp-audit:user:{target_user_id}:q1",
            )
            await award_xp(
                target_user_id,
                "quiz_correct",
                "Second capped question",
                db,
                active_date=active_date,
                idempotency_key=f"xp-audit:user:{target_user_id}:q2",
            )
            await db.commit()

    run_db(_seed_xp_activity())
    adjustment_response = app_client.post(
        "/api/admin/xp-adjustments",
        json={
            "user_id": target_user_id,
            "amount": -2,
            "reason": "Remove duplicate XP",
            "idempotency_key": f"xp-audit:user:{target_user_id}:adjustment",
        },
        headers=headers,
    )
    audit_response = app_client.get(
        f"/api/admin/xp-audit?user_id={target_user_id}&limit=10",
        headers=headers,
    )
    run_db(_force_user_xp_total(target_user_id, 999))
    mismatch_response = app_client.get(
        f"/api/admin/xp-audit?user_id={target_user_id}&limit=2",
        headers=headers,
    )

    assert adjustment_response.status_code == 200
    assert audit_response.status_code == 200
    payload = audit_response.json()
    assert payload["user_id"] == target_user_id
    assert payload["stored_total_xp"] == 4
    assert payload["transaction_sum_xp"] == 4
    assert payload["delta_xp"] == 0
    assert payload["has_total_mismatch"] is False
    assert payload["transaction_count"] == 3
    assert payload["adjustment_count"] == 1
    assert payload["adjustment_sum_xp"] == -2
    assert payload["capped_amount_xp"] == 4
    breakdown = {item["reason"]: item for item in payload["reason_breakdown"]}
    assert breakdown["quiz_correct"] == {
        "reason": "quiz_correct",
        "count": 2,
        "amount": 6,
        "requested_amount": 10,
    }
    assert breakdown["admin_adjustment"] == {
        "reason": "admin_adjustment",
        "count": 1,
        "amount": -2,
        "requested_amount": -2,
    }
    assert [row["reason"] for row in payload["transactions"]] == [
        "admin_adjustment",
        "quiz_correct",
        "quiz_correct",
    ]
    assert all(row["user_id"] == target_user_id for row in payload["transactions"])
    assert all(isinstance(row["transaction_id"], int) for row in payload["transactions"])
    assert payload["transactions"][0]["amount"] == -2
    assert (
        payload["transactions"][0]["idempotency_key"]
        == f"xp-audit:user:{target_user_id}:adjustment"
    )
    assert payload["transactions"][1]["daily_cap_category"] == "quiz_correct"
    assert payload["transactions"][1]["daily_cap_date"] == active_date.isoformat()

    assert mismatch_response.status_code == 200
    mismatch = mismatch_response.json()
    assert mismatch["stored_total_xp"] == 999
    assert mismatch["transaction_sum_xp"] == 4
    assert mismatch["delta_xp"] == 995
    assert mismatch["has_total_mismatch"] is True
    assert len(mismatch["transactions"]) == 2


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
