import inspect
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.gamification_read_models as gamification_read_models
import app.services.daily_quests as daily_quests
import app.routers.internal as internal_router
import app.scheduled as scheduled
from app.database import get_session_factory
from app.models.gamification import DailyQuest, LeaderboardRank, UserStats, UserXP, XPTransaction
from app.models.users import User


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
                DailyQuest(
                    user_id=user_id,
                    quest_type="complete_lesson",
                    title="Complete lesson",
                    target=1,
                    progress=0,
                    xp_reward=25,
                    date=quest_date,
                ),
                DailyQuest(
                    user_id=user_id,
                    quest_type="pass_quiz",
                    title="Pass quiz",
                    target=1,
                    progress=0,
                    xp_reward=50,
                    date=quest_date,
                ),
                DailyQuest(
                    user_id=user_id,
                    quest_type="earn_xp",
                    title="Earn XP",
                    target=100,
                    progress=0,
                    xp_reward=25,
                    date=quest_date,
                ),
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

    assert run_db(_read_existing_quests()) == (3, 3)
    assert commit_calls == []


def test_leaderboard_read_path_does_not_refresh_projection():
    source = inspect.getsource(gamification_read_models.list_leaderboard_entries)

    assert "refresh_leaderboard_projection_if_stale" not in source
    assert "await db.commit()" not in source


def test_leaderboard_projection_refresh_has_worker_entrypoints():
    internal_source = inspect.getsource(internal_router.refresh_leaderboard_endpoint)
    scheduled_source = inspect.getsource(scheduled.refresh_leaderboard_projection_once)

    assert "refresh_leaderboard_projection_if_stale" in internal_source
    assert "await db.commit()" in internal_source
    assert "refresh_leaderboard_projection_if_stale" in scheduled_source
    assert "await db.commit()" in scheduled_source
