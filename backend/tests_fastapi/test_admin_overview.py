import asyncio
import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import select

from app.database import get_session_factory
from app.admin.views import (
    AdminAuditLogAdmin,
    DailyQuestAdmin,
    QuizAttemptAdmin,
    TopicItemAdmin,
    UserAdmin,
    UserXPAdmin,
)
from app.models.courses import Subject, Topic, TopicItem, TopicSection
from app.models.gamification import QuizAttempt, TopicItemProgress, UserXP
from app.models.admin_audit import AdminAuditLog
from app.models.payments import (
    FinanceLedgerEntry,
    PaymentProviderEvent,
    PaymentReconciliationImport,
    PaymentTransaction,
    RefundRequest,
)
from app.models.professor import (
    CourseOffering,
    LiveSession,
    LiveSessionInteraction,
    ProfessorChatConversation,
    ProfessorChatMessage,
    ProgramTrack,
)
from app.models.reports import ContentReport
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.services.auth import create_token


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ADMIN_ROUTER = BACKEND_ROOT / "app" / "routers" / "admin.py"
ADMIN_OVERVIEW_SERVICE = BACKEND_ROOT / "app" / "services" / "admin_overview.py"


async def _permission_audits_for_permission(permission_id: int) -> list[AdminAuditLog]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.model_name == "UserPermission",
                AdminAuditLog.object_pk == str(permission_id),
            )
            .order_by(AdminAuditLog.id.asc())
        )
        return list(result.scalars().all())


def test_admin_overview_requires_staff_and_returns_catalog(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            student = User(
                email="admin-overview-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
            )
            staff = User(
                email="admin-overview-staff@example.com",
                full_name="Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            unverified_staff = User(
                email="admin-overview-unverified-staff@example.com",
                full_name="Unverified Staff",
                is_active=True,
                is_email_verified=False,
                is_staff=True,
            )
            subject = Subject(title="Admin Physics", is_published=True, order=99)
            db.add_all([student, staff, unverified_staff, subject])
            await db.flush()
            track = ProgramTrack(niveau="2BAC", filiere="SM", title="2BAC SM", status="active")
            db.add(track)
            await db.flush()
            offering = CourseOffering(
                subject_id=subject.id,
                track_id=track.id,
                professor_user_id=staff.id,
                title="Admin Physics - 2BAC SM",
                status="active",
            )
            db.add(offering)
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="admin-overview-topic",
                title="Admin Overview Topic",
                status="published",
                order=99,
            )
            empty_topic = Topic(
                subject_id=subject.id,
                slug="admin-overview-empty-topic",
                title="Admin Overview Empty Topic",
                status="published",
                order=100,
            )
            db.add_all([topic, empty_topic])
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            topic_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Admin Overview Item",
                item_type="reading",
                status="published",
            )
            db.add(topic_item)
            await db.flush()
            db.add(
                UserSubjectEntitlement(
                    user_id=student.id,
                    subject_id=subject.id,
                    source="test",
                    status="active",
                )
            )
            db.add(
                QuizAttempt(
                    user_id=student.id,
                    subject_id=subject.id,
                    topic_id=topic.id,
                    topic_item_id=topic_item.id,
                    source_type="tab",
                    score=90,
                    passed=True,
                    answers={},
                    grading={},
                )
            )
            db.add(
                TopicItemProgress(
                    user_id=student.id,
                    topic_id=topic.id,
                    topic_item_id=topic_item.id,
                    status="completed",
                    watched_seconds=120,
                )
            )
            paid_transaction = PaymentTransaction(
                user_id=student.id,
                provider="cashplus",
                rail="cashplus",
                status="paid",
                plan="pro",
                amount_centimes=9900,
                currency="MAD",
                reference_code="ADMIN-PAID-OVERVIEW",
            )
            pending_transaction = PaymentTransaction(
                user_id=student.id,
                provider="bank_transfer",
                rail="bank_transfer",
                status="pending_manual_review",
                plan="pro",
                amount_centimes=19900,
                currency="MAD",
                reference_code="ADMIN-PENDING-OVERVIEW",
            )
            db.add_all([paid_transaction, pending_transaction])
            await db.flush()
            db.add_all([
                PaymentProviderEvent(
                    transaction_id=paid_transaction.id,
                    provider="cashplus",
                    event_id="admin-overview-provider-event",
                    event_type="manual.approved",
                    status="processed",
                ),
                PaymentReconciliationImport(
                    provider="bank_transfer",
                    rail="bank_transfer",
                    source_name="admin-overview-import",
                    status="processed",
                    row_count=1,
                    matched_count=1,
                    created_by_user_id=staff.id,
                ),
                FinanceLedgerEntry(
                    transaction_id=paid_transaction.id,
                    user_id=student.id,
                    entry_type="payment_confirmed",
                    amount_centimes=9900,
                    currency="MAD",
                    reason="Admin overview seed",
                ),
                RefundRequest(
                    transaction_id=paid_transaction.id,
                    user_id=student.id,
                    provider="cashplus",
                    rail="cashplus",
                    amount_centimes=9900,
                    currency="MAD",
                    status="requested",
                    reason="Admin overview refund check",
                    requested_by_user_id=student.id,
                ),
            ])
            conversation = ProfessorChatConversation(
                course_offering_id=offering.id,
                professor_user_id=staff.id,
                student_user_id=student.id,
                status="open",
                last_message_preview="Please review this proof.",
                unread_for_professor=2,
                unread_for_student=1,
            )
            db.add(conversation)
            await db.flush()
            db.add(
                ProfessorChatMessage(
                    conversation_id=conversation.id,
                    sender_user_id=student.id,
                    body="Please review this proof.",
                    status="sent",
                )
            )
            now = datetime.now(timezone.utc)
            live_session = LiveSession(
                course_offering_id=offering.id,
                professor_user_id=staff.id,
                title="Admin overview live",
                starts_at=now + timedelta(hours=1),
                ends_at=now + timedelta(hours=2),
                status="live",
            )
            db.add(live_session)
            await db.flush()
            db.add(
                LiveSessionInteraction(
                    live_session_id=live_session.id,
                    course_offering_id=offering.id,
                    professor_user_id=staff.id,
                    student_user_id=student.id,
                    kind="question",
                    body="Can you repeat this step?",
                    status="pending",
                )
            )
            db.add(
                ContentReport(
                    reporter_user_id=student.id,
                    target_type="live_message",
                    target_id="admin-overview-live-message",
                    reason="bug",
                    status="open",
                    priority="urgent",
                    title="Live message issue",
                    idempotency_key="admin-overview-report",
                )
            )
            await db.commit()
            return (
                create_token(student.id, test_settings),
                create_token(staff.id, test_settings),
                create_token(unverified_staff.id, test_settings),
            )

    student_token, staff_token, unverified_staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    unverified_blocked = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {unverified_staff_token}"},
    )
    assert unverified_blocked.status_code == 403

    response = app_client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["totals"]["users"] >= 2
    assert data["totals"]["subjects"] >= 1
    assert data["totals"]["quiz_attempts"] >= 1
    assert data["totals"]["quiz_results"] >= 1
    assert data["content_status"]["topics"]["published"] >= 1
    assert "engagement" in data
    assert data["engagement"]["active_users_7d"] >= 1
    assert data["engagement"]["quiz_attempt_pass_rate"] > 0
    assert data["engagement"]["quiz_result_pass_rate"] > 0
    assert "progress_xp" in data
    assert data["finance"]["pending_manual_review"] >= 1
    assert data["finance"]["paid_revenue_centimes"] >= 9900
    assert data["finance"]["transactions_by_status"]["paid"] >= 1
    assert data["finance"]["open_refund_requests"] >= 1
    assert data["communications"]["chat_unread_for_professors"] >= 2
    assert data["communications"]["chat_unread_for_students"] >= 1
    assert data["communications"]["pending_live_interactions"] >= 1
    assert data["communications"]["open_reports"] >= 1
    assert data["communications"]["urgent_open_reports"] >= 1
    assert "admin_audit" in data
    assert data["ops_readiness"]["access"]["active_entitlements_now"] >= 1
    assert data["ops_readiness"]["access"]["users_with_entitlement_rows"] >= 1
    assert data["ops_readiness"]["content_gaps"]["topics_without_items"] >= 1
    assert data["ops_readiness"]["local_validation"] == {
        "mode": "local_only",
        "deployment_checks": "paused",
        "build_check": "skipped_by_policy",
    }

    topic_item = next(item for item in data["crud_catalog"] if item["model"] == "TopicItem")
    assert topic_item["admin_url"] == "/admin/topic-item/list"
    assert topic_item["actions"] == {
        "create": True,
        "read": True,
        "update": True,
        "delete": True,
    }

    audit_log = next(item for item in data["crud_catalog"] if item["model"] == "AdminAuditLog")
    assert audit_log["admin_url"] == "/admin/admin-audit-log/list"
    assert audit_log["actions"] == {
        "create": False,
        "read": True,
        "update": False,
        "delete": False,
    }


def test_admin_activity_requires_staff_and_returns_recent_audit_rows(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = User(
                email="admin-activity-student@example.com",
                full_name="Activity Student",
                is_active=True,
                is_email_verified=True,
            )
            staff = User(
                email="admin-activity-staff@example.com",
                full_name="Activity Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add_all([student, staff])
            await db.flush()
            now = datetime.now(timezone.utc)
            db.add_all([
                AdminAuditLog(
                    action="permission_grant",
                    model_name="UserPermission",
                    object_pk="41",
                    object_repr=f"{staff.id}:finance:read",
                    changed_data={
                        "actor_user_id": staff.id,
                        "permission": "finance:read",
                        "reason": "activity test",
                    },
                    request_path="/api/admin/permissions",
                    client_host="127.0.0.1",
                    note=f"admin_user_id={staff.id}",
                    created_at=now,
                ),
                AdminAuditLog(
                    action="report_update",
                    model_name="ContentReport",
                    object_pk="7",
                    object_repr="Live report",
                    changed_data={
                        "actor_user_id": staff.id,
                        "status": "resolved",
                        "resolution_note": "handled in activity test",
                    },
                    request_path="/api/admin/reports/7",
                    client_host="127.0.0.1",
                    note=f"admin_user_id={staff.id}",
                    created_at=now - timedelta(hours=2),
                ),
            ])
            await db.commit()
            return create_token(student.id, test_settings), create_token(staff.id, test_settings), staff.id

    student_token, staff_token, staff_id = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/activity",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    response = app_client.get(
        "/api/admin/activity?limit=20",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["total_audit_rows"] >= 2
    assert data["summary"]["created_24h"] >= 2
    assert data["summary"]["actors_in_feed"] >= 1
    assert data["by_action"]["permission_grant"] >= 1
    assert data["by_model"]["UserPermission"] >= 1
    entry = next(item for item in data["entries"] if item["action"] == "permission_grant")
    assert entry["actor_user_id"] == staff_id
    assert entry["request_path"] == "/api/admin/permissions"
    assert "permission" in entry["changed_keys"]
    assert entry["changed_data"]["reason"] == "activity test"
    assert "finance:read" in entry["summary"]


def test_admin_student_progress_requires_staff_and_returns_student_rows(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = User(
                email="admin-progress-student@example.com",
                full_name="Progress Student",
                niveau="2BAC",
                filiere="SM",
                tier="vip",
                is_pro=True,
                is_active=True,
                is_email_verified=True,
            )
            staff = User(
                email="admin-progress-staff@example.com",
                full_name="Progress Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            subject = Subject(title="Admin Progress Physics", is_published=True, order=199)
            db.add_all([student, staff, subject])
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="admin-progress-topic",
                title="Admin Progress Topic",
                status="published",
                order=1,
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Admin Progress Item",
                item_type="reading",
                status="published",
            )
            db.add(item)
            await db.flush()
            db.add(UserXP(user_id=student.id, total_xp=420, streak_days=6))
            db.add(
                TopicItemProgress(
                    user_id=student.id,
                    topic_id=topic.id,
                    topic_item_id=item.id,
                    status="completed",
                    watched_seconds=600,
                    best_score=90,
                    latest_score=90,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            db.add(
                QuizAttempt(
                    user_id=student.id,
                    subject_id=subject.id,
                    topic_id=topic.id,
                    topic_item_id=item.id,
                    source_type="tab",
                    score=80,
                    passed=True,
                    answers={},
                    grading={},
                )
            )
            await db.commit()
            return create_token(student.id, test_settings), create_token(staff.id, test_settings)

    student_token, staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/student-progress",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    response = app_client.get(
        "/api/admin/student-progress?limit=10",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["total_students"] >= 1
    assert data["summary"]["active_students_7d"] >= 1
    assert data["summary"]["completed_topic_items"] >= 1
    assert data["summary"]["total_watch_minutes"] >= 10
    assert data["summary"]["quiz_attempts"] >= 1
    assert data["summary"]["quiz_passed"] >= 1
    assert data["progress_by_status"]["completed"] >= 1
    row = next(item for item in data["students"] if item["email"] == "admin-progress-student@example.com")
    assert row["full_name"] == "Progress Student"
    assert row["total_xp"] == 420
    assert row["streak_days"] == 6
    assert row["completed_items"] >= 1
    assert row["watched_minutes"] >= 10
    assert row["quiz_attempts"] >= 1
    assert row["quiz_passed"] >= 1


def test_admin_communications_requires_staff_and_returns_queues(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = User(
                email="admin-communications-student@example.com",
                full_name="Comms Student",
                is_active=True,
                is_email_verified=True,
            )
            staff = User(
                email="admin-communications-staff@example.com",
                full_name="Comms Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            subject = Subject(title="Admin Communications Physics", is_published=True, order=299)
            db.add_all([student, staff, subject])
            await db.flush()
            track = ProgramTrack(niveau="2BAC-COM", filiere="SM-COMMS", title="2BAC SM Comms", status="active")
            db.add(track)
            await db.flush()
            offering = CourseOffering(
                subject_id=subject.id,
                track_id=track.id,
                professor_user_id=staff.id,
                title="Comms Offering",
                status="active",
            )
            db.add(offering)
            await db.flush()
            conversation = ProfessorChatConversation(
                course_offering_id=offering.id,
                professor_user_id=staff.id,
                student_user_id=student.id,
                status="open",
                last_message_preview="Please check this live question.",
                unread_for_professor=3,
                unread_for_student=1,
            )
            db.add(conversation)
            await db.flush()
            db.add(
                ProfessorChatMessage(
                    conversation_id=conversation.id,
                    sender_user_id=student.id,
                    body="Please check this live question.",
                    status="sent",
                )
            )
            now = datetime.now(timezone.utc)
            live_session = LiveSession(
                course_offering_id=offering.id,
                professor_user_id=staff.id,
                title="Comms Live Session",
                starts_at=now - timedelta(minutes=10),
                ends_at=now + timedelta(minutes=50),
                status="live",
            )
            db.add(live_session)
            await db.flush()
            db.add(
                LiveSessionInteraction(
                    live_session_id=live_session.id,
                    course_offering_id=offering.id,
                    professor_user_id=staff.id,
                    student_user_id=student.id,
                    kind="question",
                    body="Can you repeat the proof?",
                    status="pending",
                )
            )
            db.add(
                ContentReport(
                    reporter_user_id=student.id,
                    target_type="live_message",
                    target_id="admin-communications-live-message",
                    reason="bug",
                    status="open",
                    priority="urgent",
                    title="Comms report",
                    description="Live chat needs moderation",
                    idempotency_key="admin-communications-report",
                )
            )
            await db.commit()
            return create_token(student.id, test_settings), create_token(staff.id, test_settings)

    student_token, staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/communications",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    response = app_client.get(
        "/api/admin/communications?limit=10",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["unread_for_professors"] >= 3
    assert data["summary"]["pending_live_interactions"] >= 1
    assert data["summary"]["open_reports"] >= 1
    assert data["summary"]["urgent_open_reports"] >= 1
    assert data["chat_conversations_by_status"]["open"] >= 1
    assert data["live_interactions_by_status"]["pending"] >= 1
    assert data["reports_by_priority"]["urgent"] >= 1
    assert any(item["last_message_preview"] == "Please check this live question." for item in data["conversations"])
    assert any(item["body"] == "Can you repeat the proof?" for item in data["live_interactions"])
    assert any(item["title"] == "Comms report" for item in data["reports"])


def test_admin_users_access_requires_staff_and_returns_user_rows(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = User(
                email="admin-users-student@example.com",
                full_name="Users Student",
                tier="pro",
                is_pro=True,
                is_active=True,
                is_email_verified=True,
            )
            staff = User(
                email="admin-users-staff@example.com",
                full_name="Users Staff",
                role="admin",
                tier="vip",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            subject = Subject(title="Admin Users Physics", is_published=True, order=399)
            db.add_all([student, staff, subject])
            await db.flush()
            db.add(
                UserSubjectEntitlement(
                    user_id=student.id,
                    subject_id=subject.id,
                    status="active",
                    source="manual",
                    ends_at=datetime.now(timezone.utc) + timedelta(days=30),
                )
            )
            db.add(
                UserPermission(
                    user_id=staff.id,
                    permission="users:read",
                    status="active",
                    reason="Admin users access test",
                    granted_by_user_id=staff.id,
                )
            )
            db.add(
                PaymentTransaction(
                    user_id=student.id,
                    provider="cashplus",
                    rail="cashplus",
                    status="paid",
                    plan="pro",
                    amount_centimes=9900,
                    currency="MAD",
                    reference_code="ADMIN-USERS-PAID",
                )
            )
            await db.commit()
            return create_token(student.id, test_settings), create_token(staff.id, test_settings)

    student_token, staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/users-access",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    response = app_client.get(
        "/api/admin/users-access?limit=25",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["total_users"] >= 2
    assert data["summary"]["active_users"] >= 2
    assert data["summary"]["verified_users"] >= 2
    assert data["summary"]["staff_users"] >= 1
    assert data["summary"]["pro_users"] >= 1
    assert data["summary"]["active_entitlements"] >= 1
    assert data["summary"]["active_permissions"] >= 1
    assert data["summary"]["paid_revenue_centimes"] >= 9900
    assert data["users_by_role"]["admin"] >= 1
    assert data["users_by_tier"]["pro"] >= 1
    student_row = next(item for item in data["users"] if item["email"] == "admin-users-student@example.com")
    assert student_row["active_entitlements"] == 1
    assert student_row["payment_count"] == 1
    assert student_row["paid_revenue_centimes"] == 9900
    staff_row = next(item for item in data["users"] if item["email"] == "admin-users-staff@example.com")
    assert staff_row["active_permissions"] >= 1
    assert "users:read" in staff_row["active_permission_names"]
    assert any(
        item["permission"] == "users:read" and item["reason"] == "Admin users access test"
        for item in staff_row["permissions"]
    )


def test_admin_permission_management_requires_roles_manage(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = User(
                email="permission-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
            )
            staff = User(
                email="permission-plain-staff@example.com",
                full_name="Plain Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            manager = User(
                email="permission-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add_all([student, staff, manager])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return (
                manager.id,
                staff.id,
                create_token(student.id, test_settings),
                create_token(staff.id, test_settings),
                create_token(manager.id, test_settings),
            )

    manager_id, staff_id, student_token, staff_token, manager_token = run_db(_seed())

    student_response = app_client.get(
        "/api/admin/permissions",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    staff_response = app_client.get(
        "/api/admin/permissions",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    manager_response = app_client.get(
        f"/api/admin/permissions?user_id={manager_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    grant_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": staff_id, "permission": "finance:read", "reason": "finance viewer"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert student_response.status_code == 403
    assert student_response.json()["detail"] == "Staff access required"
    assert staff_response.status_code == 403
    assert staff_response.json()["detail"] == "Permission required: roles:manage"
    assert manager_response.status_code == 200
    assert [item["permission"] for item in manager_response.json()] == ["roles:manage"]
    assert grant_response.status_code == 200
    grant = grant_response.json()
    assert grant["user_id"] == staff_id
    assert grant["permission"] == "finance:read"
    assert grant["status"] == "active"
    assert grant["reason"] == "finance viewer"


def test_admin_permission_grant_revoke_and_reactivate(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-cycle-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            target = User(
                email="permission-cycle-target@example.com",
                full_name="Target Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add_all([manager, target])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return manager.id, target.id, create_token(manager.id, test_settings)

    manager_id, target_id, manager_token = run_db(_seed())
    headers = {"Authorization": f"Bearer {manager_token}"}

    unsupported_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:typo", "reason": "typo"},
        headers=headers,
    )
    grant_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:export", "reason": "export access"},
        headers=headers,
    )
    permission_id = grant_response.json()["id"]
    revoke_response = app_client.post(
        f"/api/admin/permissions/{permission_id}/revoke",
        json={"reason": "remove export access"},
        headers=headers,
    )
    repeat_revoke_response = app_client.post(
        f"/api/admin/permissions/{permission_id}/revoke",
        json={"reason": "already removed"},
        headers=headers,
    )
    reactivate_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:export", "reason": "restore export access"},
        headers=headers,
    )
    list_response = app_client.get(
        f"/api/admin/permissions?user_id={target_id}&status=active",
        headers=headers,
    )
    missing_response = app_client.post(
        "/api/admin/permissions/999999999/revoke",
        json={"reason": "bad id, not a permission id"},
        headers=headers,
    )
    xp_grant_response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "xp:adjust", "reason": "xp correction access"},
        headers=headers,
    )

    assert unsupported_response.status_code == 400
    assert unsupported_response.json()["detail"] == "Unsupported permission"
    assert grant_response.status_code == 200
    assert grant_response.json()["granted_by_user_id"] == manager_id
    assert revoke_response.status_code == 200
    assert revoke_response.json()["status"] == "revoked"
    assert revoke_response.json()["reason"] == "remove export access"
    assert revoke_response.json()["revoked_at"] is not None
    assert repeat_revoke_response.status_code == 200
    assert repeat_revoke_response.json()["status"] == "revoked"
    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["id"] == permission_id
    assert reactivate_response.json()["status"] == "active"
    assert reactivate_response.json()["revoked_at"] is None
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [permission_id]
    assert missing_response.status_code == 404
    assert xp_grant_response.status_code == 200
    assert xp_grant_response.json()["permission"] == "xp:adjust"
    assert xp_grant_response.json()["granted_by_user_id"] == manager_id
    audits = run_db(_permission_audits_for_permission(permission_id))
    assert [audit.action for audit in audits] == [
        "permission_grant",
        "permission_revoke",
        "permission_noop",
        "permission_restore",
    ]
    assert [audit.changed_data["actor_user_id"] for audit in audits] == [manager_id] * 4
    assert audits[0].changed_data["reason"] == "export access"
    assert audits[1].changed_data["reason"] == "remove export access"
    assert audits[2].changed_data["reason"] == "already removed"
    assert audits[3].changed_data["reason"] == "restore export access"


def test_admin_permission_grants_require_active_verified_staff_targets(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-target-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            student = User(
                email="permission-target-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
            )
            inactive_staff = User(
                email="permission-target-inactive@example.com",
                full_name="Inactive Staff",
                is_active=False,
                is_email_verified=True,
                is_staff=True,
            )
            unverified_staff = User(
                email="permission-target-unverified@example.com",
                full_name="Unverified Staff",
                is_active=True,
                is_email_verified=False,
                is_staff=True,
            )
            db.add_all([manager, student, inactive_staff, unverified_staff])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return (
                student.id,
                inactive_staff.id,
                unverified_staff.id,
                create_token(manager.id, test_settings),
            )

    student_id, inactive_staff_id, unverified_staff_id, manager_token = run_db(_seed())
    headers = {"Authorization": f"Bearer {manager_token}"}

    responses = [
        app_client.post(
            "/api/admin/permissions",
            json={"user_id": user_id, "permission": "finance:read", "reason": "invalid target"},
            headers=headers,
        )
        for user_id in (student_id, inactive_staff_id, unverified_staff_id)
    ]

    for response in responses:
        assert response.status_code == 400
        assert response.json()["detail"] == "Permissions can only be granted to active verified staff"


def test_admin_permission_grant_recovers_from_duplicate_race(monkeypatch, app_client, run_db, test_settings):
    import app.services.admin_permissions as admin_permissions

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-race-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            target = User(
                email="permission-race-target@example.com",
                full_name="Race Target",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add_all([manager, target])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            db.add(
                UserPermission(
                    user_id=target.id,
                    permission="finance:read",
                    status="revoked",
                    reason="existing race row",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return target.id, create_token(manager.id, test_settings)

    target_id, manager_token = run_db(_seed())
    original_load = admin_permissions._load_user_permission
    calls = {"count": 0}

    async def racey_load(db, *, user_id, permission):
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return await original_load(db, user_id=user_id, permission=permission)

    monkeypatch.setattr(admin_permissions, "_load_user_permission", racey_load)

    response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": target_id, "permission": "finance:read", "reason": "recover race"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["reason"] == "recover race"


def test_admin_permission_manager_cannot_grant_permissions_to_self(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-self-grant-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add(manager)
            await db.flush()
            db.add(
                UserPermission(
                    user_id=manager.id,
                    permission="roles:manage",
                    status="active",
                    reason="seed manager",
                    granted_by_user_id=manager.id,
                )
            )
            await db.commit()
            return manager.id, create_token(manager.id, test_settings)

    manager_id, manager_token = run_db(_seed())

    response = app_client.post(
        "/api/admin/permissions",
        json={"user_id": manager_id, "permission": "finance:refund", "reason": "self escalate"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot grant permissions to yourself"


def test_admin_permission_manager_cannot_revoke_own_roles_manage(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            manager = User(
                email="permission-self-manager@example.com",
                full_name="Permission Manager",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add(manager)
            await db.flush()
            grant = UserPermission(
                user_id=manager.id,
                permission="roles:manage",
                status="active",
                reason="seed manager",
                granted_by_user_id=manager.id,
            )
            db.add(grant)
            await db.commit()
            await db.refresh(grant)
            return grant.id, create_token(manager.id, test_settings)

    permission_id, manager_token = run_db(_seed())

    response = app_client.post(
        f"/api/admin/permissions/{permission_id}/revoke",
        json={"reason": "remove myself"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot revoke your own roles:manage permission"


def test_admin_overview_does_not_parallelize_group_by_breakdowns():
    tree = ast.parse(ADMIN_OVERVIEW_SERVICE.read_text(encoding="utf-8"))
    violations: list[int] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Name) or node.func.id != "_gather_reads":
            continue
        if any(_calls_function(arg, "_breakdown") for arg in node.args):
            violations.append(node.lineno)

    assert violations == []


def test_admin_overview_caps_parallel_database_reads():
    from app.services import admin_overview

    assert admin_overview.ADMIN_OVERVIEW_PARALLELISM <= 2


def test_admin_overview_batches_metric_reads_by_phase(monkeypatch, run_db):
    from app.services import admin_overview

    calls = 0
    original_run_read = admin_overview._run_read

    async def counted_run_read(operation):
        nonlocal calls
        calls += 1
        return await original_run_read(operation)

    async def build_empty_overview():
        session_factory = get_session_factory()
        async with session_factory() as db:
            return await admin_overview.build_admin_overview(db)

    monkeypatch.setattr(admin_overview, "_run_read", counted_run_read)

    overview = run_db(build_empty_overview())

    assert overview.totals["users"] >= 0
    assert calls <= 20


def test_admin_overview_gather_reads_keeps_partial_results(monkeypatch, run_db):
    from app.services import admin_overview

    async def fake_run_read(operation):
        return await operation(None)

    async def ok(_session):
        return 7

    async def failed(_session):
        raise TimeoutError("slow admin panel")

    async def also_ok(_session):
        return 11

    warnings = []
    monkeypatch.setattr(admin_overview, "_run_read", fake_run_read)
    monkeypatch.setattr(admin_overview.logger, "warning", lambda *args, **kwargs: warnings.append((args, kwargs)))

    result = run_db(admin_overview._gather_reads(ok, failed, also_ok))

    assert result == [7, 0, 11]
    assert any(
        args[:2] == ("Admin overview read operation %s failed; using zero fallback", 1)
        for args, _kwargs in warnings
    )


def test_admin_overview_gather_reads_propagates_cancellation(monkeypatch, run_db):
    from app.services import admin_overview

    async def fake_run_read(operation):
        return await operation(None)

    async def cancelled(_session):
        raise asyncio.CancelledError()

    monkeypatch.setattr(admin_overview, "_run_read", fake_run_read)

    with pytest.raises(asyncio.CancelledError):
        run_db(admin_overview._gather_reads(cancelled))


def test_admin_overview_router_stays_thin():
    router_source = ADMIN_ROUTER.read_text(encoding="utf-8")
    tree = ast.parse(router_source)

    function_names = [
        node.name for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]

    assert function_names == [
        "get_admin_overview",
        "get_admin_activity",
        "get_admin_student_progress",
        "get_admin_communications",
        "get_admin_users_access",
        "list_permissions",
        "grant_permission",
        "revoke_permission",
        "create_admin_xp_adjustment",
        "get_admin_xp_audit",
        "list_reports",
        "update_report",
        "moderate_reported_comment",
        "moderate_reported_live_message",
        "list_professor_change_requests_admin",
        "get_professor_change_request_admin",
        "review_professor_change_request_admin",
    ]
    assert "build_admin_overview" in router_source
    assert "build_admin_activity" in router_source
    assert "build_admin_student_progress" in router_source
    assert "build_admin_communications" in router_source
    assert "build_admin_users_access" in router_source
    assert "list_user_permissions" in router_source
    assert "grant_user_permission" in router_source
    assert "revoke_user_permission" in router_source
    assert "create_xp_adjustment" in router_source
    assert "build_admin_xp_audit" in router_source
    assert "list_admin_content_reports" in router_source
    assert "update_admin_content_report" in router_source
    assert "apply_reported_comment_moderation_action" in router_source
    assert "apply_reported_live_message_moderation_action" in router_source
    assert "list_admin_change_requests" in router_source
    assert "get_admin_change_request_detail" in router_source
    assert "review_admin_change_request" in router_source
    assert "_ops_readiness" not in router_source
    assert "_gather_reads" not in router_source
    assert "select(" not in router_source


def test_power_admin_views_are_searchable_filterable_and_safe():
    assert "password" not in [column.key for column in UserAdmin.column_list]
    assert "password" not in [column.key for column in UserAdmin.column_searchable_list]
    assert {
        "auth_token_version",
        "is_staff",
        "is_superuser",
    }.issubset(set(UserAdmin.form_excluded_columns))
    assert "role" in UserAdmin.form_overrides
    assert "admin" not in UserAdmin._NON_PRIVILEGED_ROLES
    assert {"role", "niveau", "filiere", "is_staff", "is_active"}.issubset(
        {column_filter.column.key for column_filter in UserAdmin.column_filters}
    )
    assert UserAdmin.can_create is False
    assert UserAdmin.can_edit is True
    assert UserAdmin.can_delete is False

    assert {"title", "description", "item_type", "renderer_key", "status"}.issubset(
        {column.key for column in TopicItemAdmin.column_searchable_list}
    )
    assert {"id", "topic_id", "status", "created_at"}.issubset(
        {column.key for column in TopicItemAdmin.column_sortable_list}
    )
    assert TopicItemAdmin.can_create is True
    assert TopicItemAdmin.can_edit is True
    assert TopicItemAdmin.can_delete is True
    assert TopicItemAdmin.can_export is True
    assert TopicItemAdmin.page_size == 50

    assert AdminAuditLogAdmin.can_create is False
    assert AdminAuditLogAdmin.can_edit is False
    assert AdminAuditLogAdmin.can_delete is False
    for view in (UserXPAdmin, DailyQuestAdmin, QuizAttemptAdmin):
        assert view.can_create is False
        assert view.can_edit is False
        assert view.can_delete is False


def test_power_admin_view_has_defense_in_depth_accessibility_check():
    user_admin = UserAdmin()

    class Request:
        session = {}

    assert user_admin.is_accessible(Request()) is False
    assert user_admin.is_visible(Request()) is False

    Request.session = {"admin_authenticated": True, "admin_user_id": 123}

    assert user_admin.is_accessible(Request()) is True
    assert user_admin.is_visible(Request()) is True


def _calls_function(node: ast.AST, name: str) -> bool:
    return any(
        isinstance(child, ast.Call)
        and isinstance(child.func, ast.Name)
        and child.func.id == name
        for child in ast.walk(node)
    )
