from pathlib import Path

from sqlalchemy import select, update

from app.database import get_session_factory
from app.models.courses import Exam, ExamProblem, Resource, Subject, Topic
from app.models.users import User
from app.models.exam_bank import ExamProblemPart
from app.models.exam_progress import (
    EXAM_PROBLEM_PROGRESS_COMPLETED,
    EXAM_PROBLEM_PROGRESS_NOT_STARTED,
    EXAM_PROBLEM_PROGRESS_OPENED,
    UserExamProblemProgress,
)
from app.models.users import UserSubjectEntitlement
from app.schemas.exam_bank import ExamProblemProgressIn
from app.services.exam_bank import record_exam_problem_progress

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_exam_problem_part_model_and_migration_are_declared():
    columns = ExamProblemPart.__table__.columns
    indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in ExamProblemPart.__table__.indexes
    }
    constraints = {constraint.name for constraint in ExamProblemPart.__table__.constraints}

    assert columns["exam_problem_id"].nullable is False
    assert columns["topic_id"].nullable is True
    assert columns["video_resource_id"].nullable is True
    assert columns["statement_body"].nullable is False
    assert columns["written_solution_body"].nullable is False
    assert columns["correction_video_url"].nullable is False
    assert columns["concept_slugs"].nullable is False
    assert columns["metadata_json"].nullable is False
    assert "ck_exam_problem_parts_status" in constraints
    assert indexes["ix_exam_problem_parts_problem_order"] == ("exam_problem_id", "status", "order", "id")
    assert indexes["ix_exam_problem_parts_topic_status"] == ("topic_id", "status")

    migration_text = (BACKEND_ROOT / "alembic" / "versions" / "0056_exam_problem_parts.py").read_text(
        encoding="utf-8"
    )
    assert 'down_revision: Union[str, None] = "0055"' in migration_text
    assert "exam_problem_parts" in migration_text
    assert "correction_video_url" in migration_text


def test_exam_problem_progress_model_and_migration_are_declared():
    columns = UserExamProblemProgress.__table__.columns
    indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in UserExamProblemProgress.__table__.indexes
    }
    constraints = {constraint.name for constraint in UserExamProblemProgress.__table__.constraints}

    assert columns["user_id"].nullable is False
    assert columns["exam_problem_id"].nullable is False
    assert columns["status"].nullable is False
    assert columns["saved"].nullable is False
    assert "uq_user_exam_problem_progress_user_problem" in constraints
    assert "ck_user_exam_problem_progress_status" in constraints
    assert indexes["ix_user_exam_problem_progress_user_status"] == ("user_id", "status")
    assert indexes["ix_user_exam_problem_progress_problem"] == ("exam_problem_id",)

    migration_text = (BACKEND_ROOT / "alembic" / "versions" / "0062_exam_problem_progress.py").read_text(
        encoding="utf-8"
    )
    assert 'down_revision: Union[str, None] = "0061"' in migration_text
    assert "user_exam_problem_progress" in migration_text


def test_exam_bank_returns_part_capsules_for_entitled_subject(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-parts-entitled@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.get(
        f"/api/exam-bank?subject_id={seeded['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    detail = app_client.get(
        f"/api/exam-bank/problems/{seeded['problem_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    exam = payload["items"][0]
    assert exam["can_access"] is True
    assert exam["problems"][0]["id"] == seeded["problem_id"]
    assert [part["part_label"] for part in exam["problems"][0]["parts"]] == ["1", "2"]
    assert exam["problems"][0]["parts"][0]["statement_body"] == "Part 1 enonce"
    assert exam["problems"][0]["parts"][0]["correction_video_url"] == "https://video.example/part-1"
    assert exam["problems"][0]["parts"][0]["video_resource"]["url"] == "https://cdn.example/part-1-video"

    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["exam_title"] == "National physics"
    assert detail_payload["parts"][1]["written_solution_body"] == "Part 2 written correction"


def test_exam_bank_topic_filter_matches_part_topic(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-parts-topic-filter@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.get(
        f"/api/exam-bank?topic_id={seeded['part_topic_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    problem = payload["items"][0]["problems"][0]
    assert problem["id"] == seeded["problem_id"]
    assert [part["id"] for part in problem["parts"]] == [seeded["part_1_id"]]


def test_exam_bank_topic_filter_problem_match_returns_full_capsule(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-parts-problem-topic-filter@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True))

    response = app_client.get(
        f"/api/exam-bank?topic_id={seeded['problem_topic_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    problem = payload["items"][0]["problems"][0]
    assert problem["id"] == seeded["problem_id"]
    assert [part["id"] for part in problem["parts"]] == [seeded["part_1_id"], seeded["part_2_id"]]


def test_exam_bank_locked_preview_redacts_problem_and_part_bodies(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-parts-locked@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id))

    response = app_client.get(
        f"/api/exam-bank?subject_id={seeded['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    detail = app_client.get(
        f"/api/exam-bank/problems/{seeded['problem_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    exam = response.json()["items"][0]
    assert exam["can_access"] is False
    assert exam["locked_reason"] == "subject_access_required"
    assert exam["statement_url"] == ""
    problem = exam["problems"][0]
    assert problem["statement"] == ""
    assert problem["written_solution"] == ""
    assert problem["video_resource"]["url"] == ""
    part = problem["parts"][0]
    assert part["statement_body"] == ""
    assert part["written_solution_body"] == ""
    assert part["correction_video_url"] == ""
    assert part["metadata_json"] == {}
    assert part["video_resource"]["url"] == ""

    assert detail.status_code == 200
    assert detail.json()["parts"][0]["statement_body"] == ""


def test_exam_bank_hides_unpublished_subject_topic_and_draft_parts(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-parts-hidden@example.com")
    hidden_subject = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True, subject_published=False, slug_suffix="hidden-subject"))
    draft_topic = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True, topic_status="draft", slug_suffix="draft-topic"))
    draft_part = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True, draft_second_part=True, slug_suffix="draft-part"))

    hidden_subject_response = app_client.get(
        f"/api/exam-bank?subject_id={hidden_subject['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    draft_topic_response = app_client.get(
        f"/api/exam-bank?subject_id={draft_topic['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    draft_part_response = app_client.get(
        f"/api/exam-bank?subject_id={draft_part['subject_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert hidden_subject_response.status_code == 200
    assert hidden_subject_response.json()["items"] == []
    assert draft_topic_response.status_code == 200
    assert draft_topic_response.json()["items"] == []
    assert draft_part_response.status_code == 200
    parts = draft_part_response.json()["items"][0]["problems"][0]["parts"]
    assert [part["id"] for part in parts] == [draft_part["part_1_id"]]


def test_exam_bank_topic_filter_ignores_parts_under_draft_topic(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-parts-draft-part-topic-filter@example.com")
    seeded = run_db(
        _seed_exam_parts_fixture(
            user_id=user_id,
            include_subject_entitlement=True,
            part_topic_status="draft",
            slug_suffix="draft-part-topic-filter",
        )
    )

    response = app_client.get(
        f"/api/exam-bank?topic_id={seeded['part_topic_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_exam_problem_progress_records_opened_completed_and_saved(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-progress@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True))
    headers = {"Authorization": f"Bearer {token}"}

    opened = app_client.post(
        f"/api/exam-bank/problems/{seeded['problem_id']}/progress",
        json={"status": "opened", "saved": True},
        headers=headers,
    )
    detail = app_client.get(f"/api/exam-bank/problems/{seeded['problem_id']}", headers=headers)
    listed = app_client.get(f"/api/exam-bank?subject_id={seeded['subject_id']}", headers=headers)
    completed = app_client.post(
        f"/api/exam-bank/problems/{seeded['problem_id']}/progress",
        json={"status": "completed"},
        headers=headers,
    )
    reopened = app_client.post(
        f"/api/exam-bank/problems/{seeded['problem_id']}/progress",
        json={"status": "opened"},
        headers=headers,
    )

    assert opened.status_code == 200
    opened_payload = opened.json()
    assert opened_payload["exam_problem_id"] == seeded["problem_id"]
    assert opened_payload["status"] == "opened"
    assert opened_payload["saved"] is True
    assert opened_payload["opened_at"] is not None
    assert opened_payload["last_activity_at"] is not None

    assert detail.status_code == 200
    assert detail.json()["progress_status"] == "opened"
    assert detail.json()["saved"] is True
    assert listed.status_code == 200
    listed_problem = listed.json()["items"][0]["problems"][0]
    assert listed_problem["progress_status"] == "opened"
    assert listed_problem["saved"] is True

    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert completed.json()["completed_at"] is not None
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "completed"


def test_exam_bank_filters_by_progress_and_saved(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-progress-filters@example.com")
    untouched = run_db(
        _seed_exam_parts_fixture(
            user_id=user_id,
            include_subject_entitlement=True,
            slug_suffix="progress-filter-untouched",
        )
    )
    saved = run_db(
        _seed_exam_parts_fixture(
            user_id=user_id,
            include_subject_entitlement=True,
            slug_suffix="progress-filter-saved",
        )
    )
    completed = run_db(
        _seed_exam_parts_fixture(
            user_id=user_id,
            include_subject_entitlement=True,
            slug_suffix="progress-filter-completed",
        )
    )
    headers = {"Authorization": f"Bearer {token}"}

    saved_response = app_client.post(
        f"/api/exam-bank/problems/{saved['problem_id']}/progress",
        json={"status": EXAM_PROBLEM_PROGRESS_OPENED, "saved": True},
        headers=headers,
    )
    completed_response = app_client.post(
        f"/api/exam-bank/problems/{completed['problem_id']}/progress",
        json={"status": EXAM_PROBLEM_PROGRESS_COMPLETED},
        headers=headers,
    )
    assert saved_response.status_code == 200
    assert completed_response.status_code == 200

    completed_filter = app_client.get(
        f"/api/exam-bank?subject_id={completed['subject_id']}&progress_status=completed",
        headers=headers,
    )
    saved_filter = app_client.get(f"/api/exam-bank?subject_id={saved['subject_id']}&saved=true", headers=headers)
    not_started_filter = app_client.get(
        f"/api/exam-bank?subject_id={untouched['subject_id']}&progress_status=not_started",
        headers=headers,
    )
    opened_saved_filter = app_client.get(
        f"/api/exam-bank?subject_id={saved['subject_id']}&progress_status=opened&saved=true",
        headers=headers,
    )
    impossible_saved_filter = app_client.get(
        f"/api/exam-bank?subject_id={untouched['subject_id']}&progress_status=not_started&saved=true",
        headers=headers,
    )
    unsaved_filter = app_client.get(f"/api/exam-bank?subject_id={untouched['subject_id']}&saved=false", headers=headers)
    saved_false_filter = app_client.get(f"/api/exam-bank?subject_id={saved['subject_id']}&saved=false", headers=headers)
    invalid_filter = app_client.get("/api/exam-bank?progress_status=bogus", headers=headers)

    assert completed_filter.status_code == 200
    assert _listed_problem_ids(completed_filter.json()) == [completed["problem_id"]]

    assert saved_filter.status_code == 200
    assert _listed_problem_ids(saved_filter.json()) == [saved["problem_id"]]

    assert not_started_filter.status_code == 200
    assert _listed_problem_ids(not_started_filter.json()) == [untouched["problem_id"]]
    assert not_started_filter.json()["items"][0]["problems"][0]["progress_status"] == EXAM_PROBLEM_PROGRESS_NOT_STARTED

    assert opened_saved_filter.status_code == 200
    assert _listed_problem_ids(opened_saved_filter.json()) == [saved["problem_id"]]

    assert impossible_saved_filter.status_code == 200
    assert _listed_problem_ids(impossible_saved_filter.json()) == []

    assert unsaved_filter.status_code == 200
    assert _listed_problem_ids(unsaved_filter.json()) == [untouched["problem_id"]]

    assert saved_false_filter.status_code == 200
    assert _listed_problem_ids(saved_false_filter.json()) == []

    assert invalid_filter.status_code == 422


def test_exam_problem_progress_requires_subject_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-progress-locked@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id))

    response = app_client.post(
        f"/api/exam-bank/problems/{seeded['problem_id']}/progress",
        json={"status": "opened", "saved": True},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "subject_access_required"


def test_exam_problem_progress_completion_is_monotonic_with_stale_session(auth_token, run_db):
    _token, user_id = auth_token(email="exam-progress-race@example.com")
    seeded = run_db(_seed_exam_parts_fixture(user_id=user_id, include_subject_entitlement=True))

    assert run_db(_stale_opened_request_after_completed(user_id=user_id, problem_id=seeded["problem_id"])) == "completed"


async def _seed_exam_parts_fixture(
    *,
    user_id: int,
    include_subject_entitlement: bool = False,
    subject_published: bool = True,
    topic_status: str = "published",
    part_topic_status: str | None = None,
    draft_second_part: bool = False,
    slug_suffix: str = "",
) -> dict[str, int]:
    suffix = f"{user_id}-{slug_suffix}" if slug_suffix else str(user_id)
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Exam subject {suffix}", description="", is_published=subject_published)
        db.add(subject)
        await db.flush()
        problem_topic = Topic(
            subject_id=subject.id,
            slug=f"exam-problem-topic-{suffix}",
            title="Problem topic",
            status=topic_status,
        )
        part_topic = Topic(
            subject_id=subject.id,
            slug=f"exam-part-topic-{suffix}",
            title="Part topic",
            status=part_topic_status or topic_status,
        )
        db.add_all([problem_topic, part_topic])
        await db.flush()
        problem_video = Resource(
            topic_id=problem_topic.id,
            title="Problem video",
            resource_type="video",
            url="https://cdn.example/problem-video",
            status="published",
        )
        part_video = Resource(
            topic_id=part_topic.id,
            title="Part 1 video",
            resource_type="video",
            url="https://cdn.example/part-1-video",
            status="published",
        )
        db.add_all([problem_video, part_video])
        await db.flush()
        exam = Exam(
            subject_id=subject.id,
            title="National physics",
            year=2025,
            session="Normal",
            statement_url="/national-physics.pdf",
            status="published",
        )
        db.add(exam)
        await db.flush()
        problem = ExamProblem(
            exam_id=exam.id,
            topic_id=problem_topic.id,
            video_resource_id=problem_video.id,
            title="Mechanics capsule",
            statement="Problem statement",
            written_solution="Problem written solution",
            difficulty="bac",
            status="published",
        )
        db.add(problem)
        await db.flush()
        part_1 = ExamProblemPart(
            exam_problem_id=problem.id,
            topic_id=part_topic.id,
            video_resource_id=part_video.id,
            part_label="1",
            title="Part 1",
            statement_body="Part 1 enonce",
            written_solution_body="Part 1 written correction",
            correction_video_url="https://video.example/part-1",
            difficulty="bac",
            concept_slugs=["mechanics"],
            metadata_json={"internal_note": "hide when locked"},
            order=1,
            status="published",
        )
        part_2 = ExamProblemPart(
            exam_problem_id=problem.id,
            topic_id=problem_topic.id,
            part_label="2",
            title="Part 2",
            statement_body="Part 2 enonce",
            written_solution_body="Part 2 written correction",
            correction_video_url="https://video.example/part-2",
            difficulty="bac",
            order=2,
            status="draft" if draft_second_part else "published",
        )
        db.add_all([part_1, part_2])
        if include_subject_entitlement:
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
        await db.commit()
        return {
            "subject_id": int(subject.id),
            "problem_topic_id": int(problem_topic.id),
            "part_topic_id": int(part_topic.id),
            "exam_id": int(exam.id),
            "problem_id": int(problem.id),
            "part_1_id": int(part_1.id),
            "part_2_id": int(part_2.id),
        }


def _listed_problem_ids(payload: dict) -> list[int]:
    return [
        int(problem["id"])
        for item in payload["items"]
        for problem in item["problems"]
    ]


async def _stale_opened_request_after_completed(*, user_id: int, problem_id: int) -> str:
    session_factory = get_session_factory()
    async with session_factory() as db:
        progress = UserExamProblemProgress(
            user_id=user_id,
            exam_problem_id=problem_id,
            status=EXAM_PROBLEM_PROGRESS_OPENED,
        )
        db.add(progress)
        await db.commit()

    async with session_factory() as stale_db:
        stale_progress = await stale_db.scalar(
            select(UserExamProblemProgress).where(
                UserExamProblemProgress.user_id == user_id,
                UserExamProblemProgress.exam_problem_id == problem_id,
            )
        )
        assert stale_progress is not None
        assert stale_progress.status == EXAM_PROBLEM_PROGRESS_OPENED

        async with session_factory() as completed_db:
            await completed_db.execute(
                update(UserExamProblemProgress)
                .where(UserExamProblemProgress.id == stale_progress.id)
                .values(status=EXAM_PROBLEM_PROGRESS_COMPLETED)
            )
            await completed_db.commit()

        user = await stale_db.get(User, user_id)
        assert user is not None
        result = await record_exam_problem_progress(
            stale_db,
            user,
            problem_id=problem_id,
            body=ExamProblemProgressIn(status=EXAM_PROBLEM_PROGRESS_OPENED),
        )
        return result.status
