from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.models.quizzes import QuestionSet


QUIZ_SNAPSHOT_SCHEMA_VERSION = 1


def build_question_set_snapshot(question_set: QuestionSet, raw_questions: list[dict]) -> dict:
    return {
        "schema_version": QUIZ_SNAPSHOT_SCHEMA_VERSION,
        "question_set": {
            "id": question_set.id,
            "title": question_set.title,
            "source_type": question_set.source_type,
            "pass_score": question_set.pass_score,
            "subject_id": question_set.subject_id,
            "topic_id": question_set.topic_id,
            "topic_section_id": question_set.topic_section_id,
            "topic_item_id": question_set.topic_item_id,
            "tab_content_id": question_set.tab_content_id,
            "status": question_set.status,
            "order": question_set.order,
            "concept_slugs": list(question_set.concept_slugs or []),
        },
        "questions": [_json_safe(question) for question in raw_questions],
    }


def question_snapshot_hash(snapshot: dict) -> str:
    payload = json.dumps(
        _json_safe(snapshot),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def quiz_attempt_submission_hash(*, answer_hash: str, snapshot_hash: str) -> str:
    payload = json.dumps(
        {
            "answer_hash": answer_hash,
            "schema_version": QUIZ_SNAPSHOT_SCHEMA_VERSION,
            "snapshot_hash": snapshot_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value
