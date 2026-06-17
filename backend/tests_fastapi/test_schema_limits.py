import pytest
from pydantic import ValidationError
from typing import Annotated, get_args, get_origin

from app.routers.telemetry import ClientErrorIn
from app.schemas.courses import TopicItemCompleteIn
from app.schemas.interactions import CanvasDocumentPutIn, CommentCreateIn, NoteCreateIn, SavedItemCreateIn
from app.schemas.professor import (
    ChatConversationPatchIn,
    ChatMessageIn,
    LiveSessionCheckpointIn,
    LiveSessionCheckpointPatchIn,
    LiveSessionIn,
    LiveSessionInteractionIn,
    LiveSessionInteractionPatchIn,
    LiveSessionUpdateIn,
    ProfessorChangeRequestIn,
    StudentStartConversationIn,
)
from app.schemas.quizzes import QuizSubmitIn
from app.schemas.users import (
    ForgotPasswordIn,
    GoogleLoginIn,
    LoginIn,
    ResendVerificationIn,
    ResetPasswordIn,
    SignupIn,
    UserUpdateIn,
    VerifyEmailIn,
)


LIMITED_STRING_FIELDS = {
    GoogleLoginIn: ("credential",),
    UserUpdateIn: ("full_name", "avatar_url", "banner_url", "niveau", "filiere"),
    SignupIn: ("email", "password", "full_name"),
    LoginIn: ("email", "password"),
    VerifyEmailIn: ("token",),
    ResendVerificationIn: ("email",),
    ForgotPasswordIn: ("email",),
    ResetPasswordIn: ("token", "password"),
    NoteCreateIn: ("body",),
    SavedItemCreateIn: ("target_type", "label", "note"),
    CommentCreateIn: ("body",),
    LiveSessionIn: (
        "title",
        "description",
        "join_url",
        "vdocipher_live_id",
        "stream_ingest_url",
        "stream_key",
        "chat_mode",
    ),
    LiveSessionUpdateIn: (
        "title",
        "description",
        "join_url",
        "vdocipher_live_id",
        "stream_ingest_url",
        "stream_key",
        "status",
    ),
    LiveSessionInteractionIn: ("kind", "body"),
    LiveSessionInteractionPatchIn: ("status", "answer"),
    LiveSessionCheckpointIn: ("title", "prompt", "checkpoint_type"),
    LiveSessionCheckpointPatchIn: ("status",),
    ProfessorChangeRequestIn: ("target_type", "change_type"),
}


def _field_has_max_length(model, field_name: str) -> bool:
    field = model.model_fields[field_name]
    return _metadata_has_max_length(field.metadata) or _annotation_has_max_length(field.annotation)


def _metadata_has_max_length(metadata_items) -> bool:
    return any(getattr(metadata, "max_length", None) is not None for metadata in metadata_items)


def _annotation_has_max_length(annotation) -> bool:
    origin = get_origin(annotation)
    if origin is None:
        return False
    args = get_args(annotation)
    if origin is Annotated:
        return _metadata_has_max_length(args[1:])
    return any(_annotation_has_max_length(arg) for arg in args)


def test_request_schema_string_fields_have_max_length_constraints():
    missing = [
        f"{model.__name__}.{field_name}"
        for model, field_names in LIMITED_STRING_FIELDS.items()
        for field_name in field_names
        if not _field_has_max_length(model, field_name)
    ]

    assert missing == []


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (SignupIn, {"email": "a" * 255, "password": "strong-pass-123", "full_name": "Student"}),
        (SignupIn, {"email": "student@example.com", "password": "x" * 129, "full_name": "Student"}),
        (GoogleLoginIn, {"credential": "x" * 8193}),
        (NoteCreateIn, {"body": "x" * 10001}),
        (CommentCreateIn, {"topic_item_id": 1, "body": "x" * 10001}),
        (SavedItemCreateIn, {"target_type": "x" * 256, "target_id": 1}),
        (SavedItemCreateIn, {"target_type": "topic_item", "target_id": 1, "note": "x" * 501}),
        (SavedItemCreateIn, {"target_type": "topic_item", "target_id": 1, "tags": ["x" * 33]}),
        (
            CanvasDocumentPutIn,
            {
                "target_type": "topic_item",
                "target_id": 1,
                "scene_json": {"type": "excalidraw", "files": {"file-1": {"dataURL": "data:image/png;base64,abc"}}},
            },
        ),
        (
            LiveSessionIn,
            {
                "course_offering_id": 1,
                "title": "Live",
                "description": "x" * 10001,
                "starts_at": "2026-01-01T10:00:00Z",
                "ends_at": "2026-01-01T11:00:00Z",
            },
        ),
        (LiveSessionInteractionIn, {"kind": "x" * 256, "body": "Question"}),
        (LiveSessionCheckpointIn, {"title": "Checkpoint", "checkpoint_type": "x" * 256}),
        (
            ProfessorChangeRequestIn,
            {
                "course_offering_id": 1,
                "target_type": "x" * 256,
                "target_id": 1,
                "proposed_patch_json": {},
            },
        ),
    ],
)
def test_oversized_request_schema_strings_are_rejected(model, payload):
    with pytest.raises(ValidationError):
        model(**payload)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (SignupIn, {"email": "not-an-email", "password": "strong-pass-123", "full_name": "Student"}),
        (LoginIn, {"email": "a@", "password": "strong-pass-123"}),
        (ResendVerificationIn, {"email": "@example.com"}),
        (ForgotPasswordIn, {"email": "student.example.com"}),
    ],
)
def test_auth_request_email_fields_reject_invalid_email_formats(model, payload):
    with pytest.raises(ValidationError):
        model(**payload)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (SignupIn, {"email": "student@example.com", "password": "strong-pass-123", "full_name": "Student"}),
        (LoginIn, {"email": "student@example.com", "password": "strong-pass-123"}),
        (ResendVerificationIn, {"email": "student@example.com"}),
        (ForgotPasswordIn, {"email": "student@example.com"}),
    ],
)
def test_auth_request_email_fields_accept_valid_email_formats(model, payload):
    assert model(**payload).email == "student@example.com"


def test_schema_limits_accept_bounded_professor_change_request_json():
    payload = {
        "course_offering_id": 1,
        "target_type": "tab_content",
        "target_id": 1,
        "proposed_patch_json": {
            "content": {"blocks": [{"type": "paragraph", "value": "Updated note"}]},
            "config_json": {"questions": [{"id": "q1", "type": "matching", "pairs": [{"left": "T"}]}]},
        },
        "current_snapshot_json": {
            "title": "Previous note",
            "config_json": {"questions": [{"id": "q1", "type": "matching"}]},
        },
    }

    model = ProfessorChangeRequestIn(**payload)

    assert model.proposed_patch_json == payload["proposed_patch_json"]
    assert model.current_snapshot_json == payload["current_snapshot_json"]


@pytest.mark.parametrize(
    "field_name, field_value",
    [
        (
            "proposed_patch_json",
            {"a": {"b": {"c": {"d": {"e": {"f": {"g": "too deep"}}}}}}},
        ),
        (
            "proposed_patch_json",
            {"items": [f"item-{index}" for index in range(251)]},
        ),
        (
            "proposed_patch_json",
            {"title": "x" * 10001},
        ),
        (
            "current_snapshot_json",
            {"items": ["x" * 1000 for _ in range(140)]},
        ),
    ],
)
def test_schema_limits_reject_nested_or_oversized_professor_change_request_json(field_name, field_value):
    payload = {
        "course_offering_id": 1,
        "target_type": "topic",
        "target_id": 1,
        "proposed_patch_json": {},
        "current_snapshot_json": {},
    }
    payload[field_name] = field_value

    with pytest.raises(ValidationError):
        ProfessorChangeRequestIn(**payload)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (GoogleLoginIn, {"credential": "credential"}),
        (UserUpdateIn, {"full_name": "Student"}),
        (SignupIn, {"email": "student@example.com", "password": "strong-pass-123", "full_name": "Student"}),
        (LoginIn, {"email": "student@example.com", "password": "strong-pass-123"}),
        (VerifyEmailIn, {"token": "token"}),
        (ResendVerificationIn, {"email": "student@example.com"}),
        (ForgotPasswordIn, {"email": "student@example.com"}),
        (ResetPasswordIn, {"token": "token", "password": "strong-pass-123"}),
        (NoteCreateIn, {"body": "Note"}),
        (SavedItemCreateIn, {"target_type": "topic", "target_id": 1}),
        (CanvasDocumentPutIn, {"target_type": "topic_item", "target_id": 1, "scene_json": {"elements": []}}),
        (CommentCreateIn, {"topic_item_id": 1, "body": "Comment"}),
        (TopicItemCompleteIn, {"watched_seconds": 1}),
        (QuizSubmitIn, {"answers": {1: 1}}),
        (
            LiveSessionIn,
            {
                "course_offering_id": 1,
                "title": "Live",
                "starts_at": "2026-01-01T10:00:00Z",
                "ends_at": "2026-01-01T11:00:00Z",
            },
        ),
        (LiveSessionUpdateIn, {"title": "Live"}),
        (LiveSessionInteractionIn, {"kind": "question", "body": "Question"}),
        (LiveSessionInteractionPatchIn, {"status": "answered"}),
        (LiveSessionCheckpointIn, {"title": "Checkpoint"}),
        (LiveSessionCheckpointPatchIn, {"status": "closed"}),
        (
            ProfessorChangeRequestIn,
            {"course_offering_id": 1, "target_type": "topic", "target_id": 1, "proposed_patch_json": {}},
        ),
        (ChatMessageIn, {"body": "Message"}),
        (StudentStartConversationIn, {"course_offering_id": 1, "body": "Message"}),
        (ChatConversationPatchIn, {"mark_read": True}),
        (ClientErrorIn, {"message": "Client error"}),
    ],
)
def test_inbound_request_schemas_forbid_extra_fields(model, payload):
    with pytest.raises(ValidationError):
        model(**payload, attacker_controlled="ignored-before")
