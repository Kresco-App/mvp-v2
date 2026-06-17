"""Apply engine for professor change requests.

An admin reviews a batched :class:`ProfessorChangeRequest` and decides, per
operation, whether to approve or reject it. Approved operations are applied to
the real course tables (``Topic`` / ``TopicItem`` / ``TabContent``) in ``seq``
order so that items created earlier in the batch can be referenced (via
``client_ref``) by later operations.

Entity mapping: ``chapter`` -> Topic, ``lesson`` -> TopicItem, ``tab`` ->
TabContent. ``TopicSection`` is managed automatically: every chapter keeps one
default section that lessons attach to, so the studio only deals with three
visible levels.
"""
from __future__ import annotations

import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Resource, TabContent, Topic, TopicItem, TopicSection
from app.models.professor import CourseOffering, ProfessorChangeOperation, ProfessorChangeRequest

# Fields a professor is allowed to set, per entity. Both update_fields and
# update_content operations route through this whitelist; anything else in the
# payload is ignored.
_ALLOWED_FIELDS: dict[str, set[str]] = {
    "chapter": {"title", "description", "status", "is_free_preview", "required_tier", "required_feature_key"},
    "lesson": {
        "title", "description", "status", "item_type", "is_free_preview",
        "required_tier", "required_feature_key", "renderer_key", "duration_seconds",
    },
    "tab": {"label", "tab_type", "status", "content", "renderer_key", "config_json"},
}


class OperationApplyError(Exception):
    """Raised when a single operation cannot be applied."""


@dataclass
class ApplyContext:
    offering: CourseOffering
    # Maps a create op's client_ref -> the real id it produced.
    ref_map: dict[str, int] = field(default_factory=dict)
    # Caches the default section id for a topic id.
    default_section: dict[int, int] = field(default_factory=dict)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "chapter"


async def _unique_topic_slug(db: AsyncSession, title: str) -> str:
    base = _slugify(title)[:140]
    candidate = base
    for _ in range(8):
        exists = await db.scalar(select(Topic.id).where(Topic.slug == candidate).limit(1))
        if exists is None:
            return candidate
        candidate = f"{base}-{secrets.token_hex(3)}"
    return f"{base}-{secrets.token_hex(6)}"


def _resolve_ref(ref: str, ctx: ApplyContext) -> int:
    """Resolve a parent/target reference that may be a real id or a client_ref."""
    ref = (ref or "").strip()
    if not ref:
        raise OperationApplyError("Missing reference")
    if ref in ctx.ref_map:
        return ctx.ref_map[ref]
    if ref.lstrip("-").isdigit():
        return int(ref)
    raise OperationApplyError(f"Unresolved reference '{ref}'")


async def _ensure_default_section(db: AsyncSession, topic_id: int, ctx: ApplyContext) -> int:
    if topic_id in ctx.default_section:
        return ctx.default_section[topic_id]
    section_id = await db.scalar(
        select(TopicSection.id).where(TopicSection.topic_id == topic_id).order_by(TopicSection.order, TopicSection.id).limit(1)
    )
    if section_id is None:
        section = TopicSection(topic_id=topic_id, title="", section_type="main", order=0)
        db.add(section)
        await db.flush()
        section_id = section.id
    ctx.default_section[topic_id] = section_id
    return section_id


async def _next_order(db: AsyncSession, model, filter_clause) -> int:
    current_max = await db.scalar(select(func.max(model.order)).where(filter_clause))
    return int(current_max or 0) + 1


def _explicit_order(payload: dict, fallback: int) -> int:
    """Honour an explicit order from the studio (so new items can be placed
    anywhere), falling back to append position."""
    if "order" in (payload or {}):
        try:
            return int(payload["order"])
        except (TypeError, ValueError):
            return fallback
    return fallback


def _clean_patch(entity_type: str, payload: dict) -> dict:
    allowed = _ALLOWED_FIELDS[entity_type]
    return {key: value for key, value in (payload or {}).items() if key in allowed}


async def _apply_tab_resource(db: AsyncSession, tab: TabContent, payload: dict) -> None:
    """Upsert the document Resource backing a tab (e.g. a Ressources tab PDF).

    Tabs only carry plain documents/links via ``resource_url``; hosted video
    lives on the lesson (see :func:`_apply_lesson_video`).
    """
    if "resource_url" not in (payload or {}):
        return
    url = str(payload.get("resource_url") or "").strip()
    if not url:
        return
    if tab.resource_id:
        resource = await db.get(Resource, tab.resource_id)
        if resource is not None:
            resource.url = url
            resource.resource_type = "document"
            return
    topic_id = await db.scalar(
        select(TopicItem.topic_id).where(TopicItem.id == tab.topic_item_id).limit(1)
    )
    resource = Resource(
        topic_id=topic_id,
        title=tab.label or "Resource",
        resource_type="document",
        url=url,
    )
    db.add(resource)
    await db.flush()
    tab.resource_id = resource.id


async def _apply_lesson_video(db: AsyncSession, item: TopicItem, payload: dict) -> None:
    """Set/clear the lesson's primary VdoCipher video from ``video_id``.

    The student player resolves the stream from the Resource's
    ``provider_resource_id`` (the VdoCipher video id).
    """
    if "video_id" not in (payload or {}):
        return
    video_id = str(payload.get("video_id") or "").strip()

    if item.primary_resource_id:
        resource = await db.get(Resource, item.primary_resource_id)
        if resource is not None:
            resource.provider = "vdocipher"
            resource.provider_resource_id = video_id
            resource.resource_type = "video"
            return
    if not video_id:
        return
    resource = Resource(
        topic_id=item.topic_id,
        title=item.title or "Vidéo",
        resource_type="video",
        provider="vdocipher",
        provider_resource_id=video_id,
    )
    db.add(resource)
    await db.flush()
    item.primary_resource_id = resource.id


# ── Per-operation handlers ──────────────────────────────────────────────────


async def _apply_create(db: AsyncSession, op: ProfessorChangeOperation, ctx: ApplyContext) -> int:
    payload = op.payload_json or {}
    patch = _clean_patch(op.entity_type, payload)

    if op.entity_type == "chapter":
        subject_id = ctx.offering.subject_id
        slug = await _unique_topic_slug(db, patch.get("title", "Chapitre"))
        order = _explicit_order(payload, await _next_order(db, Topic, Topic.course_offering_id == ctx.offering.id))
        topic = Topic(
            subject_id=subject_id,
            course_offering_id=ctx.offering.id,
            slug=slug,
            title=patch.get("title", "Nouveau chapitre"),
            description=patch.get("description", ""),
            status=patch.get("status", "published"),
            order=order,
            is_free_preview=bool(patch.get("is_free_preview", False)),
            required_tier=patch.get("required_tier", ""),
        )
        db.add(topic)
        await db.flush()
        await _ensure_default_section(db, topic.id, ctx)
        return topic.id

    if op.entity_type == "lesson":
        topic_id = _resolve_ref(op.parent_ref, ctx)
        section_id = await _ensure_default_section(db, topic_id, ctx)
        order = _explicit_order(payload, await _next_order(db, TopicItem, TopicItem.section_id == section_id))
        item = TopicItem(
            topic_id=topic_id,
            section_id=section_id,
            title=patch.get("title", "Nouvelle leçon"),
            description=patch.get("description", ""),
            item_type=patch.get("item_type", "lesson"),
            status=patch.get("status", "published"),
            order=order,
            is_free_preview=bool(patch.get("is_free_preview", False)),
            required_tier=patch.get("required_tier", ""),
            duration_seconds=int(patch.get("duration_seconds", 0) or 0),
        )
        db.add(item)
        await db.flush()
        await _apply_lesson_video(db, item, payload)
        return item.id

    if op.entity_type == "tab":
        item_id = _resolve_ref(op.parent_ref, ctx)
        order = _explicit_order(payload, await _next_order(db, TabContent, TabContent.topic_item_id == item_id))
        tab = TabContent(
            topic_item_id=item_id,
            label=patch.get("label", "Onglet"),
            tab_type=patch.get("tab_type", "course"),
            status=patch.get("status", "published"),
            content=payload.get("content", ""),
            renderer_key=payload.get("renderer_key", ""),
            config_json=payload.get("config_json") or {},
            order=order,
        )
        db.add(tab)
        await db.flush()
        await _apply_tab_resource(db, tab, payload)
        # Default the lesson to open on its first tab so the workspace lands
        # on real content instead of a fallback slot.
        parent = await db.get(TopicItem, item_id)
        if parent is not None and parent.primary_tab_content_id is None:
            parent.primary_tab_content_id = tab.id
        return tab.id

    raise OperationApplyError(f"Unknown entity_type '{op.entity_type}'")


async def _load_target(db: AsyncSession, entity_type: str, target_id: int):
    model = {"chapter": Topic, "lesson": TopicItem, "tab": TabContent}[entity_type]
    obj = await db.get(model, target_id)
    if obj is None:
        raise OperationApplyError(f"{entity_type} {target_id} no longer exists")
    return obj


async def _apply_update(db: AsyncSession, op: ProfessorChangeOperation, ctx: ApplyContext) -> int:
    target_id = op.target_id if op.target_id is not None else _resolve_ref(op.client_ref, ctx)
    obj = await _load_target(db, op.entity_type, target_id)
    patch = _clean_patch(op.entity_type, op.payload_json or {})
    for key, value in patch.items():
        setattr(obj, key, value)
    # Content extras.
    if op.entity_type == "tab":
        await _apply_tab_resource(db, obj, op.payload_json or {})
    elif op.entity_type == "lesson":
        await _apply_lesson_video(db, obj, op.payload_json or {})
    await db.flush()
    return target_id


async def _delete_children(db: AsyncSession, entity_type: str, target_id: int) -> None:
    """Explicitly remove descendants so deletes are correct even on SQLite,
    which does not enforce ON DELETE CASCADE unless PRAGMA foreign_keys is on."""
    if entity_type == "chapter":
        section_ids = (
            await db.execute(select(TopicSection.id).where(TopicSection.topic_id == target_id))
        ).scalars().all()
        item_ids: list[int] = []
        if section_ids:
            item_ids = (
                await db.execute(select(TopicItem.id).where(TopicItem.section_id.in_(section_ids)))
            ).scalars().all()
        if item_ids:
            for tab in (
                await db.execute(select(TabContent).where(TabContent.topic_item_id.in_(item_ids)))
            ).scalars().all():
                await db.delete(tab)
            for item in (
                await db.execute(select(TopicItem).where(TopicItem.id.in_(item_ids)))
            ).scalars().all():
                await db.delete(item)
        for section in (
            await db.execute(select(TopicSection).where(TopicSection.topic_id == target_id))
        ).scalars().all():
            await db.delete(section)
    elif entity_type == "lesson":
        for tab in (
            await db.execute(select(TabContent).where(TabContent.topic_item_id == target_id))
        ).scalars().all():
            await db.delete(tab)


async def _apply_delete(db: AsyncSession, op: ProfessorChangeOperation, ctx: ApplyContext) -> int:
    if op.target_id is None:
        # A create + delete in the same batch is a no-op against real data.
        return _resolve_ref(op.client_ref, ctx) if op.client_ref else 0
    obj = await _load_target(db, op.entity_type, op.target_id)
    await _delete_children(db, op.entity_type, op.target_id)
    await db.delete(obj)
    await db.flush()
    return op.target_id


async def _apply_reorder(db: AsyncSession, op: ProfessorChangeOperation, ctx: ApplyContext) -> int:
    target_id = op.target_id if op.target_id is not None else _resolve_ref(op.client_ref, ctx)
    obj = await _load_target(db, op.entity_type, target_id)
    payload = op.payload_json or {}
    if "order" in payload:
        obj.order = int(payload["order"])
    # Optional reparenting (move across chapters/lessons).
    if op.parent_ref:
        parent_id = _resolve_ref(op.parent_ref, ctx)
        if op.entity_type == "lesson":
            obj.section_id = await _ensure_default_section(db, parent_id, ctx)
            obj.topic_id = parent_id
        elif op.entity_type == "tab":
            obj.topic_item_id = parent_id
    await db.flush()
    return target_id


_HANDLERS = {
    "create": _apply_create,
    "update_fields": _apply_update,
    "update_content": _apply_update,
    "delete": _apply_delete,
    "reorder": _apply_reorder,
}


async def apply_change_operations(
    db: AsyncSession,
    *,
    change_request: ProfessorChangeRequest,
    approve_op_ids: set[int],
    reject_op_ids: set[int],
    admin_user_id: int | None = None,
    admin_note: str = "",
) -> ProfessorChangeRequest:
    """Apply approved operations and reject the rest. Commits once at the end.

    Operations not referenced in either set stay pending (the request also stays
    pending). Approved operations are applied in ``seq`` order; a failure is
    recorded on that operation and does not abort the others.
    """
    offering = await db.get(CourseOffering, change_request.course_offering_id)
    if offering is None:
        raise OperationApplyError("Course offering no longer exists")
    ctx = ApplyContext(offering=offering)

    result = await db.execute(
        select(ProfessorChangeOperation)
        .where(ProfessorChangeOperation.change_request_id == change_request.id)
        .order_by(ProfessorChangeOperation.seq)
    )
    operations = result.scalars().all()

    for op in operations:
        if op.id in reject_op_ids and op.status == "pending":
            op.status = "rejected"

    for op in operations:
        if op.id not in approve_op_ids or op.status != "pending":
            continue
        try:
            handler = _HANDLERS[op.op_type]
            applied_id = await handler(db, op, ctx)
            if op.op_type == "create" and op.client_ref:
                ctx.ref_map[op.client_ref] = applied_id
            op.applied_target_id = applied_id or None
            op.status = "applied"
            op.error_detail = ""
        except OperationApplyError as exc:
            op.status = "failed"
            op.error_detail = str(exc)
        except Exception as exc:  # pragma: no cover - defensive
            op.status = "failed"
            op.error_detail = f"{type(exc).__name__}: {exc}"

    statuses = {op.status for op in operations}
    if "pending" in statuses:
        new_status = "pending"
    elif "applied" in statuses and ("failed" in statuses or "rejected" in statuses):
        new_status = "partially_applied"
    elif "applied" in statuses:
        new_status = "applied"
    elif "failed" in statuses:
        new_status = "failed"
    else:
        new_status = "rejected"

    change_request.status = new_status
    if new_status != "pending":
        change_request.reviewed_at = datetime.now(timezone.utc)
        if admin_user_id is not None:
            change_request.admin_user_id = admin_user_id
    if admin_note:
        change_request.admin_note = admin_note

    await db.commit()
    await db.refresh(change_request)
    return change_request
