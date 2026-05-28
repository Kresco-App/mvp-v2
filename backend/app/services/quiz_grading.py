from __future__ import annotations

import hashlib
import json
import math

TEXT_MATCH_QUESTION_TYPES = {
    "multiple_choice",
    "true_false",
    "fill_in_blank",
    "short_answer",
    "interactive_checkpoint",
    "exact_match",
    "error_spotting",
}
NUMERIC_QUESTION_TYPES = {"numeric_answer", "numeric_approximation", "slider_estimation"}


def question_external_id(question: dict, index: int) -> str:
    return str(question.get("id") or f"q{index + 1}")


def answer_payload(value) -> dict:
    return value if isinstance(value, dict) and "value" in value else {"value": value}


def question_answer(question: dict) -> dict:
    payload = {"answer": question.get("answer")}
    if "accepted_answers" in question:
        payload["accepted_answers"] = question.get("accepted_answers")
    if "answerRegion" in question:
        payload["answerRegion"] = question.get("answerRegion")
    return payload


def grade_quiz_question(question: dict, submitted) -> tuple[bool, object]:
    question_type = str(question.get("type") or "multiple_choice")
    expected = question.get("answer")

    if question_type in TEXT_MATCH_QUESTION_TYPES:
        accepted = question.get("accepted_answers") or [expected]
        return _normalize_answer(submitted) in {_normalize_answer(item) for item in accepted}, accepted

    if question_type in NUMERIC_QUESTION_TYPES:
        tolerance = float(question.get("tolerance", 0))
        try:
            return abs(float(submitted) - float(expected)) <= tolerance, expected
        except (TypeError, ValueError):
            return False, expected

    if question_type == "multi_select":
        return sorted(_normalize_list(submitted)) == sorted(_normalize_list(expected)), expected

    if question_type == "ordering":
        expected_order = expected or [item.get("id") for item in question.get("items", []) if isinstance(item, dict)]
        return _normalize_list(submitted) == _normalize_list(expected_order), expected_order

    if question_type == "formula_builder":
        return _normalize_list(submitted) == _normalize_list(expected), expected

    if question_type == "matching":
        expected_map = expected or {pair.get("left"): pair.get("right") for pair in question.get("pairs", [])}
        submitted_map = submitted if isinstance(submitted, dict) else {}
        normalized_expected = {_normalize_answer(k): _normalize_answer(v) for k, v in expected_map.items()}
        normalized_submitted = {_normalize_answer(k): _normalize_answer(v) for k, v in submitted_map.items()}
        return normalized_submitted == normalized_expected, expected_map

    if question_type == "image_hotspot":
        return _grade_image_hotspot(question, submitted)

    return submitted == expected, expected


def tab_quiz_submission_hash(questions: list[dict], answers: dict) -> str:
    normalized_questions = []
    for index, question in enumerate(questions):
        qid = question_external_id(question, index)
        normalized_questions.append({
            "id": qid,
            "type": str(question.get("type") or "multiple_choice"),
            "answer": question_answer(question),
            "submitted": normalized_submission_value(question, answers.get(qid)),
        })
    return hashlib.sha256(_canonical_json_payload(normalized_questions).encode("utf-8")).hexdigest()


def normalized_submission_value(question: dict, submitted) -> object:
    question_type = str(question.get("type") or "multiple_choice")

    if question_type in TEXT_MATCH_QUESTION_TYPES:
        return _normalize_answer(submitted)

    if question_type in NUMERIC_QUESTION_TYPES:
        try:
            return float(submitted)
        except (TypeError, ValueError):
            return _normalize_answer(submitted)

    if question_type == "multi_select":
        return sorted(_normalize_list(submitted))

    if question_type in {"ordering", "formula_builder"}:
        return _normalize_list(submitted)

    if question_type in {"matching", "drag_and_drop"}:
        submitted_map = submitted if isinstance(submitted, dict) else {}
        return {
            _normalize_answer(key): _normalize_answer(value)
            for key, value in sorted(submitted_map.items(), key=lambda item: _normalize_answer(item[0]))
        }

    if question_type == "image_hotspot":
        cursor = submitted if isinstance(submitted, dict) else {}
        normalized_cursor = {}
        for key in ("x", "y", "radius"):
            try:
                normalized_cursor[key] = float(cursor.get(key, 0))
            except (TypeError, ValueError):
                normalized_cursor[key] = _normalize_answer(cursor.get(key))
        return normalized_cursor

    return submitted


def _grade_image_hotspot(question: dict, submitted) -> tuple[bool, object]:
    region = question.get("answerRegion") or {}
    cursor = submitted if isinstance(submitted, dict) else {}
    try:
        radius = max(0.0, float(cursor.get("radius", 0)))
        if not math.isfinite(radius):
            return False, region
        safe_rx = float(region.get("rx", 0)) - radius
        safe_ry = float(region.get("ry", 0)) - radius
        if safe_rx <= 0 or safe_ry <= 0:
            return False, region
        dx = float(cursor.get("x", 0)) - float(region.get("x", 0))
        dy = float(cursor.get("y", 0)) - float(region.get("y", 0))
        if not all(math.isfinite(value) for value in (safe_rx, safe_ry, dx, dy)):
            return False, region
        return ((dx * dx) / (safe_rx * safe_rx)) + ((dy * dy) / (safe_ry * safe_ry)) <= 1, region
    except (TypeError, ValueError, ZeroDivisionError):
        return False, region


def _normalize_answer(value) -> str:
    return str(value if value is not None else "").strip().casefold()


def _normalize_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_normalize_answer(item) for item in value]
    if isinstance(value, str):
        return [_normalize_answer(item) for item in value.split(",") if item.strip()]
    return [_normalize_answer(value)]


def _canonical_json_payload(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
