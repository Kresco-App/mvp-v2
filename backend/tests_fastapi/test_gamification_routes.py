import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import CheckConstraint, UniqueConstraint, select

from app.database import get_session_factory
from app.models.courses import Chapter, ChapterBlock, ChapterSection, Lesson, Subject
from app.models.gamification import (
    ContentProgress,
    DailyQuest,
    LeaderboardRank,
    LessonProgress,
    QuizResult,
    TopicItemProgress,
    UserStats,
    UserXP,
)
from app.models.quizzes import Quiz
from app.models.users import User
from app.services import gamification_progress, gamification_read_models


BACKEND_ROOT = Path(__file__).resolve().parents[1]
GAMIFICATION_ROUTER = BACKEND_ROOT / "app" / "routers" / "gamification.py"
GAMIFICATION_READ_MODELS = BACKEND_ROOT / "app" / "services" / "gamification_read_models.py"
GAMIFICATION_PROGRESS_SERVICE = BACKEND_ROOT / "app" / "services" / "gamification_progress.py"
GAMIFICATION_QUIZ_RESULTS_SERVICE = BACKEND_ROOT / "app" / "services" / "gamification_quiz_results.py"


def _unique_constraint_names(model) -> set[str]:
    return {
        constraint.name
        for constraint in model.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_gamification_state_tables_have_database_uniqueness_guards():
    assert "uq_lesson_progress_user_lesson" in _unique_constraint_names(LessonProgress)
    assert "uq_content_progress_user_item" in _unique_constraint_names(ContentProgress)
    assert "uq_quiz_results_user_quiz" in _unique_constraint_names(QuizResult)
    assert "uq_daily_quests_user_type_date" in _unique_constraint_names(DailyQuest)
    assert "uq_topic_item_progress_user_item" in _unique_constraint_names(TopicItemProgress)


def test_user_stats_projection_model_and_migration_are_declared():
    constraint_names = {
        constraint.name
        for constraint in UserStats.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert UserStats.__table__.primary_key.columns.keys() == ["user_id"]
    assert "ck_user_stats_total_watch_seconds_nonnegative" in constraint_names
    assert "ck_user_stats_lessons_completed_nonnegative" in constraint_names
    assert "ck_user_stats_quizzes_passed_nonnegative" in constraint_names

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0040_user_stats_projection.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0039_hot_filter_indexes"' in migration_text
    assert "op.create_table(" in migration_text
    assert "INSERT INTO user_stats" in migration_text
    assert "SUM(watched_seconds)" in migration_text
    assert "COUNT(*) AS lessons_completed" in migration_text
    assert "COUNT(*) AS quizzes_passed" in migration_text


def test_gamification_read_models_stay_out_of_router():
    router_source = GAMIFICATION_ROUTER.read_text(encoding="utf-8")
    service_source = GAMIFICATION_READ_MODELS.read_text(encoding="utf-8")
    progress_service_source = GAMIFICATION_PROGRESS_SERVICE.read_text(encoding="utf-8")
    quiz_results_service_source = GAMIFICATION_QUIZ_RESULTS_SERVICE.read_text(encoding="utf-8")
    router_tree = ast.parse(router_source)

    router_function_names = {
        node.name for node in router_tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    assert "grade_section_quiz" not in router_function_names
    assert "_get_or_create_lesson_progress" not in router_function_names
    assert "_insert_content_progress_once" not in router_function_names
    assert "_bounded_watch_progress" not in router_function_names
    assert "_refresh_leaderboard_projection_if_stale" not in router_function_names
    assert "_sidebar_live_events" not in router_function_names
    assert "build_subject_plan" in router_source
    assert "list_leaderboard_entries" in router_source
    assert "build_sidebar_summary" in router_source
    assert "build_user_stats" in router_source
    assert "build_lesson_access_status" in router_source
    assert "build_section_access_status" in router_source
    assert "build_xp_summary" in router_source
    assert "list_xp_transactions" in router_source
    assert "list_lesson_quiz_triggers" in router_source
    assert "list_daily_quest_entries" in router_source
    assert "claim_daily_quest_reward" in router_source
    assert "record_legacy_quiz_result" in router_source
    assert "async def build_subject_plan" in service_source
    assert "async def list_leaderboard_entries" in service_source
    assert "async def build_sidebar_summary" in service_source
    assert "async def build_lesson_access_status" in service_source
    assert "async def build_section_access_status" in service_source
    assert "async def build_xp_summary" in service_source
    assert "read_user_stats(" in service_source
    assert "select(func.sum" not in service_source
    assert "QuizResult.user_id == user.id" not in service_source
    assert "async def list_xp_transactions" in service_source
    assert "async def list_lesson_quiz_triggers" in service_source
    assert "async def list_daily_quest_entries" in service_source
    assert "async def claim_daily_quest_reward" in service_source
    assert "async def update_lesson_progress" in progress_service_source
    assert "async def mark_content_complete" in progress_service_source
    assert "async def complete_chapter_section" in progress_service_source
    assert "async def record_legacy_quiz_result" in quiz_results_service_source
    assert "select(ContentProgress.id)" not in router_source
    assert "select(LessonProgress)" not in router_source
    assert "select(Quiz)" not in router_source
    assert "select(QuizResult)" not in router_source
    assert "select(UserXP)" not in router_source
    assert "select(XPTransaction)" not in router_source
    assert "select(VideoQuizTrigger)" not in router_source
    assert "select(DailyQuest)" not in router_source
    assert "update(DailyQuest)" not in router_source
    assert "generate_daily_quests(" not in router_source
    assert "calculate_level(" not in router_source
    assert "score_quiz_answers(" not in router_source
    assert "IntegrityError" not in router_source
    assert "with_for_update()" not in router_source
    assert "quiz_pass:user" not in router_source
    assert "daily_quest_claim:user" not in router_source
    assert "Quest not yet completed" in service_source
    assert "Quest has expired" in service_source
    assert "claim_result.rowcount != 1" in service_source
    assert "Quiz not found" in quiz_results_service_source
    assert "Quiz lesson not found" in quiz_results_service_source
    assert "score_quiz_answers(" in quiz_results_service_source
    assert "with_for_update()" in quiz_results_service_source
    assert "except IntegrityError" in quiz_results_service_source
    assert 'idempotency_key=f"quiz_pass:user:{user.id}:quiz:{quiz_id}"' in quiz_results_service_source


def test_stats_endpoint_reads_projection_without_live_aggregates(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="stats-projection@example.com")

    async def _seed_projection():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(
                UserStats(
                    user_id=user_id,
                    total_watch_seconds=185,
                    lessons_completed=3,
                    quizzes_passed=2,
                )
            )
            await db.commit()

    run_db(_seed_projection())

    with query_counter() as queries:
        response = app_client.get("/api/progress/stats", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "total_watch_minutes": 3,
        "quizzes_passed": 2,
        "lessons_completed": 3,
        "is_pro": False,
    }
    selected_sql = " ".join(statement.lower() for statement in queries.statements)
    assert "user_stats" in selected_sql
    assert "lesson_progress" not in selected_sql
    assert "quiz_results" not in selected_sql


def test_gamification_time_helpers_normalize_naive_datetimes_as_utc():
    naive_last_updated = datetime(2026, 5, 28, 8, 0, 0)
    now = datetime(2026, 5, 28, 8, 1, 0, tzinfo=timezone.utc)

    assert gamification_progress.coerce_utc(naive_last_updated) == naive_last_updated.replace(tzinfo=timezone.utc)
    assert gamification_progress.bounded_watch_progress(
        requested_seconds=120,
        current_seconds=45,
        duration_seconds=300,
        last_updated_at=naive_last_updated,
        is_new_progress=False,
        now=now,
    ) == 120

    starts_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    assert "Today" in gamification_read_models._format_sidebar_start(starts_at)


def test_subject_plan_with_no_lessons_skips_empty_progress_query(app_client, auth_token, query_counter, run_db):
    token, _ = auth_token(email="subject-plan-empty@example.com")

    async def _seed_subject():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Empty Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.commit()
            await db.refresh(subject)
            return subject.id

    subject_id = run_db(_seed_subject())

    with query_counter() as queries:
        response = app_client.get(
            f"/api/progress/subject-plan/{subject_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "completed_lesson_ids": [],
        "completed_block_ids": [],
        "completed_quiz_ids": [],
        "completed_section_ids": [],
        "total_section_count": 0,
        "total_lesson_count": 0,
    }
    assert not any("lesson_progress" in statement.lower() for statement in queries.statements)


def test_subject_plan_uses_targeted_queries_without_loading_content_graph(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="subject-plan-targeted@example.com")

    async def _seed_subject_plan():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Targeted Subject", description="x" * 5000, is_published=True, order=1)
            db.add(subject)
            await db.flush()
            chapter = Chapter(subject_id=subject.id, title="Targeted Chapter", description="x" * 5000, order=1)
            db.add(chapter)
            await db.flush()
            lesson = Lesson(chapter_id=chapter.id, title="Targeted Lesson", vdocipher_id="lesson-video", order=1)
            block = ChapterBlock(chapter_id=chapter.id, title="Targeted Block", content="x" * 5000, order=1)
            section = ChapterSection(
                chapter_id=chapter.id,
                title="Targeted Section",
                section_type="video",
                content="x" * 5000,
                order=1,
            )
            db.add_all([lesson, block, section])
            await db.flush()
            quiz = Quiz(lesson_id=lesson.id, title="Targeted Quiz", pass_score=70)
            db.add(quiz)
            await db.flush()
            db.add_all([
                LessonProgress(user_id=user_id, lesson_id=lesson.id, status="completed", watched_seconds=60),
                ContentProgress(user_id=user_id, item_type="block", item_id=block.id),
                ContentProgress(user_id=user_id, item_type="quiz", item_id=quiz.id),
                ContentProgress(user_id=user_id, item_type="section", item_id=section.id),
            ])
            await db.commit()
            return subject.id, lesson.id, block.id, quiz.id, section.id

    subject_id, lesson_id, block_id, quiz_id, section_id = run_db(_seed_subject_plan())

    with query_counter() as queries:
        response = app_client.get(
            f"/api/progress/subject-plan/{subject_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "completed_lesson_ids": [lesson_id],
        "completed_block_ids": [block_id],
        "completed_quiz_ids": [quiz_id],
        "completed_section_ids": [section_id],
        "total_section_count": 1,
        "total_lesson_count": 1,
    }
    selected_sql = " ".join(statement.lower() for statement in queries.statements)
    assert "chapter_blocks.content" not in selected_sql
    assert "chapter_sections.content" not in selected_sql
    assert "subjects.description" not in selected_sql
    assert "lessons.title" not in selected_sql


def test_leaderboard_search_keeps_global_rank(app_client, auth_token, query_counter, run_db):
    token, current_user_id = auth_token(email="leaderboard-current@example.com")

    async def _seed_leaderboard():
        session_factory = get_session_factory()
        async with session_factory() as db:
            current_user = await db.get(User, current_user_id)
            current_user.full_name = "Current Student"
            db.add(UserXP(user_id=current_user_id, total_xp=10, streak_days=0))

            users = [
                User(email="leaderboard-alice@example.com", full_name="Alice Top", is_active=True, is_email_verified=True, password="!"),
                User(email="leaderboard-charlie@example.com", full_name="Charlie Middle", is_active=True, is_email_verified=True, password="!"),
                User(email="leaderboard-bob@example.com", full_name="Bob Search", is_active=True, is_email_verified=True, password="!"),
            ]
            db.add_all(users)
            await db.flush()
            db.add_all(
                [
                    UserXP(user_id=users[0].id, total_xp=300, streak_days=0),
                    UserXP(user_id=users[1].id, total_xp=200, streak_days=0),
                    UserXP(user_id=users[2].id, total_xp=100, streak_days=0),
                ]
            )
            await db.commit()
            return users[2].id

    bob_user_id = run_db(_seed_leaderboard())

    response = app_client.get(
        "/api/progress/leaderboard?search=bob",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [entry["full_name"] for entry in body] == ["Bob Search"]
    assert body[0]["total_xp"] == 100

    async def _projection_snapshot():
        session_factory = get_session_factory()
        async with session_factory() as db:
            rows = (
                await db.execute(
                    select(LeaderboardRank)
                    .order_by(LeaderboardRank.global_rank, LeaderboardRank.user_id)
                )
            ).scalars().all()
            return [(row.user_id, row.total_xp, row.global_rank) for row in rows]

    projection = run_db(_projection_snapshot())
    bob_projection = next(row for row in projection if row[0] == bob_user_id)
    assert body[0]["rank"] == bob_projection[2]

    with query_counter() as queries:
        projected_response = app_client.get(
            "/api/progress/leaderboard?search=bob",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert projected_response.status_code == 200
    assert projected_response.json()[0]["rank"] == 3
    assert any("leaderboard_ranks" in statement.lower() for statement in queries.statements)
    assert not any("rank()" in statement.lower() or " over " in statement.lower() for statement in queries.statements)
