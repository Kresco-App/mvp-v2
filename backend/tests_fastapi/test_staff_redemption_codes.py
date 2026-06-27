from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.operations import (
    RedemptionCode,
    RedemptionCodeTemplate,
    StaffPaymentProfile,
    StaffPaymentRequest,
)
from app.models.payments import FinanceLedgerEntry, PaymentTransaction
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.services.auth import create_token


async def _seed_staff_code_fixture(
    test_settings,
    *,
    suffix: str,
    monthly_code_limit: int = 2,
    monthly_amount_limit_centimes: int = 30000,
):
    session_factory = get_session_factory()
    async with session_factory() as db:
        staff = User(
            email=f"staff-codes-{suffix}@example.com",
            full_name="Staff Codes Agent",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        denied_staff = User(
            email=f"staff-codes-denied-{suffix}@example.com",
            full_name="Denied Staff Codes Agent",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        student = User(
            email=f"staff-codes-student-{suffix}@example.com",
            full_name="Staff Code Student",
            is_active=True,
            is_email_verified=True,
        )
        subject = Subject(
            title=f"Staff Code Subject {suffix}",
            description="",
            is_published=True,
            order=900,
        )
        db.add_all([staff, denied_staff, student, subject])
        await db.flush()

        db.add(
            UserPermission(
                user_id=int(staff.id),
                permission="finance:staff_codes",
                reason="staff code test",
                granted_by_user_id=int(staff.id),
            )
        )
        template = RedemptionCodeTemplate(
            name=f"VIP Staff Code {suffix}",
            plan="pro",
            tier="vip",
            subject_scope="selected",
            subject_ids_json=[int(subject.id)],
            duration_days=45,
            amount_centimes=12300,
            status="active",
            created_by_user_id=int(staff.id),
            metadata_json={"fixture": suffix},
        )
        db.add(template)
        await db.flush()
        db.add(
            StaffPaymentProfile(
                user_id=int(staff.id),
                display_name="Counter Staff",
                monthly_code_limit=monthly_code_limit,
                monthly_amount_limit_centimes=monthly_amount_limit_centimes,
                allowed_template_ids_json=[int(template.id)],
                metadata_json={"fixture": suffix},
            )
        )
        await db.commit()
        return {
            "staff_id": int(staff.id),
            "staff_token": create_token(staff.id, test_settings),
            "denied_staff_token": create_token(denied_staff.id, test_settings),
            "student_id": int(student.id),
            "student_token": create_token(student.id, test_settings),
            "subject_id": int(subject.id),
            "template_id": int(template.id),
        }


async def _seed_unprofiled_staff_code_fixture(test_settings, *, suffix: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        staff = User(
            email=f"staff-codes-unprofiled-{suffix}@example.com",
            full_name="Unprofiled Staff Codes Agent",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        subject = Subject(
            title=f"Unprofiled Staff Code Subject {suffix}",
            description="",
            is_published=True,
            order=901,
        )
        db.add_all([staff, subject])
        await db.flush()
        db.add(
            UserPermission(
                user_id=int(staff.id),
                permission="finance:staff_codes",
                reason="staff code test",
                granted_by_user_id=int(staff.id),
            )
        )
        template = RedemptionCodeTemplate(
            name=f"Unprofiled Staff Code {suffix}",
            plan="pro",
            tier="pro",
            subject_scope="selected",
            subject_ids_json=[int(subject.id)],
            duration_days=30,
            amount_centimes=9900,
            status="active",
            created_by_user_id=int(staff.id),
            metadata_json={"fixture": suffix},
        )
        db.add(template)
        await db.commit()
        return {
            "staff_id": int(staff.id),
            "staff_token": create_token(staff.id, test_settings),
            "template_id": int(template.id),
        }


async def _set_request_status_by_code(*, code_value: str, status: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        code = await db.scalar(select(RedemptionCode).where(RedemptionCode.code == code_value))
        request = await db.scalar(
            select(StaffPaymentRequest).where(StaffPaymentRequest.redemption_code_id == int(code.id))
        )
        request.status = status
        await db.commit()


async def _redemption_state(*, code_value: str, student_id: int):
    session_factory = get_session_factory()
    async with session_factory() as db:
        code = await db.scalar(select(RedemptionCode).where(RedemptionCode.code == code_value))
        request = await db.scalar(
            select(StaffPaymentRequest).where(StaffPaymentRequest.redemption_code_id == int(code.id))
        )
        transaction = await db.scalar(
            select(PaymentTransaction).where(PaymentTransaction.reference_code == f"CODE-{code_value}")
        )
        ledger_entry = await db.scalar(
            select(FinanceLedgerEntry).where(FinanceLedgerEntry.transaction_id == int(transaction.id))
        )
        entitlement = await db.scalar(
            select(UserSubjectEntitlement).where(UserSubjectEntitlement.user_id == student_id)
        )
        student = await db.get(User, student_id)
        return {
            "code_status": code.status,
            "code_redeemed_by_user_id": int(code.redeemed_by_user_id),
            "request_status": request.status,
            "transaction_provider": transaction.provider,
            "transaction_rail": transaction.rail,
            "transaction_status": transaction.status,
            "transaction_plan": transaction.plan,
            "transaction_amount_centimes": int(transaction.amount_centimes),
            "transaction_metadata": transaction.metadata_json or {},
            "ledger_entry_type": ledger_entry.entry_type,
            "ledger_amount_centimes": int(ledger_entry.amount_centimes),
            "ledger_metadata": ledger_entry.metadata_json or {},
            "entitlement_subject_id": int(entitlement.subject_id),
            "entitlement_status": entitlement.status,
            "student_is_pro": bool(student.is_pro),
            "student_tier": student.tier,
        }


def test_staff_payment_dashboard_request_and_duplicate_reference_contract(app_client, run_db, test_settings):
    fixture = run_db(_seed_staff_code_fixture(test_settings, suffix="request"))

    denied_response = app_client.get(
        "/api/staff/payments/dashboard",
        headers={"Authorization": f"Bearer {fixture['denied_staff_token']}"},
    )
    dashboard_response = app_client.get(
        "/api/staff/payments/dashboard?limit=10",
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )
    create_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "cashplus",
            "provider_reference": " CASHPLUS-STAFF-REQUEST-001 ",
            "amount_centimes": 12300,
            "student_name": " Test Student ",
            "student_phone": " 0600000000 ",
            "student_email": " student@example.com ",
            "proof_url": " https://proof.example/staff-request ",
            "notes": " Paid at front desk ",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )
    duplicate_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "cashplus",
            "provider_reference": "cashplus-staff-request-001",
            "amount_centimes": 12300,
            "student_name": "Second Student",
            "student_phone": "0600000001",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )
    counted_dashboard_response = app_client.get(
        "/api/staff/payments/dashboard?limit=10",
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )

    assert denied_response.status_code == 403
    assert denied_response.json()["detail"] == "Permission required: finance:staff_codes"
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    assert dashboard["profile"]["user_id"] == fixture["staff_id"]
    assert dashboard["profile"]["used_codes_this_month"] == 0
    assert dashboard["profile"]["remaining_codes_this_month"] == 2
    assert [template["id"] for template in dashboard["templates"]] == [fixture["template_id"]]
    assert dashboard["requests"] == []

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["staff_user_id"] == fixture["staff_id"]
    assert created["template_id"] == fixture["template_id"]
    assert created["payment_method"] == "cashplus"
    assert created["provider_reference"] == "CASHPLUS-STAFF-REQUEST-001"
    assert created["student_name"] == "Test Student"
    assert created["student_phone"] == "0600000000"
    assert created["student_email"] == "student@example.com"
    assert created["proof_url"] == "https://proof.example/staff-request"
    assert created["notes"] == "Paid at front desk"
    assert created["status"] == "code_generated"
    assert created["code"]["code"].startswith("KR")
    assert created["code"]["tier"] == "vip"
    assert created["code"]["subject_ids"] == [fixture["subject_id"]]
    assert created["code"]["amount_centimes"] == 12300
    assert created["code"]["status"] == "generated"
    assert created["code"]["expires_at"] is not None

    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["detail"] == "Transfer reference was already used"
    counted_dashboard = counted_dashboard_response.json()
    assert counted_dashboard_response.status_code == 200
    assert counted_dashboard["profile"]["used_codes_this_month"] == 1
    assert counted_dashboard["profile"]["remaining_codes_this_month"] == 1
    assert counted_dashboard["profile"]["used_amount_this_month_centimes"] == 12300
    assert counted_dashboard["profile"]["remaining_amount_this_month_centimes"] == 17700
    assert [request["provider_reference"] for request in counted_dashboard["requests"]] == [
        "CASHPLUS-STAFF-REQUEST-001"
    ]


def test_staff_without_profile_has_no_default_template_authority(app_client, run_db, test_settings):
    fixture = run_db(_seed_unprofiled_staff_code_fixture(test_settings, suffix="default"))

    dashboard_response = app_client.get(
        "/api/staff/payments/dashboard",
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )
    create_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "cashplus",
            "provider_reference": "UNPROFILED-001",
            "amount_centimes": 9900,
            "student_name": "Unprofiled Student",
            "student_phone": "0600000002",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )

    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    assert dashboard["profile"]["monthly_code_limit"] == 0
    assert dashboard["profile"]["remaining_codes_this_month"] == 0
    assert dashboard["templates"] == []
    assert create_response.status_code == 403
    assert create_response.json()["detail"] == "Template is not allowed for this staff member"


def test_selected_redemption_template_requires_subject_ids(app_client, run_db, test_settings):
    fixture = run_db(_seed_staff_code_fixture(test_settings, suffix="selected-empty"))

    response = app_client.post(
        "/api/admin/redemption-templates",
        json={
            "name": "Selected empty",
            "plan": "pro",
            "tier": "pro",
            "subject_scope": "selected",
            "subject_ids": [],
            "duration_days": 30,
            "amount_centimes": 9900,
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )

    assert response.status_code == 422


def test_staff_payment_monthly_code_quota_is_enforced(app_client, run_db, test_settings):
    fixture = run_db(_seed_staff_code_fixture(test_settings, suffix="quota"))

    for index in range(2):
        response = app_client.post(
            "/api/staff/payments/requests",
            json={
                "template_id": fixture["template_id"],
                "payment_method": "cashplus",
                "provider_reference": f"QUOTA-{index}",
                "amount_centimes": 12300,
                "student_name": f"Quota Student {index}",
                "student_phone": f"060000010{index}",
            },
            headers={"Authorization": f"Bearer {fixture['staff_token']}"},
        )
        assert response.status_code == 200

    blocked_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "cashplus",
            "provider_reference": "QUOTA-2",
            "amount_centimes": 12300,
            "student_name": "Quota Student 2",
            "student_phone": "0600000102",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )

    assert blocked_response.status_code == 403
    assert blocked_response.json()["detail"] == "Monthly code quota exceeded"


def test_staff_payment_request_creation_is_route_rate_limited(app_client, run_db, test_settings):
    fixture = run_db(
        _seed_staff_code_fixture(
            test_settings,
            suffix="rate-limit",
            monthly_code_limit=20,
            monthly_amount_limit_centimes=300000,
        )
    )

    for index in range(10):
        response = app_client.post(
            "/api/staff/payments/requests",
            json={
                "template_id": fixture["template_id"],
                "payment_method": "cashplus",
                "provider_reference": f"RATE-LIMIT-{index}",
                "amount_centimes": 12300,
                "student_name": f"Rate Limit Student {index}",
                "student_phone": f"06000002{index:02d}",
            },
            headers={"Authorization": f"Bearer {fixture['staff_token']}"},
        )
        assert response.status_code == 200

    blocked_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "cashplus",
            "provider_reference": "RATE-LIMIT-10",
            "amount_centimes": 12300,
            "student_name": "Rate Limit Student 10",
            "student_phone": "0600000210",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )

    assert blocked_response.status_code == 429


def test_staff_redemption_code_grants_entitlement_and_is_single_use(app_client, run_db, test_settings):
    fixture = run_db(_seed_staff_code_fixture(test_settings, suffix="redeem"))
    create_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "bank-transfer",
            "provider_reference": "BANK-STAFF-REDEEM-001",
            "amount_centimes": 12300,
            "student_name": "Redeeming Student",
            "student_phone": "0611111111",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )
    assert create_response.status_code == 200
    code_value = create_response.json()["code"]["code"]

    redeem_response = app_client.post(
        "/api/payments/redemption-codes/redeem",
        json={"code": f" {code_value.lower()} "},
        headers={"Authorization": f"Bearer {fixture['student_token']}"},
    )
    repeat_response = app_client.post(
        "/api/payments/redemption-codes/redeem",
        json={"code": code_value},
        headers={"Authorization": f"Bearer {fixture['student_token']}"},
    )

    assert redeem_response.status_code == 200
    redeemed = redeem_response.json()
    assert redeemed["code"]["code"] == code_value
    assert redeemed["code"]["status"] == "redeemed"
    assert redeemed["code"]["redeemed_by_user_id"] == fixture["student_id"]
    assert redeemed["transaction_id"] > 0
    assert redeemed["entitlement_count"] == 1
    assert repeat_response.status_code == 409
    assert repeat_response.json()["detail"] == "Redemption code is no longer available"

    state = run_db(_redemption_state(code_value=code_value, student_id=fixture["student_id"]))
    assert state["code_status"] == "redeemed"
    assert state["code_redeemed_by_user_id"] == fixture["student_id"]
    assert state["request_status"] == "redeemed"
    assert state["transaction_provider"] == "bank_transfer"
    assert state["transaction_rail"] == "bank_transfer"
    assert state["transaction_status"] == "paid"
    assert state["transaction_plan"] == "pro"
    assert state["transaction_amount_centimes"] == 12300
    assert state["transaction_metadata"]["source"] == "staff_redemption_code"
    assert state["transaction_metadata"]["staff_user_id"] == fixture["staff_id"]
    assert state["ledger_entry_type"] == "redemption_code_redeemed"
    assert state["ledger_amount_centimes"] == 12300
    assert state["ledger_metadata"]["entitlements_granted"] == 1
    assert state["entitlement_subject_id"] == fixture["subject_id"]
    assert state["entitlement_status"] == "active"
    assert state["student_is_pro"] is True
    assert state["student_tier"] == "vip"


def test_redemption_fails_when_payment_trace_is_not_available(app_client, run_db, test_settings):
    fixture = run_db(_seed_staff_code_fixture(test_settings, suffix="revoked-trace"))
    create_response = app_client.post(
        "/api/staff/payments/requests",
        json={
            "template_id": fixture["template_id"],
            "payment_method": "bank-transfer",
            "provider_reference": "BANK-STAFF-TRACE-001",
            "amount_centimes": 12300,
            "student_name": "Blocked Trace Student",
            "student_phone": "0611111112",
        },
        headers={"Authorization": f"Bearer {fixture['staff_token']}"},
    )
    assert create_response.status_code == 200
    code_value = create_response.json()["code"]["code"]
    run_db(_set_request_status_by_code(code_value=code_value, status="revoked"))

    redeem_response = app_client.post(
        "/api/payments/redemption-codes/redeem",
        json={"code": code_value},
        headers={"Authorization": f"Bearer {fixture['student_token']}"},
    )

    assert redeem_response.status_code == 409
    assert redeem_response.json()["detail"] == "Payment trace is not available for redemption"
