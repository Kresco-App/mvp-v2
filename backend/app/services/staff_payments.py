from __future__ import annotations

import secrets
import string
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operations import (
    RedemptionCode,
    RedemptionCodeTemplate,
    StaffPaymentProfile,
    StaffPaymentRequest,
)
from app.models.payments import FinanceLedgerEntry, PAYMENT_STATUS_PAID, PaymentTransaction
from app.models.users import User, UserSubjectEntitlement
from app.schemas.founder_ops import (
    RedemptionCodeOut,
    RedemptionCodeRedeemOut,
    RedemptionCodeTemplateIn,
    RedemptionCodeTemplateOut,
    StaffPaymentDashboardOut,
    StaffPaymentProfileOut,
    StaffPaymentRequestCreateIn,
    StaffPaymentRequestOut,
    StaffPaymentProfileUpdateIn,
)
from app.services.payment_gateway import provider_for_rail


CODE_ALPHABET = "".join(ch for ch in string.ascii_uppercase + string.digits if ch not in {"0", "O", "1", "I"})
CODE_TTL_DAYS = 90


async def create_redemption_template(
    db: AsyncSession,
    *,
    actor: User,
    payload: RedemptionCodeTemplateIn,
) -> RedemptionCodeTemplateOut:
    template = RedemptionCodeTemplate(
        name=payload.name,
        plan=payload.plan.strip().lower(),
        tier=payload.tier.strip().lower(),
        subject_scope=payload.subject_scope,
        subject_ids_json=[] if payload.subject_scope == "all" else [int(value) for value in payload.subject_ids],
        duration_days=int(payload.duration_days),
        amount_centimes=int(payload.amount_centimes),
        status=payload.status,
        created_by_user_id=int(actor.id),
        metadata_json=payload.metadata,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template_out(template)


async def list_redemption_templates(db: AsyncSession, *, include_archived: bool = False) -> list[RedemptionCodeTemplateOut]:
    statement = select(RedemptionCodeTemplate).order_by(RedemptionCodeTemplate.status.asc(), RedemptionCodeTemplate.name.asc())
    if not include_archived:
        statement = statement.where(RedemptionCodeTemplate.status == "active")
    return [template_out(row) for row in (await db.execute(statement)).scalars().all()]


async def list_staff_payment_profiles(db: AsyncSession, *, limit: int = 100) -> list[StaffPaymentProfileOut]:
    profiles = (
        await db.execute(
            select(StaffPaymentProfile)
            .order_by(StaffPaymentProfile.updated_at.desc(), StaffPaymentProfile.user_id.desc())
            .limit(max(1, min(int(limit or 100), 300)))
        )
    ).scalars().all()
    return [await profile_out(db, profile) for profile in profiles]


async def upsert_staff_payment_profile(
    db: AsyncSession,
    *,
    actor: User,
    user_id: int,
    payload: StaffPaymentProfileUpdateIn,
) -> StaffPaymentProfileOut:
    del actor
    staff = await db.get(User, int(user_id))
    if staff is None or not staff.is_staff:
        raise HTTPException(status_code=404, detail="Staff user not found")
    profile = await db.get(StaffPaymentProfile, int(user_id))
    if profile is None:
        profile = StaffPaymentProfile(
            user_id=int(user_id),
            display_name=payload.display_name or staff.full_name or staff.email,
            monthly_code_limit=0,
            monthly_amount_limit_centimes=0,
            allowed_template_ids_json=[],
            metadata_json={},
        )
        db.add(profile)
        await db.flush()
    if payload.display_name is not None:
        profile.display_name = payload.display_name
    if payload.status is not None:
        profile.status = payload.status
    if payload.monthly_code_limit is not None:
        profile.monthly_code_limit = int(payload.monthly_code_limit)
    if payload.monthly_amount_limit_centimes is not None:
        profile.monthly_amount_limit_centimes = int(payload.monthly_amount_limit_centimes)
    if payload.allowed_template_ids is not None:
        await _ensure_templates_exist(db, payload.allowed_template_ids)
        profile.allowed_template_ids_json = [int(value) for value in payload.allowed_template_ids]
    if payload.metadata is not None:
        profile.metadata_json = payload.metadata
    await db.commit()
    await db.refresh(profile)
    return await profile_out(db, profile)


async def build_staff_payment_dashboard(db: AsyncSession, *, staff: User, limit: int = 50) -> StaffPaymentDashboardOut:
    profile = await _profile_for_staff(db, staff)
    template_ids = set(int(value) for value in (profile.allowed_template_ids_json or []))
    templates = []
    if template_ids:
        templates_statement = (
            select(RedemptionCodeTemplate)
            .where(RedemptionCodeTemplate.status == "active", RedemptionCodeTemplate.id.in_(template_ids))
            .order_by(RedemptionCodeTemplate.name.asc())
        )
        templates = (await db.execute(templates_statement)).scalars().all()

    code_alias = RedemptionCode
    requests = (
        await db.execute(
            select(StaffPaymentRequest, code_alias)
            .join(code_alias, code_alias.id == StaffPaymentRequest.redemption_code_id)
            .where(StaffPaymentRequest.staff_user_id == int(staff.id))
            .order_by(StaffPaymentRequest.created_at.desc(), StaffPaymentRequest.id.desc())
            .limit(max(1, min(int(limit or 50), 100)))
        )
    ).all()

    return StaffPaymentDashboardOut(
        generated_at=datetime.now(timezone.utc),
        profile=await profile_out(db, profile),
        templates=[template_out(template) for template in templates],
        requests=[request_out(request, code) for request, code in requests],
    )


async def list_staff_payment_requests(
    db: AsyncSession,
    *,
    staff_user_id: int | None = None,
    limit: int = 100,
) -> list[StaffPaymentRequestOut]:
    statement = (
        select(StaffPaymentRequest, RedemptionCode)
        .join(RedemptionCode, RedemptionCode.id == StaffPaymentRequest.redemption_code_id)
        .order_by(StaffPaymentRequest.created_at.desc(), StaffPaymentRequest.id.desc())
        .limit(max(1, min(int(limit or 100), 200)))
    )
    if staff_user_id is not None:
        statement = statement.where(StaffPaymentRequest.staff_user_id == int(staff_user_id))
    return [request_out(request, code) for request, code in (await db.execute(statement)).all()]


async def create_staff_payment_request(
    db: AsyncSession,
    *,
    staff: User,
    payload: StaffPaymentRequestCreateIn,
) -> StaffPaymentRequestOut:
    profile = await _profile_for_staff(db, staff, for_update=True)
    if profile.status != "active":
        raise HTTPException(status_code=403, detail="Staff payment profile is paused")

    template = await db.get(RedemptionCodeTemplate, int(payload.template_id))
    if template is None or template.status != "active":
        raise HTTPException(status_code=404, detail="Redemption template not found")
    allowed_template_ids = {int(value) for value in (profile.allowed_template_ids_json or [])}
    if not allowed_template_ids or int(template.id) not in allowed_template_ids:
        raise HTTPException(status_code=403, detail="Template is not allowed for this staff member")
    if int(payload.amount_centimes) != int(template.amount_centimes):
        raise HTTPException(status_code=409, detail="Payment amount does not match selected template")

    month_start = _month_start(datetime.now(timezone.utc).date())
    used_codes = await _staff_monthly_code_count(db, staff_user_id=int(staff.id), month_start=month_start)
    if used_codes >= int(profile.monthly_code_limit):
        raise HTTPException(status_code=403, detail="Monthly code quota exceeded")
    used_amount = await _staff_monthly_amount_sum(db, staff_user_id=int(staff.id), month_start=month_start)
    amount_limit = int(profile.monthly_amount_limit_centimes or 0)
    if amount_limit and used_amount + int(payload.amount_centimes) > amount_limit:
        raise HTTPException(status_code=403, detail="Monthly amount quota exceeded")

    existing_reference = await db.scalar(
        select(StaffPaymentRequest.id)
        .where(
            StaffPaymentRequest.payment_method == payload.payment_method,
            StaffPaymentRequest.provider_reference == payload.provider_reference,
        )
        .limit(1)
    )
    if existing_reference is not None:
        raise HTTPException(status_code=409, detail="Transfer reference was already used")

    now = datetime.now(timezone.utc)
    code = await _create_unique_code(db, template=template, staff=staff, now=now, metadata={
        "student_name": payload.student_name,
        "student_phone": payload.student_phone,
        "student_email": payload.student_email or "",
        "payment_method": payload.payment_method,
        "provider_reference": payload.provider_reference,
    })
    request = StaffPaymentRequest(
        staff_user_id=int(staff.id),
        template_id=int(template.id),
        redemption_code_id=int(code.id),
        payment_method=payload.payment_method,
        provider_reference=payload.provider_reference,
        amount_centimes=int(payload.amount_centimes),
        status="code_generated",
        student_name=payload.student_name,
        student_phone=payload.student_phone,
        student_email=payload.student_email or "",
        proof_url=payload.proof_url or "",
        notes=payload.notes or "",
        requires_review=False,
        metadata_json={
            "template_name": template.name,
            "staff_user_id": int(staff.id),
        },
    )
    db.add(request)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Transfer reference was already used") from exc
    await db.refresh(request)
    await db.refresh(code)
    return request_out(request, code)


async def redeem_code_for_user(
    db: AsyncSession,
    *,
    user: User,
    raw_code: str,
) -> RedemptionCodeRedeemOut:
    now = datetime.now(timezone.utc)
    code = await db.scalar(
        select(RedemptionCode)
        .where(RedemptionCode.code == raw_code)
        .with_for_update()
    )
    if code is None:
        raise HTTPException(status_code=404, detail="Redemption code not found")
    if code.status != "generated":
        raise HTTPException(status_code=409, detail="Redemption code is no longer available")
    expires_at = _as_aware_utc(code.expires_at)
    if expires_at is not None and expires_at <= now:
        code.status = "expired"
        await db.commit()
        raise HTTPException(status_code=409, detail="Redemption code is expired")

    request = await db.scalar(
        select(StaffPaymentRequest)
        .where(StaffPaymentRequest.redemption_code_id == int(code.id))
        .with_for_update()
    )
    if request is None:
        raise HTTPException(status_code=409, detail="Redemption code is missing payment trace")
    if request.status != "code_generated":
        raise HTTPException(status_code=409, detail="Payment trace is not available for redemption")

    user.tier = code.tier
    if code.tier in {"pro", "vip"}:
        user.is_pro = True
    code.status = "redeemed"
    code.redeemed_by_user_id = int(user.id)
    code.redeemed_at = now
    request.status = "redeemed"
    request.updated_at = now

    transaction = PaymentTransaction(
        user_id=int(user.id),
        provider=provider_for_rail(request.payment_method),
        rail=request.payment_method,
        status=PAYMENT_STATUS_PAID,
        plan=code.plan,
        amount_centimes=int(code.amount_centimes),
        currency=code.currency,
        reference_code=f"CODE-{code.code}",
        provider_reference=request.provider_reference,
        instructions_json={},
        provider_payload_json={},
        metadata_json={
            "source": "staff_redemption_code",
            "redemption_code_id": int(code.id),
            "staff_payment_request_id": int(request.id),
            "staff_user_id": int(request.staff_user_id),
            "student_name": request.student_name,
            "student_phone": request.student_phone,
            "student_email": request.student_email,
        },
        confirmed_at=now,
    )
    db.add(transaction)
    await db.flush()
    entitlement_count = await _grant_code_entitlements(db, user=user, code=code, starts_at=now)
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(user.id),
            entry_type="redemption_code_redeemed",
            amount_centimes=int(code.amount_centimes),
            currency=code.currency,
            reason=f"Redeemed staff code {code.code}",
            metadata_json={
                "redemption_code_id": int(code.id),
                "staff_payment_request_id": int(request.id),
                "staff_user_id": int(request.staff_user_id),
                "entitlements_granted": entitlement_count,
            },
        )
    )
    await db.commit()
    await db.refresh(code)
    await db.refresh(transaction)
    return RedemptionCodeRedeemOut(
        code=code_out(code),
        transaction_id=int(transaction.id),
        entitlement_count=entitlement_count,
    )


async def _profile_for_staff(db: AsyncSession, staff: User, *, for_update: bool = False) -> StaffPaymentProfile:
    statement = select(StaffPaymentProfile).where(StaffPaymentProfile.user_id == int(staff.id))
    if for_update:
        statement = statement.with_for_update()
    profile = await db.scalar(statement)
    if profile is None:
        profile = StaffPaymentProfile(
            user_id=int(staff.id),
            display_name=staff.full_name or staff.email,
            monthly_code_limit=0,
            monthly_amount_limit_centimes=0,
            allowed_template_ids_json=[],
            metadata_json={"auto_created": True},
        )
        db.add(profile)
        await db.flush()
    return profile


async def profile_out(db: AsyncSession, profile: StaffPaymentProfile) -> StaffPaymentProfileOut:
    current_month = _month_start(datetime.now(timezone.utc).date())
    used_codes = await _staff_monthly_code_count(db, staff_user_id=int(profile.user_id), month_start=current_month)
    used_amount = await _staff_monthly_amount_sum(db, staff_user_id=int(profile.user_id), month_start=current_month)
    amount_limit = int(profile.monthly_amount_limit_centimes or 0)
    return StaffPaymentProfileOut(
        user_id=int(profile.user_id),
        display_name=profile.display_name,
        status=profile.status,
        monthly_code_limit=int(profile.monthly_code_limit),
        monthly_amount_limit_centimes=amount_limit,
        allowed_template_ids=[int(value) for value in (profile.allowed_template_ids_json or [])],
        used_codes_this_month=used_codes,
        remaining_codes_this_month=max(int(profile.monthly_code_limit) - used_codes, 0),
        used_amount_this_month_centimes=used_amount,
        remaining_amount_this_month_centimes=max(amount_limit - used_amount, 0) if amount_limit else None,
    )


def template_out(template: RedemptionCodeTemplate) -> RedemptionCodeTemplateOut:
    return RedemptionCodeTemplateOut(
        id=int(template.id),
        name=template.name,
        plan=template.plan,
        tier=template.tier,
        subject_scope=template.subject_scope,
        subject_ids=[int(value) for value in (template.subject_ids_json or [])],
        duration_days=int(template.duration_days),
        amount_centimes=int(template.amount_centimes),
        currency=template.currency,
        status=template.status,
        created_by_user_id=int(template.created_by_user_id),
        metadata=template.metadata_json or {},
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def code_out(code: RedemptionCode) -> RedemptionCodeOut:
    return RedemptionCodeOut(
        id=int(code.id),
        code=code.code,
        template_id=int(code.template_id),
        generated_by_user_id=int(code.generated_by_user_id),
        redeemed_by_user_id=int(code.redeemed_by_user_id) if code.redeemed_by_user_id is not None else None,
        plan=code.plan,
        tier=code.tier,
        subject_ids=[int(value) for value in (code.subject_ids_json or [])],
        duration_days=int(code.duration_days),
        amount_centimes=int(code.amount_centimes),
        currency=code.currency,
        status=code.status,
        expires_at=code.expires_at,
        redeemed_at=code.redeemed_at,
        created_at=code.created_at,
    )


def request_out(request: StaffPaymentRequest, code: RedemptionCode) -> StaffPaymentRequestOut:
    return StaffPaymentRequestOut(
        id=int(request.id),
        staff_user_id=int(request.staff_user_id),
        template_id=int(request.template_id),
        redemption_code_id=int(request.redemption_code_id),
        payment_method=request.payment_method,
        provider_reference=request.provider_reference,
        amount_centimes=int(request.amount_centimes),
        currency=request.currency,
        status=request.status,
        student_name=request.student_name,
        student_phone=request.student_phone,
        student_email=request.student_email,
        proof_url=request.proof_url,
        notes=request.notes,
        requires_review=bool(request.requires_review),
        metadata=request.metadata_json or {},
        created_at=request.created_at,
        updated_at=request.updated_at,
        code=code_out(code),
    )


async def _create_unique_code(
    db: AsyncSession,
    *,
    template: RedemptionCodeTemplate,
    staff: User,
    now: datetime,
    metadata: dict[str, Any],
) -> RedemptionCode:
    candidates: list[str] = []
    seen: set[str] = set()
    while len(candidates) < 8:
        candidate = f"KR{''.join(secrets.choice(CODE_ALPHABET) for _ in range(10))}"
        if candidate in seen:
            continue
        seen.add(candidate)
        candidates.append(candidate)

    existing_codes = set(
        (await db.execute(select(RedemptionCode.code).where(RedemptionCode.code.in_(candidates)))).scalars().all()
    )
    for value in candidates:
        if value in existing_codes:
            continue
        code = RedemptionCode(
            code=value,
            template_id=int(template.id),
            generated_by_user_id=int(staff.id),
            plan=template.plan,
            tier=template.tier,
            subject_ids_json=[int(item) for item in (template.subject_ids_json or [])],
            duration_days=int(template.duration_days),
            amount_centimes=int(template.amount_centimes),
            currency=template.currency,
            status="generated",
            expires_at=now + timedelta(days=CODE_TTL_DAYS),
            metadata_json={**metadata, "subject_scope": template.subject_scope},
        )
        db.add(code)
        await db.flush()
        return code
    raise HTTPException(status_code=500, detail="Could not generate a unique code")


async def _grant_code_entitlements(
    db: AsyncSession,
    *,
    user: User,
    code: RedemptionCode,
    starts_at: datetime,
) -> int:
    subject_ids = [int(value) for value in (code.subject_ids_json or [])]
    if not subject_ids:
        if (code.metadata_json or {}).get("subject_scope") == "selected":
            raise HTTPException(status_code=409, detail="Redemption code has no selected subjects")
        from app.models.courses import Subject

        subject_ids = list((await db.execute(select(Subject.id).order_by(Subject.id.asc()))).scalars().all())
    if not subject_ids:
        return 0
    ends_at = starts_at + timedelta(days=int(code.duration_days)) if int(code.duration_days) > 0 else None
    created = 0
    existing_entitlements = (
        await db.execute(
            select(UserSubjectEntitlement)
            .where(
                UserSubjectEntitlement.user_id == int(user.id),
                UserSubjectEntitlement.subject_id.in_(subject_ids),
                UserSubjectEntitlement.status == "active",
                (UserSubjectEntitlement.ends_at.is_(None)) | (UserSubjectEntitlement.ends_at >= starts_at),
            )
        )
    ).scalars().all()
    existing_by_subject = {
        int(entitlement.subject_id): entitlement
        for entitlement in existing_entitlements
    }
    for subject_id in subject_ids:
        existing = existing_by_subject.get(int(subject_id))
        if existing is not None:
            if ends_at is None or existing.ends_at is None or existing.ends_at >= ends_at:
                continue
            existing.ends_at = ends_at
            continue
        db.add(
            UserSubjectEntitlement(
                user_id=int(user.id),
                subject_id=int(subject_id),
                starts_at=starts_at,
                ends_at=ends_at,
                source=f"code:{code.code}"[:60],
                status="active",
            )
        )
        created += 1
    return created


async def _staff_monthly_code_count(db: AsyncSession, *, staff_user_id: int, month_start: date) -> int:
    start, end = _month_datetimes(month_start)
    return int(
        await db.scalar(
            select(func.count())
            .select_from(StaffPaymentRequest)
            .where(
                StaffPaymentRequest.staff_user_id == staff_user_id,
                StaffPaymentRequest.created_at >= start,
                StaffPaymentRequest.created_at < end,
            )
        )
        or 0
    )


async def _staff_monthly_amount_sum(db: AsyncSession, *, staff_user_id: int, month_start: date) -> int:
    start, end = _month_datetimes(month_start)
    return int(
        await db.scalar(
            select(func.coalesce(func.sum(StaffPaymentRequest.amount_centimes), 0))
            .where(
                StaffPaymentRequest.staff_user_id == staff_user_id,
                StaffPaymentRequest.created_at >= start,
                StaffPaymentRequest.created_at < end,
                StaffPaymentRequest.status.in_(("code_generated", "redeemed")),
            )
        )
        or 0
    )


async def _ensure_templates_exist(db: AsyncSession, template_ids: list[int]) -> None:
    if not template_ids:
        return
    existing = set(
        (await db.execute(
            select(RedemptionCodeTemplate.id).where(
                RedemptionCodeTemplate.id.in_([int(value) for value in template_ids]),
                RedemptionCodeTemplate.status == "active",
            )
        )).scalars().all()
    )
    missing = [int(value) for value in template_ids if int(value) not in existing]
    if missing:
        raise HTTPException(status_code=404, detail=f"Active redemption template not found: {missing[0]}")


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _month_datetimes(value: date) -> tuple[datetime, datetime]:
    start = datetime(value.year, value.month, 1, tzinfo=timezone.utc)
    if value.month == 12:
        end = datetime(value.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(value.year, value.month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
