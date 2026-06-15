from pathlib import Path

from sqlalchemy import func, select

from app.database import get_session_factory
from app.models.courses import Subject, Topic
from app.models.exercises import (
    EXERCISE_SELF_GRADE_PARTIAL,
    EXERCISE_STATUS_DRAFT,
    Exercise,
    ExerciseAsset,
    UserExerciseProgress,
)
from app.models.gamification import UserXP, XPTransaction
from app.models.users import UserSubjectEntitlement

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_exercise_bank_models_and_migration_are_declared():
    exercise_columns = Exercise.__table__.columns
    exercise_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in Exercise.__table__.indexes
    }
    exercise_constraints = {constraint.name for constraint in Exercise.__table__.constraints}

    assert exercise_columns["subject_id"].nullable is False
    assert exercise_columns["topic_id"].nullable is True
    assert exercise_columns["solution_body"].nullable is False
    assert exercise_columns["concept_slugs"].nullable is False
    assert exercise_columns["metadata_json"].nullable is False
    assert "ck_exercises_difficulty" in exercise_constraints
    assert "ck_exercises_status" in exercise_constraints
    assert exercise_indexes["ix_exercises_subject_topic_status"] == ("subject_id", "topic_id", "status")
    assert exercise_indexes["ix_exercises_subject_difficulty"] == ("subject_id", "difficulty")

    progress_constraints = {constraint.name for constraint in UserExerciseProgress.__table__.constraints}
    progress_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in UserExerciseProgress.__table__.indexes
    }
    assert "uq_user_exercise_progress_user_exercise" in progress_constraints
    assert "ck_user_exercise_progress_self_grade" in progress_constraints
    assert progress_indexes["ix_user_exercise_progress_user_grade"] == ("user_id", "current_self_grade")

    migration_text = (BACKEND_ROOT / "alembic" / "versions" / "0055_exercise_bank_tables.py").read_text(
        encoding="utf-8"
    )
    assert 'down_revision: Union[str, None] = "0054"' in migration_text
    assert "exercises" in migration_text
    assert "exercise_assets" in migration_text
    assert "user_exercise_progress" in migration_text


def test_exercise_bank_lists_published_subject_exercises_with_progress(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-list@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    filtered = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}?difficulty=medium&self_grade=partial&saved=true",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["subject_id"] == seeded["subject_id"]
    assert payload["total"] == 2
    assert [item["id"] for item in payload["items"]] == [seeded["exercise_id"], seeded["second_exercise_id"]]
    assert payload["items"][0]["self_grade"] == "partial"
    assert payload["items"][0]["saved"] is True
    assert payload["items"][0]["asset_count"] == 1
    assert payload["items"][0]["has_solution_body"] is True
    assert payload["items"][0]["can_access"] is True

    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert filtered_payload["total"] == 1
    assert filtered_payload["items"][0]["id"] == seeded["exercise_id"]


def test_exercise_bank_saved_false_filter_includes_untouched_exercises(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-saved-false@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}?saved=false",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == seeded["second_exercise_id"]
    assert payload["items"][0]["saved"] is False


def test_exercise_detail_returns_statement_solution_and_assets_when_unlocked(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-detail-unlocked@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.get(
        f"/api/exercises/{seeded['exercise_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["can_access"] is True
    assert payload["statement_body"] == "Solve $x+1=2$."
    assert payload["solution_body"] == "$x=1$."
    assert payload["solution_video_url"] == "https://video.example/solution"
    assert payload["assets"][0]["asset_type"] == "diagram"
    assert payload["self_grade_history"] == [{"grade": "partial", "source": "seed"}]


def test_exercise_detail_redacts_for_fresh_user_without_subject_entitlement(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-detail-fresh-locked@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id))

    response = app_client.get(
        f"/api/exercises/{seeded['exercise_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["can_access"] is False
    assert payload["locked_reason"] == "subject_access_required"
    assert payload["statement_body"] == ""
    assert payload["solution_body"] == ""
    assert payload["assets"] == []
    assert payload["metadata_json"] == {}


def test_exercise_detail_redacts_body_solution_and_assets_when_locked(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-detail-locked@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_other_subject_entitlement=True))

    response = app_client.get(
        f"/api/exercises/{seeded['exercise_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["can_access"] is False
    assert payload["locked_reason"] == "subject_access_required"
    assert payload["required_subject_id"] == seeded["subject_id"]
    assert payload["statement_body"] == ""
    assert payload["solution_body"] == ""
    assert payload["solution_video_url"] == ""
    assert payload["assets"] == []


def test_exercise_bank_hides_unpublished_subject_and_topic_content(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-hidden-parent@example.com")
    hidden_subject = run_db(
        _seed_exercise_bank_fixture(
            user_id=user_id,
            include_subject_entitlement=True,
            subject_published=False,
        )
    )
    draft_topic = run_db(
        _seed_exercise_bank_fixture(
            user_id=user_id,
            include_subject_entitlement=True,
            topic_status="draft",
            slug_suffix="draft-topic",
        )
    )

    hidden_subject_list = app_client.get(
        f"/api/exercises/subjects/{hidden_subject['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    hidden_subject_detail = app_client.get(
        f"/api/exercises/{hidden_subject['exercise_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    draft_topic_list = app_client.get(
        f"/api/exercises/subjects/{draft_topic['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    draft_topic_detail = app_client.get(
        f"/api/exercises/{draft_topic['exercise_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert hidden_subject_list.status_code == 200
    assert hidden_subject_list.json()["items"] == []
    assert hidden_subject_detail.status_code == 404
    assert draft_topic_list.status_code == 200
    assert draft_topic_list.json()["items"] == []
    assert draft_topic_detail.status_code == 404


def test_exercise_reveal_records_progress_without_xp(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-reveal@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post(f"/api/exercises/{seeded['second_exercise_id']}/reveal", headers=headers)
    second = app_client.post(f"/api/exercises/{seeded['second_exercise_id']}/reveal", headers=headers)

    assert first.status_code == 200
    assert first.json()["xp_awarded"] == 0
    assert first.json()["exercise"]["reveal_count"] == 1
    assert first.json()["exercise"]["first_revealed_at"] is not None
    assert first.json()["exercise"]["last_revealed_at"] is not None
    assert first.json()["exercise"]["solution_body"] == "$x=-1$ or $x=1$."
    assert second.status_code == 200
    assert second.json()["exercise"]["reveal_count"] == 2
    assert run_db(_user_xp_total(user_id)) == 0


def test_exercise_mutations_require_subject_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-mutation-locked@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id))
    headers = {"Authorization": f"Bearer {token}"}

    reveal = app_client.post(f"/api/exercises/{seeded['exercise_id']}/reveal", headers=headers)
    grade = app_client.post(
        f"/api/exercises/{seeded['exercise_id']}/self-grade",
        json={"self_grade": "mastered"},
        headers=headers,
    )
    save = app_client.post(
        f"/api/exercises/{seeded['exercise_id']}/saved",
        json={"saved": True},
        headers=headers,
    )

    assert reveal.status_code == 403
    assert reveal.json()["detail"] == "subject_access_required"
    assert grade.status_code == 403
    assert grade.json()["detail"] == "subject_access_required"
    assert save.status_code == 403
    assert save.json()["detail"] == "subject_access_required"
    assert run_db(_user_xp_total(user_id)) == 0


def test_exercise_saved_mutation_updates_filters_without_xp(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-save@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))
    headers = {"Authorization": f"Bearer {token}"}

    save = app_client.post(
        f"/api/exercises/{seeded['second_exercise_id']}/saved",
        json={"saved": True},
        headers=headers,
    )
    saved_filter = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}?saved=true",
        headers=headers,
    )
    unsave = app_client.post(
        f"/api/exercises/{seeded['second_exercise_id']}/saved",
        json={"saved": False},
        headers=headers,
    )
    saved_filter_after_unsave = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}?saved=true",
        headers=headers,
    )
    unsaved_filter = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}?saved=false",
        headers=headers,
    )

    assert save.status_code == 200
    assert save.json()["xp_awarded"] == 0
    assert save.json()["exercise"]["id"] == seeded["second_exercise_id"]
    assert save.json()["exercise"]["saved"] is True

    assert saved_filter.status_code == 200
    assert {item["id"] for item in saved_filter.json()["items"]} == {
        seeded["exercise_id"],
        seeded["second_exercise_id"],
    }

    assert unsave.status_code == 200
    assert unsave.json()["xp_awarded"] == 0
    assert unsave.json()["exercise"]["saved"] is False

    assert saved_filter_after_unsave.status_code == 200
    assert {item["id"] for item in saved_filter_after_unsave.json()["items"]} == {seeded["exercise_id"]}

    assert unsaved_filter.status_code == 200
    assert {item["id"] for item in unsaved_filter.json()["items"]} == {seeded["second_exercise_id"]}
    assert run_db(_user_xp_total(user_id)) == 0


def test_exercise_self_grade_updates_history_and_filter(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-grade-partial@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))
    headers = {"Authorization": f"Bearer {token}"}

    reveal = app_client.post(f"/api/exercises/{seeded['second_exercise_id']}/reveal", headers=headers)
    response = app_client.post(
        f"/api/exercises/{seeded['second_exercise_id']}/self-grade",
        json={"self_grade": "partial"},
        headers=headers,
    )
    filtered = app_client.get(
        f"/api/exercises/subjects/{seeded['subject_id']}?self_grade=partial",
        headers=headers,
    )

    assert reveal.status_code == 200
    assert response.status_code == 200
    payload = response.json()
    assert payload["xp_awarded"] == 0
    assert payload["exercise"]["self_grade"] == "partial"
    assert payload["exercise"]["self_grade_history"][-1]["self_grade"] == "partial"
    assert payload["exercise"]["self_grade_history"][-1]["previous_self_grade"] == "not_started"
    assert filtered.status_code == 200
    assert {item["id"] for item in filtered.json()["items"]} == {
        seeded["exercise_id"],
        seeded["second_exercise_id"],
    }


def test_exercise_mastered_awards_one_time_xp(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-mastered-xp@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))
    headers = {"Authorization": f"Bearer {token}"}

    reveal = app_client.post(f"/api/exercises/{seeded['second_exercise_id']}/reveal", headers=headers)
    first = app_client.post(
        f"/api/exercises/{seeded['second_exercise_id']}/self-grade",
        json={"self_grade": "mastered"},
        headers=headers,
    )
    second = app_client.post(
        f"/api/exercises/{seeded['second_exercise_id']}/self-grade",
        json={"self_grade": "mastered"},
        headers=headers,
    )

    assert reveal.status_code == 200
    assert first.status_code == 200
    assert first.json()["xp_awarded"] == 5
    assert first.json()["exercise"]["self_grade"] == "mastered"
    assert second.status_code == 200
    assert second.json()["xp_awarded"] == 0
    assert second.json()["exercise"]["self_grade"] == "mastered"
    assert run_db(_user_xp_total(user_id)) == 5
    assert run_db(_exercise_mastered_xp_count(user_id, seeded["second_exercise_id"])) == 1


def test_exercise_self_grade_requires_reveal_first(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-grade-before-reveal@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.post(
        f"/api/exercises/{seeded['second_exercise_id']}/self-grade",
        json={"self_grade": "mastered"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Exercise correction must be revealed before self-grading"
    assert run_db(_user_xp_total(user_id)) == 0
    assert run_db(_exercise_mastered_xp_count(user_id, seeded["second_exercise_id"])) == 0


def test_exercise_self_grade_rejects_unknown_grade(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exercise-grade-invalid@example.com")
    seeded = run_db(_seed_exercise_bank_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.post(
        f"/api/exercises/{seeded['exercise_id']}/self-grade",
        json={"self_grade": "perfect"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
    assert "self_grade must be one of" in response.text


async def _user_xp_total(user_id: int) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        total = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == user_id))
        return int(total or 0)


async def _exercise_mastered_xp_count(user_id: int, exercise_id: int) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return int(
            await db.scalar(
                select(func.count())
                .select_from(XPTransaction)
                .where(
                    XPTransaction.user_id == user_id,
                    XPTransaction.reason == "exercise_mastered",
                    XPTransaction.idempotency_key == f"exercise-mastered:user:{user_id}:exercise:{exercise_id}",
                )
            )
            or 0
        )


async def _seed_exercise_bank_fixture(
    *,
    user_id: int,
    include_subject_entitlement: bool = False,
    include_other_subject_entitlement: bool = False,
    subject_published: bool = True,
    topic_status: str = "published",
    slug_suffix: str = "",
) -> dict[str, int]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        slug_part = f"{user_id}-{slug_suffix}" if slug_suffix else str(user_id)
        subject = Subject(title="Math", description="", thumbnail_url="", is_published=subject_published)
        other_subject = Subject(title="Physics", description="", thumbnail_url="", is_published=True)
        db.add_all([subject, other_subject])
        await db.flush()
        topic = Topic(
            subject_id=subject.id,
            slug=f"exercise-topic-{slug_part}",
            title="Equations",
            description="",
            status=topic_status,
        )
        db.add(topic)
        await db.flush()
        exercise = Exercise(
            subject_id=subject.id,
            topic_id=topic.id,
            title="Linear equation",
            slug=f"linear-equation-{slug_part}",
            summary="Basic equation",
            statement_body="Solve $x+1=2$.",
            solution_body="$x=1$.",
            solution_video_url="https://video.example/solution",
            difficulty="medium",
            concept_slugs=["linear-equations"],
            metadata_json={"origin": "test"},
            order=1,
        )
        second_exercise = Exercise(
            subject_id=subject.id,
            topic_id=topic.id,
            title="Quadratic equation",
            slug=f"quadratic-equation-{slug_part}",
            summary="Quadratic",
            statement_body="Solve $x^2=1$.",
            solution_body="$x=-1$ or $x=1$.",
            difficulty="hard",
            concept_slugs=["quadratics"],
            order=2,
        )
        draft_exercise = Exercise(
            subject_id=subject.id,
            topic_id=topic.id,
            title="Draft equation",
            slug=f"draft-equation-{slug_part}",
            statement_body="hidden",
            solution_body="hidden",
            difficulty="easy",
            status=EXERCISE_STATUS_DRAFT,
            order=3,
        )
        db.add_all([exercise, second_exercise, draft_exercise])
        await db.flush()
        db.add(
            ExerciseAsset(
                exercise_id=exercise.id,
                asset_type="diagram",
                url="https://cdn.example/diagram.png",
                alt_text="Equation diagram",
                caption="Diagram",
            )
        )
        db.add(
            UserExerciseProgress(
                user_id=user_id,
                exercise_id=exercise.id,
                current_self_grade=EXERCISE_SELF_GRADE_PARTIAL,
                saved=True,
                reveal_count=1,
                self_grade_history_json=[{"grade": "partial", "source": "seed"}],
            )
        )
        if include_subject_entitlement:
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active"))
        if include_other_subject_entitlement:
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=other_subject.id, status="active"))
        await db.commit()
        return {
            "subject_id": int(subject.id),
            "other_subject_id": int(other_subject.id),
            "topic_id": int(topic.id),
            "exercise_id": int(exercise.id),
            "second_exercise_id": int(second_exercise.id),
        }
