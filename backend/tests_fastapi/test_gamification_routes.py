import inspect
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.gamification_read_models as gamification_read_models
import app.services.daily_quests as daily_quests
import app.services.badges as badge_service
import app.routers.internal as internal_router
import app.scheduled as scheduled
from app.database import get_session_factory
from app.models.gamification import DailyQuest, LeaderboardRank, UserBadge, UserStats, UserXP, XPTransaction
from app.models.users import User
from app.services.xp import DAILY_QUEST_TEMPLATES, XP_DAILY_CAPS

EXPECTED_DAILY_QUEST_TYPES = {
    "complete_lesson",
    "pass_quiz",
    "earn_xp",
    "master_exercise",
    "complete_exam_problem",
    "correct_mistake",
    "daily_login",
    "continue_streak",
}


def test_progress_stats_returns_topic_item_completion_projection(app_client, auth_token, run_db):
    token, user_id = auth_token(email="progress-stats@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserStats(user_id=user_id, total_watch_seconds=7200, lessons_completed=3, quizzes_passed=2))
            await db.commit()

    run_db(_seed())
    response = app_client.get("/api/progress/stats", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "total_watch_minutes": 120,
        "quizzes_passed": 2,
        "items_completed": 3,
        "is_pro": True,
    }


def test_xp_history_leaderboard_and_quests_are_bounded(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="progress-bounded@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            user.full_name = "Progress Student"
            db.add(UserXP(user_id=user_id, total_xp=500, streak_days=4))
            db.add(LeaderboardRank(user_id=user_id, total_xp=500, global_rank=0))
            for index in range(8):
                db.add(XPTransaction(user_id=user_id, amount=10, reason="test", description=f"tx {index}"))
            await db.commit()

    run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    with query_counter() as xp_queries:
        xp = app_client.get("/api/progress/xp/history?limit=3", headers=headers)
    with query_counter() as leaderboard_queries:
        leaderboard = app_client.get("/api/progress/leaderboard?limit=5", headers=headers)
    with query_counter() as quest_queries:
        quests = app_client.get("/api/progress/daily-quests", headers=headers)

    assert xp.status_code == 200
    assert len(xp.json()) == 3
    assert leaderboard.status_code == 200
    assert any(entry["is_current_user"] for entry in leaderboard.json())
    assert quests.status_code == 200
    assert xp_queries.count <= 3
    assert leaderboard_queries.count <= 9
    assert quest_queries.count <= 8


def test_badge_inventory_syncs_backend_owned_achievements(app_client, auth_token, run_db):
    token, user_id = auth_token(email="badges-earned@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserXP(user_id=user_id, total_xp=550, streak_days=7))
            db.add_all([
                XPTransaction(
                    user_id=user_id,
                    amount=5,
                    reason="exercise_mastered",
                    description="mastered exercise",
                ),
                XPTransaction(
                    user_id=user_id,
                    amount=40,
                    reason="exam_complete",
                    description="completed exam",
                ),
                XPTransaction(
                    user_id=user_id,
                    amount=10,
                    reason="mistake_corrected",
                    description="corrected mistake",
                ),
            ])
            await db.commit()

    async def _badge_rows():
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(
                select(UserBadge)
                .where(UserBadge.user_id == user_id)
                .order_by(UserBadge.badge_slug)
            )
            return list(result.scalars().all())

    run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    response = app_client.get("/api/progress/badges", headers=headers)
    duplicate_response = app_client.get("/api/progress/badges", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 6
    assert payload["earned_count"] == 6
    badges = {badge["slug"]: badge for badge in payload["badges"]}
    assert badges["xp_100"]["earned"] is True
    assert badges["xp_100"]["evidence"] == {"total_xp": 550, "threshold": 100}
    assert badges["xp_500"]["rarity"] == "rare"
    assert badges["streak_7"]["evidence"] == {"streak_days": 7, "threshold": 7}
    assert badges["first_exercise_mastered"]["evidence"] == {
        "reason": "exercise_mastered",
        "transaction_count": 1,
    }
    assert badges["first_exam_completed"]["evidence"]["reason"] == "exam_complete"
    assert badges["first_mistake_corrected"]["evidence"]["reason"] == "mistake_corrected"
    assert all(badge["earned_at"] for badge in badges.values())

    assert duplicate_response.status_code == 200
    assert duplicate_response.json()["earned_count"] == 6
    rows = run_db(_badge_rows())
    assert len(rows) == 6
    assert {row.badge_slug for row in rows} == set(badges)


def test_badge_inventory_shows_unearned_catalog_and_requires_auth(app_client, auth_token, run_db):
    token, user_id = auth_token(email="badges-empty@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserXP(user_id=user_id, total_xp=20, streak_days=1))
            await db.commit()

    run_db(_seed())

    unauthenticated = app_client.get("/api/progress/badges")
    response = app_client.get(
        "/api/progress/badges",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 6
    assert payload["earned_count"] == 0
    assert all(not badge["earned"] for badge in payload["badges"])
    assert all(badge["evidence"] == {} for badge in payload["badges"])


def test_badge_inventory_reloads_after_duplicate_insert_conflict(auth_token, monkeypatch, run_db):
    _token, user_id = auth_token(email="badges-conflict@example.com", is_pro=True)
    original_insert = badge_service._insert_badge
    conflict_seen = False

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserXP(user_id=user_id, total_xp=100, streak_days=0))
            await db.commit()

    async def conflict_once(db, *, user_id: int, slug: str, evidence: dict, earned_at):
        nonlocal conflict_seen
        if slug == "xp_100" and not conflict_seen:
            conflict_seen = True
            db.add(
                UserBadge(
                    user_id=user_id,
                    badge_slug=slug,
                    evidence_json=evidence,
                    earned_at=earned_at,
                )
            )
            await db.flush()
            return False
        return await original_insert(
            db,
            user_id=user_id,
            slug=slug,
            evidence=evidence,
            earned_at=earned_at,
        )

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            inventory, changed = await badge_service.build_user_badge_inventory(db, user=user)
            await db.commit()
            return inventory, changed

    run_db(_seed())
    monkeypatch.setattr(badge_service, "_insert_badge", conflict_once)
    inventory, changed = run_db(_exercise())

    assert changed is False
    assert conflict_seen is True
    badges = {badge.slug: badge for badge in inventory.badges}
    assert badges["xp_100"].earned is True
    assert badges["xp_100"].evidence == {"total_xp": 100, "threshold": 100}


def test_season_leaderboard_uses_signed_xp_window_and_search(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, current_user_id = auth_token(email="season-current@example.com", is_pro=True)
    now = datetime.now(timezone.utc)
    week_start, _week_end = gamification_read_models.xp_season_window("weekly", as_of=now)
    current_window_time = now - timedelta(minutes=5)
    if current_window_time < week_start:
        current_window_time = week_start + timedelta(minutes=5)
    outside_window_time = week_start - timedelta(seconds=1)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            current = await db.get(User, current_user_id)
            current.full_name = "Season Current UniqueTarget"
            db.add(UserXP(user_id=current_user_id, total_xp=300, streak_days=2))

            leader = User(
                email="season-leader@example.com",
                full_name="Season Leader",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            tied = User(
                email="season-tied@example.com",
                full_name="Season Tied",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            inactive = User(
                email="season-inactive@example.com",
                full_name="Season Inactive",
                is_active=False,
                is_email_verified=True,
                password="!",
            )
            other_leader = User(
                email="season-other-leader@example.com",
                full_name="Other Leader",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            db.add_all([leader, tied, inactive, other_leader])
            await db.flush()
            db.add_all([
                UserXP(user_id=leader.id, total_xp=900, streak_days=0),
                UserXP(user_id=tied.id, total_xp=100, streak_days=0),
                UserXP(user_id=inactive.id, total_xp=999, streak_days=0),
                UserXP(user_id=other_leader.id, total_xp=1200, streak_days=0),
                XPTransaction(
                    user_id=current_user_id,
                    amount=900,
                    reason="quiz_pass",
                    description="current week pass",
                    created_at=current_window_time,
                ),
                XPTransaction(
                    user_id=current_user_id,
                    amount=-100,
                    reason="admin_adjustment",
                    description="current week correction",
                    created_at=current_window_time,
                ),
                XPTransaction(
                    user_id=current_user_id,
                    amount=500,
                    reason="old",
                    description="outside weekly window",
                    created_at=outside_window_time,
                ),
                XPTransaction(
                    user_id=leader.id,
                    amount=900,
                    reason="quiz_pass",
                    description="leader week pass",
                    created_at=current_window_time,
                ),
                XPTransaction(
                    user_id=tied.id,
                    amount=800,
                    reason="quiz_pass",
                    description="tie week pass",
                    created_at=current_window_time,
                ),
                XPTransaction(
                    user_id=inactive.id,
                    amount=9999,
                    reason="quiz_pass",
                    description="inactive week pass",
                    created_at=current_window_time,
                ),
                XPTransaction(
                    user_id=other_leader.id,
                    amount=1000,
                    reason="quiz_pass",
                    description="non-matching top user",
                    created_at=current_window_time,
                ),
            ])
            await db.commit()
            return leader.id, tied.id, inactive.id

    leader_id, tied_id, inactive_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    response = app_client.get(
        "/api/progress/leaderboard/seasons?season=weekly&limit=10&search=Season",
        headers=headers,
    )
    paged_response = app_client.get(
        "/api/progress/leaderboard/seasons?season=weekly&limit=1&offset=1&search=Season",
        headers=headers,
    )
    search_response = app_client.get(
        "/api/progress/leaderboard/seasons?season=weekly&search=UniqueTarget",
        headers=headers,
    )
    invalid_response = app_client.get(
        "/api/progress/leaderboard/seasons?season=yearly",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["season"] == "weekly"
    assert payload["starts_at"] == week_start.isoformat().replace("+00:00", "Z")
    entries_by_id = {entry["user_id"]: entry for entry in payload["entries"]}
    assert list(entries_by_id) == [leader_id, current_user_id, tied_id]
    assert inactive_id not in entries_by_id
    assert entries_by_id[leader_id]["rank"] == 2
    assert entries_by_id[leader_id]["season_xp"] == 900
    assert entries_by_id[current_user_id]["rank"] == 3
    assert entries_by_id[current_user_id]["season_xp"] == 800
    assert entries_by_id[current_user_id]["total_xp"] == 300
    assert entries_by_id[current_user_id]["is_current_user"] is True
    assert entries_by_id[tied_id]["rank"] == 3

    assert paged_response.status_code == 200
    paged_entries = paged_response.json()["entries"]
    assert len(paged_entries) == 1
    assert paged_entries[0]["user_id"] == current_user_id
    assert paged_entries[0]["rank"] == 3

    assert search_response.status_code == 200
    search_entries = search_response.json()["entries"]
    assert [entry["user_id"] for entry in search_entries] == [current_user_id]
    assert search_entries[0]["rank"] == 3
    assert invalid_response.status_code == 422


def test_xp_season_window_boundaries_are_utc_semesters():
    first_half = datetime(2032, 4, 10, 12, 30, tzinfo=timezone.utc)
    second_half = datetime(2032, 9, 10, 12, 30, tzinfo=timezone.utc)

    assert gamification_read_models.xp_season_window("semester", as_of=first_half) == (
        datetime(2032, 1, 1, tzinfo=timezone.utc),
        datetime(2032, 7, 1, tzinfo=timezone.utc),
    )
    assert gamification_read_models.xp_season_window("semester", as_of=second_half) == (
        datetime(2032, 7, 1, tzinfo=timezone.utc),
        datetime(2033, 1, 1, tzinfo=timezone.utc),
    )


def test_daily_quest_claim_is_single_use(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quest-claim-route@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserXP(user_id=user_id, total_xp=0, streak_days=0))
            quest = DailyQuest(user_id=user_id, quest_type="manual", title="Manual quest", target=1, progress=1, xp_reward=25)
            from datetime import datetime, timezone

            quest.date = datetime.now(timezone.utc).date()
            db.add(quest)
            await db.commit()
            return quest.id

    quest_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post(f"/api/progress/daily-quests/{quest_id}/claim", headers=headers)
    second = app_client.post(f"/api/progress/daily-quests/{quest_id}/claim", headers=headers)

    assert first.status_code == 200
    assert first.json()["xp_awarded"] == 25
    assert second.status_code == 400


def test_daily_quest_claim_rejects_when_cap_cannot_pay_full_reward(
    app_client,
    auth_token,
    run_db,
    monkeypatch,
):
    monkeypatch.setitem(XP_DAILY_CAPS, "daily_quest", 10)
    token, user_id = auth_token(email="quest-claim-capped@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserXP(user_id=user_id, total_xp=0, streak_days=0))
            quest = DailyQuest(
                user_id=user_id,
                quest_type="earn_xp",
                title="Claimable quest",
                target=1,
                progress=1,
                xp_reward=25,
                date=datetime.now(timezone.utc).date(),
            )
            db.add(quest)
            await db.commit()
            await db.refresh(quest)
            return quest.id

    quest_id = run_db(_seed())
    response = app_client.post(
        f"/api/progress/daily-quests/{quest_id}/claim",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Daily quest XP cap reached"

    async def _assert_state():
        session_factory = get_session_factory()
        async with session_factory() as db:
            quest = await db.get(DailyQuest, quest_id)
            transactions = (
                await db.execute(
                    select(XPTransaction).where(
                        XPTransaction.user_id == user_id,
                        XPTransaction.reason == "daily_quest",
                    )
                )
            ).scalars().all()
            return quest.completed, transactions

    assert run_db(_assert_state()) == (False, [])


def test_daily_quest_claim_locks_quest_before_awarding_xp():
    source = inspect.getsource(daily_quests.claim_daily_quest_reward)

    assert ".with_for_update()" in source
    assert source.index(".with_for_update()") < source.index("award_xp(")


def test_daily_quest_get_paths_skip_commit_when_quests_already_exist(
    auth_token,
    run_db,
    monkeypatch,
    test_settings,
):
    _token, user_id = auth_token(email="quest-read-no-write@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            now = datetime.now(timezone.utc)
            quest_date = now.date()
            db.add(UserXP(user_id=user_id, total_xp=0, streak_days=0, updated_at=now))
            db.add(LeaderboardRank(user_id=user_id, total_xp=0, global_rank=1, refreshed_at=now))
            db.add_all([
                DailyQuest(user_id=user_id, date=quest_date, **template)
                for template in DAILY_QUEST_TEMPLATES
            ])
            await db.commit()

    run_db(_seed())

    commit_calls = []
    original_commit = AsyncSession.commit

    async def tracked_commit(self):
        commit_calls.append(True)
        await original_commit(self)

    monkeypatch.setattr(AsyncSession, "commit", tracked_commit)

    async def _read_existing_quests():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            quests = await gamification_read_models.list_daily_quest_entries(db, user=user)
            summary = await gamification_read_models.build_sidebar_summary(db, user=user, settings=test_settings)
            return len(quests), len(summary.quests)

    expected_count = len(EXPECTED_DAILY_QUEST_TYPES)
    assert run_db(_read_existing_quests()) == (expected_count, expected_count)
    assert commit_calls == []


def test_leaderboard_read_path_does_not_refresh_projection():
    source = inspect.getsource(gamification_read_models.list_leaderboard_entries)

    assert "refresh_leaderboard_projection_if_stale" not in source
    assert "await db.commit()" not in source


def test_season_leaderboard_read_path_does_not_refresh_projection():
    source = inspect.getsource(gamification_read_models.build_season_leaderboard)

    assert "LeaderboardRank" not in source
    assert "refresh_leaderboard_projection_if_stale" not in source
    assert "await db.commit()" not in source


def test_leaderboard_projection_refresh_has_worker_entrypoints():
    internal_source = inspect.getsource(internal_router.refresh_leaderboard_endpoint)
    scheduled_source = inspect.getsource(scheduled.refresh_leaderboard_projection_once)

    assert "refresh_leaderboard_projection_if_stale" in internal_source
    assert "await db.commit()" in internal_source
    assert "refresh_leaderboard_projection_if_stale" in scheduled_source
    assert "await db.commit()" in scheduled_source
