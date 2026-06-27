from datetime import date, datetime, timezone

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.operations import FinanceExpense, RedemptionCode, RedemptionCodeTemplate, StaffPaymentRequest
from app.models.payments import PaymentTransaction
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.services.auth import create_token


async def _seed_founder_dashboard_fixture(test_settings, *, suffix: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        founder = User(
            email=f"founder-ops-{suffix}@example.com",
            full_name="Founder Operator",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        plain_staff = User(
            email=f"founder-ops-plain-{suffix}@example.com",
            full_name="Plain Staff",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        student = User(
            email=f"founder-ops-student-{suffix}@example.com",
            full_name="Founder Ops Student",
            is_active=True,
            is_email_verified=True,
        )
        basic_student = User(
            email=f"founder-ops-basic-{suffix}@example.com",
            full_name="Basic Active Student",
            is_active=True,
            is_email_verified=True,
            tier="basic",
        )
        pro_student = User(
            email=f"founder-ops-pro-{suffix}@example.com",
            full_name="Pro Active Student",
            is_active=True,
            is_email_verified=True,
            tier="pro",
            is_pro=True,
        )
        vip_student = User(
            email=f"founder-ops-vip-{suffix}@example.com",
            full_name="VIP Active Student",
            is_active=True,
            is_email_verified=True,
            tier="vip",
            is_pro=True,
        )
        subject = Subject(title=f"Founder Ops Subject {suffix}", is_published=True, order=999)
        db.add_all([founder, plain_staff, student, basic_student, pro_student, vip_student, subject])
        await db.flush()
        db.add_all(
            [
                UserSubjectEntitlement(user_id=int(basic_student.id), subject_id=int(subject.id), status="active"),
                UserSubjectEntitlement(user_id=int(pro_student.id), subject_id=int(subject.id), status="active"),
                UserSubjectEntitlement(user_id=int(vip_student.id), subject_id=int(subject.id), status="active"),
            ]
        )
        db.add_all(
            [
                UserPermission(
                    user_id=int(founder.id),
                    permission="finance:read",
                    reason="founder ops test",
                    granted_by_user_id=int(founder.id),
                ),
                UserPermission(
                    user_id=int(founder.id),
                    permission="finance:expense_manage",
                    reason="founder ops test",
                    granted_by_user_id=int(founder.id),
                ),
                UserPermission(
                    user_id=int(founder.id),
                    permission="finance:staff_codes",
                    reason="founder ops test",
                    granted_by_user_id=int(founder.id),
                ),
            ]
        )
        template = RedemptionCodeTemplate(
            name=f"Founder Ops Template {suffix}",
            plan="pro",
            tier="pro",
            subject_scope="all",
            subject_ids_json=[],
            duration_days=30,
            amount_centimes=5000,
            status="active",
            created_by_user_id=int(founder.id),
            metadata_json={},
        )
        db.add(template)
        await db.flush()
        code = RedemptionCode(
            code=f"KRFOUNDER{suffix.upper()[:8]}",
            template_id=int(template.id),
            generated_by_user_id=int(founder.id),
            plan="pro",
            tier="pro",
            subject_ids_json=[],
            duration_days=30,
            amount_centimes=5000,
            status="generated",
            metadata_json={"subject_scope": "all"},
            created_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        )
        db.add(code)
        await db.flush()
        db.add_all(
            [
                PaymentTransaction(
                    user_id=int(student.id),
                    provider="cmi",
                    rail="cmi",
                    status="paid",
                    plan="pro",
                    amount_centimes=10000,
                    currency="MAD",
                    reference_code=f"CMI-FOUNDER-{suffix}",
                    instructions_json={},
                    provider_payload_json={},
                    metadata_json={},
                    created_at=datetime(2026, 11, 10, tzinfo=timezone.utc),
                    confirmed_at=None,
                ),
                StaffPaymentRequest(
                    staff_user_id=int(founder.id),
                    template_id=int(template.id),
                    redemption_code_id=int(code.id),
                    payment_method="cashplus",
                    provider_reference=f"STAFF-FOUNDER-{suffix}",
                    amount_centimes=5000,
                    status="code_generated",
                    student_name="WhatsApp Student",
                    student_phone="0600000000",
                    metadata_json={},
                    created_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
                ),
                FinanceExpense(
                    expense_month=date(2026, 11, 1),
                    expense_date=date(2026, 11, 15),
                    category="hosting",
                    vendor="Vercel",
                    amount_centimes=2000,
                    status="paid",
                    source="manual",
                    created_by_user_id=int(founder.id),
                    metadata_json={},
                ),
            ]
        )
        await db.commit()
        return {
            "founder_token": create_token(founder.id, test_settings),
            "plain_staff_token": create_token(plain_staff.id, test_settings),
        }


async def _seed_finance_expense_fixture(test_settings, *, suffix: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        read_staff = User(
            email=f"finance-read-{suffix}@example.com",
            full_name="Finance Reader",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        manage_staff = User(
            email=f"finance-manage-{suffix}@example.com",
            full_name="Finance Manager",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        db.add_all([read_staff, manage_staff])
        await db.flush()
        db.add_all(
            [
                UserPermission(
                    user_id=int(read_staff.id),
                    permission="finance:read",
                    reason="founder ops test",
                    granted_by_user_id=int(read_staff.id),
                ),
                UserPermission(
                    user_id=int(manage_staff.id),
                    permission="finance:expense_manage",
                    reason="founder ops test",
                    granted_by_user_id=int(manage_staff.id),
                ),
            ]
        )
        await db.commit()
        return {
            "read_token": create_token(read_staff.id, test_settings),
            "manage_token": create_token(manage_staff.id, test_settings),
        }


def test_founder_dashboard_permission_and_monthly_finance_math(app_client, run_db, test_settings):
    fixture = run_db(_seed_founder_dashboard_fixture(test_settings, suffix="math"))

    denied_response = app_client.get(
            "/api/admin/founder-dashboard?month=2026-11",
        headers={"Authorization": f"Bearer {fixture['plain_staff_token']}"},
    )
    response = app_client.get(
            "/api/admin/founder-dashboard?month=2026-11",
        headers={"Authorization": f"Bearer {fixture['founder_token']}"},
    )

    assert denied_response.status_code == 403
    assert denied_response.json()["detail"] == "Permission required: finance:read"
    assert response.status_code == 200
    finance = response.json()["finance"]
    assert finance["paid_revenue_centimes"] == 10000
    assert finance["staff_collected_revenue_centimes"] == 5000
    assert finance["expenses_centimes"] == 2000
    assert finance["profit_centimes"] == 13000
    assert finance["mrr_centimes"] == 15000
    assert finance["revenue_by_rail"] == {"cmi": 10000}
    assert finance["expenses_by_category"] == {"hosting": 2000}
    assert response.json()["students_by_status"] == {
        "registered": 1,
        "active_basic": 1,
        "pro": 1,
        "vip": 1,
    }


def test_finance_expense_create_and_read_permissions(app_client, run_db, test_settings):
    fixture = run_db(_seed_finance_expense_fixture(test_settings, suffix="expense"))

    blocked_response = app_client.post(
        "/api/admin/finance/expenses",
        json={
            "expense_date": "2026-07-15",
            "category": "ai",
            "amount_centimes": 3450,
        },
        headers={"Authorization": f"Bearer {fixture['read_token']}"},
    )
    create_response = app_client.post(
        "/api/admin/finance/expenses",
        json={
            "expense_date": "2026-07-15",
            "category": " AI ",
            "vendor": "OpenAI",
            "description": "AI tutoring credits",
            "amount_centimes": 3450,
            "source": "manual",
            "status": "paid",
        },
        headers={"Authorization": f"Bearer {fixture['manage_token']}"},
    )
    list_response = app_client.get(
        "/api/admin/finance/expenses?month=2026-07",
        headers={"Authorization": f"Bearer {fixture['read_token']}"},
    )

    assert blocked_response.status_code == 403
    assert blocked_response.json()["detail"] == "Permission required: finance:expense_manage"
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["category"] == "ai"
    assert created["vendor"] == "OpenAI"
    assert created["amount_centimes"] == 3450
    assert list_response.status_code == 200
    assert [expense["id"] for expense in list_response.json()] == [created["id"]]
