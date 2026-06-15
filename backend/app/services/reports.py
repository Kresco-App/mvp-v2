from datetime import datetime, timezone
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.admin_audit import AdminAuditLog
from app.models.courses import TopicItem
from app.models.interactions import Comment
from app.models.reports import ContentReport, REPORT_PRIORITIES, REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES
from app.models.users import User
from app.schemas.reports import CommentModerationActionIn, CommentModerationActionOut, ReportCreateIn, ReportListOut, ReportOut, ReportUpdateIn
from app.services.interaction_mutations import require_comments_enabled_for_topic_item, require_exercise_comments_access

REPORT_CREATE_TARGET_TYPES = {"comment", "exercise"}


async def create_content_report(
    db: AsyncSession,
    *,
    reporter: User,
    body: ReportCreateIn,
) -> ReportOut:
    reporter_id = int(reporter.id)
    target_type = _normalize_choice(body.target_type, allowed=REPORT_TARGET_TYPES, field_name="target type")
    if target_type not in REPORT_CREATE_TARGET_TYPES:
        raise HTTPException(status_code=400, detail="Report target type is not enabled for public intake yet")
    reason = _normalize_choice(body.reason, allowed=REPORT_REASONS, field_name="reason")
    target_id = str(_parse_numeric_target_id(body.target_id.strip()))
    context = await _validated_report_target_context(db, reporter, target_type=target_type, target_id=target_id)
    idempotency_key = _build_idempotency_key(
        reporter_id=reporter_id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        client_key=body.idempotency_key,
    )

    existing = await _load_report_by_idempotency_key(
        db,
        reporter_user_id=reporter_id,
        idempotency_key=idempotency_key,
    )
    if existing is not None:
        _validate_existing_report(existing, target_type=target_type, target_id=target_id, reason=reason)
        return report_out(existing)

    report = ContentReport(
        reporter_user_id=reporter_id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        title=body.title.strip(),
        description=body.description.strip(),
        subject_id=context.get("subject_id"),
        topic_id=context.get("topic_id"),
        topic_item_id=context.get("topic_item_id"),
        metadata_json=body.metadata_json,
        idempotency_key=idempotency_key,
    )
    db.add(report)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await _load_report_by_idempotency_key(
            db,
            reporter_user_id=reporter_id,
            idempotency_key=idempotency_key,
        )
        if existing is None:
            raise
        _validate_existing_report(existing, target_type=target_type, target_id=target_id, reason=reason)
        return report_out(existing)
    await db.refresh(report)
    return report_out(report)


async def list_admin_content_reports(
    db: AsyncSession,
    *,
    status: str | None = None,
    target_type: str | None = None,
    reason: str | None = None,
    assigned_to_user_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ReportListOut:
    filters = []
    if status:
        filters.append(ContentReport.status == _normalize_choice(status, allowed=REPORT_STATUSES, field_name="status"))
    if target_type:
        filters.append(
            ContentReport.target_type == _normalize_choice(target_type, allowed=REPORT_TARGET_TYPES, field_name="target type")
        )
    if reason:
        filters.append(ContentReport.reason == _normalize_choice(reason, allowed=REPORT_REASONS, field_name="reason"))
    if assigned_to_user_id is not None:
        filters.append(ContentReport.assigned_to_user_id == int(assigned_to_user_id))

    bounded_limit = max(1, min(int(limit), 200))
    bounded_offset = max(0, int(offset))
    count_statement = select(func.count()).select_from(ContentReport)
    statement = select(ContentReport).order_by(ContentReport.created_at.desc(), ContentReport.id.desc())
    if filters:
        count_statement = count_statement.where(*filters)
        statement = statement.where(*filters)

    total = int(await db.scalar(count_statement) or 0)
    result = await db.execute(statement.limit(bounded_limit).offset(bounded_offset))
    items = [report_out(report) for report in result.scalars().all()]
    return ReportListOut(items=items, total=total, limit=bounded_limit, offset=bounded_offset)


async def update_admin_content_report(
    db: AsyncSession,
    *,
    actor: User,
    report_id: int,
    body: ReportUpdateIn,
    request_path: str = "",
    client_host: str = "",
) -> ReportOut:
    actor_id = int(actor.id)
    report = await db.get(ContentReport, int(report_id))
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    changed_data: dict[str, object] = {
        "actor_user_id": actor_id,
        "previous_status": report.status,
        "previous_priority": report.priority,
        "previous_assigned_to_user_id": report.assigned_to_user_id,
    }
    if body.status is not None:
        report.status = _normalize_choice(body.status, allowed=REPORT_STATUSES, field_name="status")
        if report.status in {"resolved", "dismissed"}:
            report.reviewed_by_user_id = actor_id
            report.resolved_at = datetime.now(timezone.utc)
        else:
            report.reviewed_by_user_id = None
            report.resolved_at = None
            report.resolution_action = ""
            report.resolution_note = ""
    if body.priority is not None:
        report.priority = _normalize_choice(body.priority, allowed=REPORT_PRIORITIES, field_name="priority")
    if "assigned_to_user_id" in body.model_fields_set:
        report.assigned_to_user_id = await _validated_staff_assignee_id(db, body.assigned_to_user_id)
    if body.resolution_note is not None:
        report.resolution_note = body.resolution_note.strip()

    changed_data.update(
        {
            "status": report.status,
            "priority": report.priority,
            "assigned_to_user_id": report.assigned_to_user_id,
            "reviewed_by_user_id": report.reviewed_by_user_id,
            "resolution_action": report.resolution_action,
            "resolution_note": report.resolution_note,
        }
    )
    await db.flush()
    db.add(
        AdminAuditLog(
            action="report_update",
            model_name="ContentReport",
            object_pk=str(report.id),
            object_repr=f"{report.target_type}:{report.target_id}:{report.reason}"[:500],
            changed_data=changed_data,
            request_path=request_path,
            client_host=client_host,
            note=f"admin_user_id={actor_id}",
        )
    )
    await db.commit()
    await db.refresh(report)
    return report_out(report)


async def apply_reported_comment_moderation_action(
    db: AsyncSession,
    *,
    actor: User,
    report_id: int,
    body: CommentModerationActionIn,
    request_path: str = "",
    client_host: str = "",
) -> CommentModerationActionOut:
    actor_id = int(actor.id)
    report = await db.get(ContentReport, int(report_id))
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.target_type != "comment":
        raise HTTPException(status_code=400, detail="Report target is not a comment")
    if report.status not in {"open", "in_review"}:
        raise HTTPException(status_code=409, detail="Report is already closed")

    comment_id = _parse_numeric_target_id(report.target_id)
    comment = await db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    action = body.action.strip().lower()
    note = body.note.strip()
    previous_comment_status = comment.status
    next_status = {
        "hide": "hidden",
        "delete": "deleted",
        "restore": "visible",
        "no_action": comment.status,
    }[action]
    if action != "no_action":
        comment.status = next_status
        comment.moderated_by_user_id = actor_id
        comment.moderated_at = datetime.now(timezone.utc)
        comment.moderation_reason = note

    now = datetime.now(timezone.utc)
    previous_report_status = report.status
    report.status = "dismissed" if action == "no_action" else "resolved"
    report.reviewed_by_user_id = actor_id
    report.resolved_at = now
    report.resolution_action = action
    report.resolution_note = note
    await db.flush()
    db.add(
        AdminAuditLog(
            action="comment_moderation",
            model_name="Comment",
            object_pk=str(comment.id),
            object_repr=f"report:{report.id}:{action}"[:500],
            changed_data={
                "actor_user_id": actor_id,
                "report_id": int(report.id),
                "comment_id": int(comment.id),
                "moderation_action": action,
                "previous_comment_status": previous_comment_status,
                "comment_status": comment.status,
                "previous_report_status": previous_report_status,
                "report_status": report.status,
                "resolution_note": note,
            },
            request_path=request_path,
            client_host=client_host,
            note=f"admin_user_id={actor_id}",
        )
    )
    await db.commit()
    await db.refresh(report)
    await db.refresh(comment)
    return CommentModerationActionOut(
        report=report_out(report),
        comment_id=int(comment.id),
        comment_status=comment.status,
        action=action,
    )


async def _load_report_by_idempotency_key(
    db: AsyncSession,
    *,
    reporter_user_id: int,
    idempotency_key: str,
) -> ContentReport | None:
    return await db.scalar(
        select(ContentReport)
        .where(
            ContentReport.reporter_user_id == int(reporter_user_id),
            ContentReport.idempotency_key == idempotency_key,
        )
        .limit(1)
    )


async def _validated_staff_assignee_id(db: AsyncSession, user_id: int | None) -> int | None:
    if user_id is None:
        return None
    user = await db.get(User, int(user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Assignee not found")
    if not (user.is_staff and user.is_active and user.is_email_verified):
        raise HTTPException(status_code=400, detail="Reports can only be assigned to active verified staff")
    return int(user.id)


async def _validated_report_target_context(
    db: AsyncSession,
    user: User,
    *,
    target_type: str,
    target_id: str,
) -> dict[str, int | None]:
    numeric_target_id = _parse_numeric_target_id(target_id)
    if target_type == "exercise":
        exercise = await require_exercise_comments_access(db, user, numeric_target_id)
        return {
            "subject_id": int(exercise.subject_id),
            "topic_id": int(exercise.topic_id) if exercise.topic_id is not None else None,
            "topic_item_id": None,
        }
    if target_type == "comment":
        comment = await db.scalar(
            select(Comment)
            .where(Comment.id == numeric_target_id)
            .options(
                selectinload(Comment.exercise),
                selectinload(Comment.topic_item).selectinload(TopicItem.topic),
            )
        )
        if comment is None:
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment.status != "visible":
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment.exercise_id is not None:
            exercise = await require_exercise_comments_access(db, user, int(comment.exercise_id))
            return {
                "subject_id": int(exercise.subject_id),
                "topic_id": int(exercise.topic_id) if exercise.topic_id is not None else None,
                "topic_item_id": None,
            }
        if comment.topic_item_id is not None:
            await require_comments_enabled_for_topic_item(db, user, int(comment.topic_item_id))
            item = comment.topic_item
            if item is None or item.topic is None:
                raise HTTPException(status_code=404, detail="Comment context not found")
            return {
                "subject_id": int(item.topic.subject_id),
                "topic_id": int(item.topic_id),
                "topic_item_id": int(item.id),
            }
    raise HTTPException(status_code=400, detail="Report target type is not enabled for public intake yet")


def _parse_numeric_target_id(target_id: str) -> int:
    try:
        parsed = int(target_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Report target id must be numeric for this target type") from exc
    if parsed <= 0:
        raise HTTPException(status_code=400, detail="Report target id must be positive")
    return parsed


def _normalize_choice(value: str, *, allowed: set[str], field_name: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported report {field_name}")
    return normalized


def _build_idempotency_key(
    *,
    reporter_id: int,
    target_type: str,
    target_id: str,
    reason: str,
    client_key: str | None,
) -> str:
    normalized_client_key = client_key.strip() if client_key else ""
    raw_key = normalized_client_key or f"{target_type}:{target_id}:{reason}"
    source = "client" if normalized_client_key else "target"
    digest = sha256(f"{reporter_id}:{source}:{raw_key}".encode("utf-8")).hexdigest()
    return f"{source}:{digest}"


def _validate_existing_report(existing: ContentReport, *, target_type: str, target_id: str, reason: str) -> None:
    if existing.target_type != target_type or existing.target_id != target_id or existing.reason != reason:
        raise HTTPException(status_code=409, detail="Report idempotency key payload mismatch")


def report_out(report: ContentReport) -> ReportOut:
    return ReportOut(
        id=int(report.id),
        reporter_user_id=int(report.reporter_user_id),
        target_type=report.target_type,
        target_id=report.target_id,
        subject_id=int(report.subject_id) if report.subject_id is not None else None,
        topic_id=int(report.topic_id) if report.topic_id is not None else None,
        topic_item_id=int(report.topic_item_id) if report.topic_item_id is not None else None,
        reason=report.reason,
        status=report.status,
        priority=report.priority,
        title=report.title,
        description=report.description,
        metadata_json=report.metadata_json or {},
        assigned_to_user_id=int(report.assigned_to_user_id) if report.assigned_to_user_id is not None else None,
        reviewed_by_user_id=int(report.reviewed_by_user_id) if report.reviewed_by_user_id is not None else None,
        resolution_action=report.resolution_action,
        resolution_note=report.resolution_note,
        resolved_at=report.resolved_at,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )
