import pytest
from pydantic import ValidationError
from typing import Annotated, get_args, get_origin

from app.routers.telemetry import ClientErrorIn
from app.schemas.admin_permissions import UserPermissionGrantIn, UserPermissionRevokeIn
from app.schemas.courses import TopicItemCompleteIn
from app.schemas.exam_bank import ExamProblemPartProgressIn, ExamProblemProgressIn
from app.schemas.exercises import ExerciseSavedIn, ExerciseSelfGradeIn
from app.schemas.founder_ops import (
    AnalyticsEventIn,
    FinanceExpenseIn,
    RedemptionCodeRedeemIn,
    RedemptionCodeTemplateIn,
    StaffPaymentProfileUpdateIn,
    StaffPaymentRequestCreateIn,
)
from app.schemas.gamification import XPAdjustmentCreateIn
from app.schemas.interactions import CanvasDocumentPutIn, CommentCreateIn, NoteCreateIn, SavedItemCreateIn
from app.schemas.payments import (
    FinanceExportCreateIn,
    ManualAccessGrantCreateIn,
    ManualPaymentProofIn,
    ManualPaymentReconciliationIn,
    ManualPaymentReviewIn,
    PaymentReconciliationImportIn,
    PaymentReconciliationImportRowIn,
    PaymentRequestCreateIn,
    RefundRequestCreateIn,
    RefundRequestReviewIn,
)
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
from app.schemas.users import FirebaseSessionIn, UserUpdateIn


LIMITED_STRING_FIELDS = {
    FirebaseSessionIn: ("credential",),
    UserUpdateIn: ("full_name", "avatar_url", "banner_url", "niveau", "filiere"),
    UserPermissionGrantIn: ("permission", "reason"),
    UserPermissionRevokeIn: ("reason",),
    ExerciseSelfGradeIn: ("self_grade",),
    ExamProblemPartProgressIn: ("self_grade",),
    AnalyticsEventIn: ("event_name", "anonymous_id", "session_id"),
    FinanceExpenseIn: ("category", "vendor", "description", "source", "status"),
    RedemptionCodeTemplateIn: ("name", "plan", "tier", "subject_scope", "status"),
    StaffPaymentProfileUpdateIn: ("display_name", "status"),
    StaffPaymentRequestCreateIn: (
        "payment_method",
        "provider_reference",
        "student_name",
        "student_phone",
        "student_email",
        "proof_url",
        "notes",
    ),
    RedemptionCodeRedeemIn: ("code",),
    XPAdjustmentCreateIn: ("reason", "idempotency_key"),
    PaymentRequestCreateIn: ("payment_method", "plan"),
    ManualPaymentReviewIn: ("reason",),
    ManualPaymentProofIn: ("proof_kind", "provider_reference", "proof_url", "payer_name", "notes"),
    ManualPaymentReconciliationIn: ("payment_method", "reference_code", "provider_reference", "reason"),
    PaymentReconciliationImportRowIn: ("reference_code", "provider_reference", "reason"),
    PaymentReconciliationImportIn: ("payment_method", "source_name"),
    FinanceExportCreateIn: ("export_kind",),
    ManualAccessGrantCreateIn: ("action", "reason"),
    RefundRequestCreateIn: ("reason",),
    RefundRequestReviewIn: ("reason",),
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
        (FirebaseSessionIn, {"credential": "x" * 8193}),
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
        (AnalyticsEventIn, {"event_name": "page_view", "properties": {"path": "x" * 4097}}),
        (
            FinanceExpenseIn,
            {
                "expense_date": "2026-01-01",
                "category": "hosting",
                "amount_centimes": 1000,
                "metadata": {"a": {"b": {"c": {"d": {"e": "too deep"}}}}},
            },
        ),
        (
            RedemptionCodeTemplateIn,
            {
                "name": "VIP",
                "subject_scope": "all",
                "amount_centimes": 9900,
                "metadata": {"items": [f"item-{index}" for index in range(101)]},
            },
        ),
        (StaffPaymentProfileUpdateIn, {"metadata": {"note": "x" * 4097}}),
        (
            PaymentReconciliationImportRowIn,
            {
                "reference_code": "REF-001",
                "amount_centimes": 9900,
                "provider_reference": "PROVIDER-001",
                "raw_row": {"cell": "x" * 4097},
            },
        ),
    ],
)
def test_finance_and_analytics_json_fields_are_bounded(model, payload):
    with pytest.raises(ValidationError):
        model(**payload)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (FirebaseSessionIn, {"credential": "credential"}),
        (UserUpdateIn, {"full_name": "Student"}),
        (UserPermissionGrantIn, {"user_id": 1, "permission": "roles:manage", "reason": "support handoff"}),
        (UserPermissionRevokeIn, {"reason": "support handoff"}),
        (ExamProblemProgressIn, {"status": "opened"}),
        (ExamProblemPartProgressIn, {"status": "opened", "self_grade": "partial"}),
        (ExerciseSelfGradeIn, {"self_grade": "partial"}),
        (ExerciseSavedIn, {"saved": True}),
        (AnalyticsEventIn, {"event_name": "page_view"}),
        (
            FinanceExpenseIn,
            {"expense_date": "2026-01-01", "category": "hosting", "amount_centimes": 1000},
        ),
        (RedemptionCodeTemplateIn, {"name": "VIP", "subject_scope": "all", "amount_centimes": 9900}),
        (StaffPaymentProfileUpdateIn, {"status": "active"}),
        (
            StaffPaymentRequestCreateIn,
            {
                "template_id": 1,
                "payment_method": "cashplus",
                "provider_reference": "CASH-001",
                "amount_centimes": 9900,
                "student_name": "Student",
                "student_phone": "0600000000",
            },
        ),
        (RedemptionCodeRedeemIn, {"code": "KRABC123"}),
        (XPAdjustmentCreateIn, {"user_id": 1, "amount": 10, "reason": "Manual correction", "idempotency_key": "adjust-1"}),
        (PaymentRequestCreateIn, {"payment_method": "cashplus", "plan": "pro"}),
        (ManualPaymentReviewIn, {"reason": "Valid receipt"}),
        (ManualPaymentProofIn, {"proof_kind": "receipt"}),
        (
            ManualPaymentReconciliationIn,
            {
                "payment_method": "cashplus",
                "reference_code": "REF-001",
                "amount_centimes": 9900,
                "provider_reference": "PROVIDER-001",
                "reason": "Matched receipt",
            },
        ),
        (
            PaymentReconciliationImportRowIn,
            {"reference_code": "REF-001", "amount_centimes": 9900, "provider_reference": "PROVIDER-001"},
        ),
        (
            PaymentReconciliationImportIn,
            {
                "payment_method": "cashplus",
                "rows": [{"reference_code": "REF-001", "amount_centimes": 9900, "provider_reference": "PROVIDER-001"}],
            },
        ),
        (FinanceExportCreateIn, {"export_kind": "ledger"}),
        (ManualAccessGrantCreateIn, {"user_id": 1, "subject_id": 1, "action": "grant", "reason": "Support grant"}),
        (RefundRequestCreateIn, {"transaction_id": 1, "amount_centimes": 9900, "reason": "Duplicate payment"}),
        (RefundRequestReviewIn, {"reason": "Approved refund"}),
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
