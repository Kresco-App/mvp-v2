from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Subject
from app.models.payments import ManualAccessGrant
from app.models.users import User, UserSubjectEntitlement
from app.schemas.payments import ManualAccessGrantCreateIn, ManualAccessGrantOut

MANUAL_ACCESS_SOURCE = "manual_access"


async def create_manual_access_grant(
    db: AsyncSession,
    *,
    actor: User,
    request: ManualAccessGrantCreateIn,
) -> ManualAccessGrantOut:
    target_user = await db.get(User, int(request.user_id))
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    subject = await db.get(Subject, int(request.subject_id))
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    now = datetime.now(timezone.utc)
    starts_at = request.starts_at or now
    ends_at = request.ends_at
    if request.action == "grant" and ends_at is None:
        raise HTTPException(status_code=400, detail="ends_at is required for manual access grants")
    if starts_at is not None:
        starts_at = _as_aware_utc(starts_at)
    if ends_at is not None:
        ends_at = _as_aware_utc(ends_at)
    if ends_at is not None and starts_at is not None and ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    if request.action == "grant":
        record = await _grant_subject_access(db, actor=actor, request=request, starts_at=starts_at, ends_at=ends_at)
    else:
        record = await _revoke_subject_access(db, actor=actor, request=request)

    await db.commit()
    await db.refresh(record)
    return manual_access_grant_out(record)


async def list_manual_access_grants(
    db: AsyncSession,
    *,
    user_id: int | None = None,
    limit: int = 50,
) -> list[ManualAccessGrantOut]:
    statement = select(ManualAccessGrant).order_by(ManualAccessGrant.created_at.desc(), ManualAccessGrant.id.desc())
    if user_id is not None:
        statement = statement.where(ManualAccessGrant.user_id == int(user_id))
    result = await db.execute(statement.limit(max(1, min(int(limit), 100))))
    return [manual_access_grant_out(record) for record in result.scalars().all()]


async def _grant_subject_access(
    db: AsyncSession,
    *,
    actor: User,
    request: ManualAccessGrantCreateIn,
    starts_at: datetime,
    ends_at: datetime,
) -> ManualAccessGrant:
    existing = await _active_manual_entitlement(
        db,
        user_id=int(request.user_id),
        subject_id=int(request.subject_id),
        at=starts_at,
    )
    record = ManualAccessGrant(
        user_id=int(request.user_id),
        subject_id=int(request.subject_id),
        action="grant",
        status="no_op" if existing is not None else "completed",
        entitlement_id=int(existing.id) if existing is not None else None,
        starts_at=starts_at,
        ends_at=ends_at,
        reason=request.reason,
        created_by_user_id=int(actor.id),
        metadata_json={"already_active": existing is not None},
    )
    db.add(record)
    await db.flush()
    if existing is None:
        entitlement = UserSubjectEntitlement(
            user_id=int(request.user_id),
            subject_id=int(request.subject_id),
            starts_at=starts_at,
            ends_at=ends_at,
            source=MANUAL_ACCESS_SOURCE,
            status="active",
        )
        db.add(entitlement)
        await db.flush()
        record.entitlement_id = int(entitlement.id)
        record.metadata_json = {"already_active": False, "entitlement_created": True}
    return record


async def _revoke_subject_access(
    db: AsyncSession,
    *,
    actor: User,
    request: ManualAccessGrantCreateIn,
) -> ManualAccessGrant:
    now = datetime.now(timezone.utc)
    entitlements = await _revokable_manual_entitlements(
        db,
        user_id=int(request.user_id),
        subject_id=int(request.subject_id),
        revoke_at=now,
    )
    entitlement = entitlements[0] if entitlements else None
    record = ManualAccessGrant(
        user_id=int(request.user_id),
        subject_id=int(request.subject_id),
        action="revoke",
        status="no_op" if not entitlements else "completed",
        entitlement_id=int(entitlement.id) if entitlement is not None else None,
        starts_at=None,
        ends_at=now,
        reason=request.reason,
        created_by_user_id=int(actor.id),
        metadata_json={
            "manual_entitlement_found": bool(entitlements),
            "revoked_entitlement_ids": [int(item.id) for item in entitlements],
        },
    )
    db.add(record)
    for entitlement in entitlements:
        entitlement.status = "revoked"
        entitlement.ends_at = now
    return record


async def _active_manual_entitlement(
    db: AsyncSession,
    *,
    user_id: int,
    subject_id: int,
    at: datetime,
) -> UserSubjectEntitlement | None:
    result = await db.execute(
        select(UserSubjectEntitlement)
        .where(
            UserSubjectEntitlement.user_id == user_id,
            UserSubjectEntitlement.subject_id == subject_id,
            UserSubjectEntitlement.source == MANUAL_ACCESS_SOURCE,
            UserSubjectEntitlement.status == "active",
            or_(UserSubjectEntitlement.starts_at.is_(None), UserSubjectEntitlement.starts_at <= at),
            or_(UserSubjectEntitlement.ends_at.is_(None), UserSubjectEntitlement.ends_at >= at),
        )
        .order_by(UserSubjectEntitlement.created_at.desc(), UserSubjectEntitlement.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _revokable_manual_entitlements(
    db: AsyncSession,
    *,
    user_id: int,
    subject_id: int,
    revoke_at: datetime,
) -> list[UserSubjectEntitlement]:
    result = await db.execute(
        select(UserSubjectEntitlement)
        .where(
            UserSubjectEntitlement.user_id == user_id,
            UserSubjectEntitlement.subject_id == subject_id,
            UserSubjectEntitlement.source == MANUAL_ACCESS_SOURCE,
            UserSubjectEntitlement.status == "active",
            or_(UserSubjectEntitlement.ends_at.is_(None), UserSubjectEntitlement.ends_at >= revoke_at),
        )
        .order_by(UserSubjectEntitlement.created_at.desc(), UserSubjectEntitlement.id.desc())
    )
    return list(result.scalars().all())


def manual_access_grant_out(record: ManualAccessGrant) -> ManualAccessGrantOut:
    return ManualAccessGrantOut(
        id=int(record.id),
        user_id=int(record.user_id),
        subject_id=int(record.subject_id),
        action=record.action,
        status=record.status,
        entitlement_id=int(record.entitlement_id) if record.entitlement_id is not None else None,
        starts_at=record.starts_at,
        ends_at=record.ends_at,
        reason=record.reason,
        created_by_user_id=int(record.created_by_user_id),
        metadata=record.metadata_json or {},
        created_at=record.created_at,
    )


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
