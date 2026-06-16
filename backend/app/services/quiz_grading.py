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
        return _normalize_typed_value(question, submitted) in {
            _normalize_typed_value(question, item)
            for item in accepted
        }, accepted

    if question_type in NUMERIC_QUESTION_TYPES:
        tolerance = float(question.get("tolerance", 0))
        submitted_value = _normalize_typed_value(question, submitted)
        expected_value = _normalize_typed_value(question, expected)
        if not isinstance(submitted_value, float) or not isinstance(expected_value, float):
            return False, expected
        return abs(submitted_value - expected_value) <= tolerance, expected

    if question_type == "multi_select":
        return _normalize_typed_value(question, submitted) == _normalize_typed_value(question, expected), expected

    if question_type == "ordering":
        expected_order = expected or [item.get("id") for item in question.get("items", []) if isinstance(item, dict)]
        return _normalize_typed_value(question, submitted) == _normalize_typed_value(question, expected_order), expected_order

    if question_type == "formula_builder":
        return _normalize_typed_value(question, submitted) == _normalize_typed_value(question, expected), expected

    if question_type in {"matching", "drag_and_drop"}:
        expected_map = expected or {pair.get("left"): pair.get("right") for pair in question.get("pairs", [])}
        return _normalize_typed_value(question, submitted) == _normalize_typed_value(question, expected_map), expected_map

    if question_type == "image_hotspot":
        return _grade_image_hotspot(question, submitted)

    return submitted == expected, expected


def quiz_submission_answer_hash(questions: list[dict], answers: dict) -> str:
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
    return _normalize_typed_value(question, submitted)


def _normalize_typed_value(question: dict, value) -> object:
    question_type = str(question.get("type") or "multiple_choice")

    if question_type in TEXT_MATCH_QUESTION_TYPES:
        return _normalize_answer(value)

    if question_type in NUMERIC_QUESTION_TYPES:
        try:
            return float(value)
        except (TypeError, ValueError):
            return _normalize_answer(value)

    if question_type == "multi_select":
        return sorted(_normalize_list(value))

    if question_type in {"ordering", "formula_builder"}:
        return _normalize_list(value)

    if question_type in {"matching", "drag_and_drop"}:
        return _normalize_mapping(value)

    if question_type == "image_hotspot":
        return _normalize_hotspot_cursor(value)

    return value


def _normalize_mapping(value) -> dict[str, str]:
    submitted_map = value if isinstance(value, dict) else {}
    return {
        _normalize_answer(key): _normalize_answer(item)
        for key, item in sorted(submitted_map.items(), key=lambda pair: _normalize_answer(pair[0]))
    }


def _normalize_hotspot_cursor(value) -> dict[str, float | str]:
    cursor = value if isinstance(value, dict) else {}
    normalized_cursor = {}
    for key in ("x", "y", "radius"):
        try:
            normalized_cursor[key] = float(cursor.get(key, 0))
        except (TypeError, ValueError):
            normalized_cursor[key] = _normalize_answer(cursor.get(key))
    return normalized_cursor


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
