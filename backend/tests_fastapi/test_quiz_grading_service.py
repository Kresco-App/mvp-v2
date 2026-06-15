from pathlib import Path

from app.services.quiz_grading import (
    answer_payload,
    grade_quiz_question,
    question_answer,
    question_external_id,
    tab_quiz_submission_hash,
)


def test_quiz_grading_logic_lives_outside_courses_router():
    router_source = (Path(__file__).resolve().parents[1] / "app" / "routers" / "courses.py").read_text(encoding="utf-8")
    progress_service_source = (Path(__file__).resolve().parents[1] / "app" / "services" / "course_progress.py").read_text(encoding="utf-8")
    tab_submission_service_source = (
        Path(__file__).resolve().parents[1] / "app" / "services" / "course_tab_quiz_submission.py"
    ).read_text(encoding="utf-8")
    attempt_submission_service_source = (
        Path(__file__).resolve().parents[1] / "app" / "services" / "quiz_attempt_submission.py"
    ).read_text(encoding="utf-8")

    forbidden_router_defs = (
        "def _normalize_answer",
        "def _normalize_list",
        "def _grade_quiz_question",
        "def _normalized_submission_value",
        "def _tab_quiz_submission_hash",
        "def _find_existing_tab_quiz_submission",
        "def _get_or_create_topic_item_progress",
        "def _ensure_question_set_for_tab",
        "def _bounded_topic_watch_seconds",
    )
    for symbol in forbidden_router_defs:
        assert symbol not in router_source

    assert "insert(QuestionAttempt)" not in router_source
    assert "award_xp_bulk" not in router_source
    assert "find_existing_tab_quiz_submission" not in router_source
    assert "from app.services.quiz_grading import" not in router_source
    assert "from app.services.course_tab_quiz_submission import submit_tab_quiz_attempt" in router_source
    assert "return await submit_tab_quiz_attempt(db, user=user, tab_id=tab_id, body=body)" in router_source
    assert "from app.services.course_progress import" in tab_submission_service_source
    assert "from app.services.quiz_grading import" in tab_submission_service_source
    assert "from app.services.quiz_attempt_submission import" in tab_submission_service_source
    assert "grade_quiz_question(question, submitted)" in tab_submission_service_source
    assert "tab_quiz_submission_hash(raw_questions" in attempt_submission_service_source
    assert "insert(QuestionAttempt)" in attempt_submission_service_source
    assert "award_xp_bulk" in attempt_submission_service_source
    assert "async def find_existing_tab_quiz_submission" in tab_submission_service_source
    assert "async def persist_quiz_submission" in attempt_submission_service_source
    assert "async def get_or_create_topic_item_progress" in progress_service_source
    assert "async def ensure_question_set_for_tab" in progress_service_source


def test_quiz_grading_service_preserves_answer_contracts():
    assert question_external_id({}, 2) == "q3"
    assert answer_payload("A") == {"value": "A"}
    assert answer_payload({"value": "A", "label": "Option A"}) == {"value": "A", "label": "Option A"}
    assert question_answer({
        "answer": "A",
        "accepted_answers": ["A", "a"],
        "answerRegion": {"x": 10},
    }) == {
        "answer": "A",
        "accepted_answers": ["A", "a"],
        "answerRegion": {"x": 10},
    }


def test_quiz_grading_service_rejects_negative_hotspot_radius_expansion():
    question = {
        "type": "image_hotspot",
        "answerRegion": {"x": 50, "y": 50, "rx": 10, "ry": 10},
    }

    assert grade_quiz_question(question, {"x": 10_000, "y": 10_000, "radius": -10_000}) == (
        False,
        question["answerRegion"],
    )
    assert grade_quiz_question(question, {"x": 50, "y": 50, "radius": 1}) == (
        True,
        question["answerRegion"],
    )


def test_drag_and_drop_grading_uses_normalized_mapping_contract():
    question = {
        "id": "drag",
        "type": "drag_and_drop",
        "answer": {
            "Category A": "Answer 1",
            "Category B": "Answer 2",
        },
    }

    assert grade_quiz_question(question, {
        "Category B": " answer 2 ",
        " category a ": "ANSWER 1",
    }) == (True, question["answer"])


def test_tab_quiz_submission_hash_keeps_idempotency_normalization_with_grading():
    questions = [
        {"id": "short", "type": "short_answer", "answer": "unit", "accepted_answers": ["unit"]},
        {"id": "multi", "type": "multi_select", "answer": ["a", "b"]},
        {"id": "match", "type": "matching", "answer": {"left": "right", "up": "down"}},
    ]
    canonical = tab_quiz_submission_hash(questions, {
        "short": " Unit ",
        "multi": ["b", "a"],
        "match": {"up": "Down", "left": " Right "},
    })
    equivalent = tab_quiz_submission_hash(questions, {
        "short": "unit",
        "multi": ["a", "b"],
        "match": {"left": "right", "up": "down"},
        "ignored": "extra",
    })

    assert equivalent == canonical
