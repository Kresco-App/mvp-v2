from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True, slots=True)
class JsonBounds:
    max_container_depth: int
    max_dict_items: int
    max_list_items: int
    max_string_length: int
    max_total_bytes: int
    max_key_length: int = 255


JsonScalar = str | int | float | bool | None


def validate_bounded_json_object(value: Any, *, bounds: JsonBounds) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Value must be a JSON object")
    _validate_json_node(value, bounds=bounds, container_depth=0)
    _validate_json_size(value, max_total_bytes=bounds.max_total_bytes)
    return value


def validate_quiz_answers_payload(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Answers must be a JSON object")
    if len(value) > 200:
        raise ValueError("Answers payload has too many entries")
    for answer_key, answer_value in value.items():
        if not isinstance(answer_key, str):
            raise ValueError("Answers keys must be strings")
        if len(answer_key) > 255:
            raise ValueError("Answers keys must be 255 characters or fewer")
        _validate_quiz_answer_value(answer_value)
    _validate_json_size(value, max_total_bytes=64 * 1024)
    return value


def _validate_quiz_answer_value(value: Any) -> None:
    if _is_json_scalar(value):
        _validate_json_scalar(value, max_string_length=2000)
        return
    if isinstance(value, list):
        if len(value) > 100:
            raise ValueError("Answer list has too many items")
        for item in value:
            if not _is_json_scalar(item):
                raise ValueError("Answer lists may only contain scalar JSON values")
            _validate_json_scalar(item, max_string_length=2000)
        return
    if isinstance(value, dict):
        if len(value) > 100:
            raise ValueError("Answer object has too many entries")
        for answer_key, answer_value in value.items():
            if not isinstance(answer_key, str):
                raise ValueError("Answer object keys must be strings")
            if len(answer_key) > 255:
                raise ValueError("Answer object keys must be 255 characters or fewer")
            if not _is_json_scalar(answer_value):
                raise ValueError("Answer objects may only contain scalar JSON values")
            _validate_json_scalar(answer_value, max_string_length=2000)
        return
    raise ValueError("Answers must be scalar values, lists of scalars, or shallow objects")


def _validate_json_node(value: Any, *, bounds: JsonBounds, container_depth: int) -> None:
    if _is_json_scalar(value):
        _validate_json_scalar(value, max_string_length=bounds.max_string_length)
        return
    if container_depth >= bounds.max_container_depth:
        raise ValueError("JSON payload is nested too deeply")
    if isinstance(value, list):
        if len(value) > bounds.max_list_items:
            raise ValueError("JSON array has too many items")
        for item in value:
            _validate_json_node(item, bounds=bounds, container_depth=container_depth + 1)
        return
    if isinstance(value, dict):
        if len(value) > bounds.max_dict_items:
            raise ValueError("JSON object has too many entries")
        for item_key, item_value in value.items():
            if not isinstance(item_key, str):
                raise ValueError("JSON object keys must be strings")
            if len(item_key) > bounds.max_key_length:
                raise ValueError(f"JSON object keys must be {bounds.max_key_length} characters or fewer")
            _validate_json_node(item_value, bounds=bounds, container_depth=container_depth + 1)
        return
    raise ValueError("Value must contain only JSON scalar, array, or object types")


def _validate_json_scalar(value: JsonScalar, *, max_string_length: int) -> None:
    if isinstance(value, str):
        if len(value) > max_string_length:
            raise ValueError(f"JSON strings must be {max_string_length} characters or fewer")
        return
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("JSON numbers must be finite")


def _validate_json_size(value: Any, *, max_total_bytes: int) -> None:
    try:
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Value must be JSON serializable") from exc
    if len(payload.encode("utf-8")) > max_total_bytes:
        raise ValueError(f"JSON payload must be {max_total_bytes} bytes or fewer")


def _is_json_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


TinyText = Annotated[str, StringConstraints(max_length=60)]
ShortText = Annotated[str, StringConstraints(max_length=255)]
MediumText = Annotated[str, StringConstraints(max_length=1000)]
LongText = Annotated[str, StringConstraints(max_length=10000)]
RichText = Annotated[str, StringConstraints(max_length=50000)]
EmailText = Annotated[EmailStr, StringConstraints(max_length=254)]
PasswordText = Annotated[str, StringConstraints(max_length=128)]
TokenText = Annotated[str, StringConstraints(max_length=8192)]
UrlText = Annotated[str, StringConstraints(max_length=2048)]
ProfileMediaReferenceText = Annotated[str, StringConstraints(max_length=500)]
