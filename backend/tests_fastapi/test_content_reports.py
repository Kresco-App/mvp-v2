from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.courses import Subject
from app.models.exercises import Exercise
from app.models.professor import CourseOffering, LiveSession, LiveSessionInteraction, ProgramTrack, RealtimeOutbox
from app.models.reports import ContentReport
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.services.auth import create_token

BACKEND_ROOT = Path(__file__).resolve().parents[1]


async def _count_reports_for_user(user_id: int) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(ContentReport).where(ContentReport.reporter_user_id == int(user_id)))
        return len(result.scalars().all())


async def _latest_report_audit(report_id: int) -> AdminAuditLog | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.scalar(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.action == "report_update",
                AdminAuditLog.model_name == "ContentReport",
                AdminAuditLog.object_pk == str(report_id),
            )
            .order_by(AdminAuditLog.id.desc())
            .limit(1)
        )


async def _latest_comment_moderation_audit(comment_id: int) -> AdminAuditLog | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.scalar(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.action == "comment_moderation",
                AdminAuditLog.model_name == "Comment",
                AdminAuditLog.object_pk == str(comment_id),
            )
            .order_by(AdminAuditLog.id.desc())
            .limit(1)
        )


async def _latest_live_message_moderation_audit(interaction_id: int) -> AdminAuditLog | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.scalar(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.action == "live_message_moderation",
                AdminAuditLog.model_name == "LiveSessionInteraction",
                AdminAuditLog.object_pk == str(interaction_id),
            )
            .order_by(AdminAuditLog.id.desc())
            .limit(1)
        )


async def _latest_live_interaction_outbox(
    live_session_id: int,
    interaction_id: int,
    event_name: str,
) -> RealtimeOutbox | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(RealtimeOutbox)
            .where(
                RealtimeOutbox.channel == f"kresco:live:{live_session_id}",
                RealtimeOutbox.event_name == event_name,
            )
            .order_by(RealtimeOutbox.id.desc())
        )
        for event in result.scalars().all():
            if event.payload_json.get("id") == interaction_id:
                return event
        return None


async def _seed_reportable_exercises() -> dict[str, int]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        slug_suffix = uuid4().hex[:8]
        subject = Subject(title=f"Reportable Physics {slug_suffix}", is_published=True, order=77)
        db.add(subject)
        await db.flush()
        exercises = [
            Exercise(
                subject_id=subject.id,
                title=f"Reportable Exercise {index}",
                slug=f"reportable-exercise-{slug_suffix}-{index}",
                status="published",
                is_free_preview=True,
                statement_body="Statement",
                solution_body="Solution",
            )
            for index in range(1, 4)
        ]
        db.add_all(exercises)
        await db.flush()
        exercise_ids = [int(exercise.id) for exercise in exercises]
        await db.commit()
        return {
            "subject_id": int(subject.id),
            "first_exercise_id": exercise_ids[0],
            "second_exercise_id": exercise_ids[1],
            "third_exercise_id": exercise_ids[2],
        }


async def _seed_reportable_live_interactions(test_settings) -> dict[str, int | str]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        suffix = uuid4().hex[:8]
        filiere = f"Sciences Math A {suffix}"
        now = datetime.now(timezone.utc)
        professor = User(
            email=f"live-report-professor-{suffix}@example.com",
            full_name="Pr Live Report",
            role="professor",
            tier="basic",
            is_active=True,
            is_email_verified=True,
        )
        reporter = User(
            email=f"live-report-student-{suffix}@example.com",
            full_name="Live Reporter",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
        )
        other_student = User(
            email=f"live-report-other-{suffix}@example.com",
            full_name="Other Student",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
        )
        wrong_track_student = User(
            email=f"live-report-wrong-track-{suffix}@example.com",
            full_name="Wrong Track",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere="Sciences Physiques",
            is_active=True,
            is_email_verified=True,
        )
        subject = Subject(title=f"Live Report Physics {suffix}", is_published=True, order=88)
        track = ProgramTrack(niveau="2BAC", filiere=filiere, title=f"2BAC {filiere}")
        db.add_all([professor, reporter, other_student, wrong_track_student, subject, track])
        await db.flush()
        offering = CourseOffering(
            subject_id=subject.id,
            track_id=track.id,
            professor_user_id=professor.id,
            title=f"Live Report Offering {suffix}",
        )
        db.add(offering)
        await db.flush()
        db.add_all(
            [
                UserSubjectEntitlement(
                    user_id=reporter.id,
                    subject_id=subject.id,
                    starts_at=now - timedelta(days=1),
                    source="test",
                    status="active",
                ),
                UserSubjectEntitlement(
                    user_id=other_student.id,
                    subject_id=subject.id,
                    starts_at=now - timedelta(days=1),
                    source="test",
                    status="active",
                ),
            ]
        )
        live_session = LiveSession(
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            title=f"Live Report Session {suffix}",
            starts_at=now - timedelta(minutes=5),
            ends_at=now + timedelta(minutes=55),
            status="live",
            join_url="https://live.example/report",
            vdocipher_live_id=f"live_report_{suffix}",
        )
        db.add(live_session)
        await db.flush()
        visible_message = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=other_student.id,
            kind="message",
            body="This public live message is reportable.",
        )
        own_question = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=reporter.id,
            kind="question",
            body="My private pending question is reportable by me.",
        )
        answered_question = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=other_student.id,
            kind="question",
            body="A public answered question.",
            status="answered",
            answer="Answered during the live session.",
            answered_by_user_id=professor.id,
            answered_at=now,
        )
        hidden_message = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=other_student.id,
            kind="message",
            body="Already hidden.",
            status="hidden",
        )
        deleted_message = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=other_student.id,
            kind="message",
            body="Already deleted.",
            status="deleted",
            deleted_at=now,
        )
        other_pending_question = LiveSessionInteraction(
            live_session_id=live_session.id,
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            student_user_id=other_student.id,
            kind="question",
            body="Other student's pending question.",
        )
        db.add_all(
            [
                visible_message,
                own_question,
                answered_question,
                hidden_message,
                deleted_message,
                other_pending_question,
            ]
        )
        await db.flush()
        await db.commit()
        return {
            "reporter_token": create_token(reporter.id, test_settings),
            "reporter_id": int(reporter.id),
            "wrong_track_token": create_token(wrong_track_student.id, test_settings),
            "subject_id": int(subject.id),
            "live_session_id": int(live_session.id),
            "visible_message_id": int(visible_message.id),
            "own_question_id": int(own_question.id),
            "answered_question_id": int(answered_question.id),
            "hidden_message_id": int(hidden_message.id),
            "deleted_message_id": int(deleted_message.id),
            "other_pending_question_id": int(other_pending_question.id),
        }


async def _seed_report_support_staff(test_settings, *, email_prefix: str) -> tuple[str, str]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        suffix = uuid4().hex[:8]
        plain_staff = User(
            email=f"{email_prefix}-plain-{suffix}@example.com",
            full_name="Plain Staff",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        support_staff = User(
            email=f"{email_prefix}-support-{suffix}@example.com",
            full_name="Support Staff",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
        )
        db.add_all([plain_staff, support_staff])
        await db.flush()
        db.add(
            UserPermission(
                user_id=support_staff.id,
                permission="support:reports",
                status="active",
                reason="moderation access",
                granted_by_user_id=support_staff.id,
            )
        )
        await db.commit()
        return create_token(plain_staff.id, test_settings), create_token(support_staff.id, test_settings)


def test_content_report_model_and_migrations_declare_resolution_action():
    columns = ContentReport.__table__.columns
    migration_text = (BACKEND_ROOT / "alembic" / "versions" / "0076_comment_moderation_state.py").read_text(
        encoding="utf-8"
    )

    assert columns["resolution_action"].nullable is False
    assert 'down_revision: Union[str, None] = "0075"' in migration_text
    assert "resolution_action" in migration_text


def test_student_report_creation_is_authenticated_idempotent_and_validated(app_client, auth_token, run_db):
    token, user_id = auth_token(email="content-report-student@example.com", is_pro=True)
    seeded = run_db(_seed_reportable_exercises())
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "target_type": "exercise",
        "target_id": str(seeded["first_exercise_id"]),
        "reason": "wrong_answer",
        "title": "Correction issue",
        "description": "The second equation has a sign error.",
        "subject_id": 9999,
        "topic_id": 9999,
        "topic_item_id": 9999,
        "metadata_json": {"surface": "exercise_detail", "version": 1},
        "idempotency_key": "exercise-42-wrong-answer",
    }

    unauthenticated = app_client.post("/api/reports", json=payload)
    created = app_client.post("/api/reports", json=payload, headers=headers)
    repeated = app_client.post("/api/reports", json=payload, headers=headers)
    mismatch = app_client.post(
        "/api/reports",
        json={**payload, "target_id": str(seeded["second_exercise_id"])},
        headers=headers,
    )
    blank_key_first = app_client.post(
        "/api/reports",
        json={**payload, "target_id": str(seeded["second_exercise_id"]), "idempotency_key": "   "},
        headers=headers,
    )
    blank_key_second = app_client.post(
        "/api/reports",
        json={**payload, "target_id": str(seeded["third_exercise_id"]), "idempotency_key": "   "},
        headers=headers,
    )
    missing_target = app_client.post(
        "/api/reports",
        json={**payload, "target_id": "999999999", "idempotency_key": "missing-target"},
        headers=headers,
    )
    unsupported_public_target = app_client.post(
        "/api/reports",
        json={"target_type": "payment", "target_id": "manual-1", "reason": "payment_access"},
        headers=headers,
    )
    invalid = app_client.post(
        "/api/reports",
        json={"target_type": "typo", "target_id": "42", "reason": "wrong_answer"},
        headers=headers,
    )

    assert unauthenticated.status_code == 401
    assert created.status_code == 200
    created_body = created.json()
    assert created_body["reporter_user_id"] == user_id
    assert created_body["target_type"] == "exercise"
    assert created_body["target_id"] == str(seeded["first_exercise_id"])
    assert created_body["reason"] == "wrong_answer"
    assert created_body["status"] == "open"
    assert created_body["priority"] == "normal"
    assert created_body["subject_id"] == seeded["subject_id"]
    assert created_body["topic_id"] is None
    assert created_body["topic_item_id"] is None
    assert created_body["metadata_json"] == {"surface": "exercise_detail", "version": 1}
    assert repeated.status_code == 200
    assert repeated.json()["id"] == created_body["id"]
    assert mismatch.status_code == 409
    assert blank_key_first.status_code == 200
    assert blank_key_second.status_code == 200
    assert blank_key_first.json()["id"] != blank_key_second.json()["id"]
    assert missing_target.status_code == 404
    assert missing_target.json()["detail"] == "Exercise not found"
    assert unsupported_public_target.status_code == 400
    assert unsupported_public_target.json()["detail"] == "Report target type is not enabled for public intake yet"
    assert invalid.status_code == 422
    assert run_db(_count_reports_for_user(user_id)) == 3


def test_student_live_message_report_creation_validates_access_and_visibility(app_client, run_db, test_settings):
    seeded = run_db(_seed_reportable_live_interactions(test_settings))
    plain_staff_token, support_staff_token = run_db(
        _seed_report_support_staff(test_settings, email_prefix="live-report-list")
    )
    del plain_staff_token
    headers = {"Authorization": f"Bearer {seeded['reporter_token']}"}
    wrong_track_headers = {"Authorization": f"Bearer {seeded['wrong_track_token']}"}
    support_headers = {"Authorization": f"Bearer {support_staff_token}"}
    payload = {
        "target_type": "live_message",
        "target_id": str(seeded["visible_message_id"]),
        "reason": "spam",
        "title": "Live chat spam",
        "description": "This message interrupted the lesson.",
        "subject_id": 9999,
        "topic_id": 9999,
        "topic_item_id": 9999,
        "metadata_json": {"surface": "student_live_room", "kind": "message"},
        "idempotency_key": "live-message-spam",
    }

    created = app_client.post("/api/reports", json=payload, headers=headers)
    repeated = app_client.post("/api/reports", json=payload, headers=headers)
    own_question = app_client.post(
        "/api/reports",
        json={
            "target_type": "live_message",
            "target_id": str(seeded["own_question_id"]),
            "reason": "other",
        },
        headers=headers,
    )
    answered_question = app_client.post(
        "/api/reports",
        json={
            "target_type": "live_message",
            "target_id": str(seeded["answered_question_id"]),
            "reason": "broken_content",
        },
        headers=headers,
    )
    hidden = app_client.post(
        "/api/reports",
        json={"target_type": "live_message", "target_id": str(seeded["hidden_message_id"]), "reason": "spam"},
        headers=headers,
    )
    deleted = app_client.post(
        "/api/reports",
        json={"target_type": "live_message", "target_id": str(seeded["deleted_message_id"]), "reason": "spam"},
        headers=headers,
    )
    other_pending = app_client.post(
        "/api/reports",
        json={
            "target_type": "live_message",
            "target_id": str(seeded["other_pending_question_id"]),
            "reason": "other",
        },
        headers=headers,
    )
    wrong_track = app_client.post("/api/reports", json=payload, headers=wrong_track_headers)
    listing = app_client.get("/api/admin/reports?target_type=live_message", headers=support_headers)

    assert created.status_code == 200
    created_body = created.json()
    assert created_body["target_type"] == "live_message"
    assert created_body["target_id"] == str(seeded["visible_message_id"])
    assert created_body["subject_id"] == seeded["subject_id"]
    assert created_body["topic_id"] is None
    assert created_body["topic_item_id"] is None
    assert created_body["metadata_json"] == {"surface": "student_live_room", "kind": "message"}
    assert repeated.status_code == 200
    assert repeated.json()["id"] == created_body["id"]
    assert own_question.status_code == 200
    assert answered_question.status_code == 200
    assert hidden.status_code == 404
    assert hidden.json()["detail"] == "Live message not found"
    assert deleted.status_code == 404
    assert deleted.json()["detail"] == "Live message not found"
    assert other_pending.status_code == 404
    assert other_pending.json()["detail"] == "Live message not found"
    assert wrong_track.status_code == 404
    assert wrong_track.json()["detail"] == "Live session not found"
    assert listing.status_code == 200
    assert created_body["id"] in [item["id"] for item in listing.json()["items"]]


def test_admin_report_queue_requires_permission_filters_and_audits_updates(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            reporter = User(
                email="content-report-reporter@example.com",
                full_name="Reporter",
                is_active=True,
                is_email_verified=True,
            )
            plain_staff = User(
                email="content-report-plain-staff@example.com",
                full_name="Plain Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            support_staff = User(
                email="content-report-support-staff@example.com",
                full_name="Support Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            assignee = User(
                email="content-report-assignee@example.com",
                full_name="Assignee",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add_all([reporter, plain_staff, support_staff, assignee])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=support_staff.id,
                    permission="support:reports",
                    status="active",
                    reason="report queue access",
                    granted_by_user_id=support_staff.id,
                )
            )
            report = ContentReport(
                reporter_user_id=reporter.id,
                target_type="comment",
                target_id="777",
                reason="inappropriate",
                title="Bad comment",
                description="Needs moderation.",
                idempotency_key="seeded-report",
            )
            other_report = ContentReport(
                reporter_user_id=reporter.id,
                target_type="payment",
                target_id="manual-1",
                reason="payment_access",
                title="Payment issue",
                description="Access not unlocked.",
                idempotency_key="seeded-payment-report",
            )
            db.add_all([report, other_report])
            await db.commit()
            return {
                "report_id": int(report.id),
                "other_report_id": int(other_report.id),
                "assignee_id": int(assignee.id),
                "plain_staff_token": create_token(plain_staff.id, test_settings),
                "support_staff_token": create_token(support_staff.id, test_settings),
            }

    seeded = run_db(_seed())
    plain_headers = {"Authorization": f"Bearer {seeded['plain_staff_token']}"}
    support_headers = {"Authorization": f"Bearer {seeded['support_staff_token']}"}

    blocked = app_client.get("/api/admin/reports", headers=plain_headers)
    listing = app_client.get(
        "/api/admin/reports?status=open&target_type=comment&reason=inappropriate",
        headers=support_headers,
    )
    updated = app_client.patch(
        f"/api/admin/reports/{seeded['report_id']}",
        json={
            "status": "resolved",
            "priority": "high",
            "assigned_to_user_id": seeded["assignee_id"],
            "resolution_note": "Comment handled by support.",
        },
        headers=support_headers,
    )
    reopened = app_client.patch(
        f"/api/admin/reports/{seeded['report_id']}",
        json={"status": "in_review"},
        headers=support_headers,
    )
    post_update_listing = app_client.get(
        "/api/admin/reports?status=open&target_type=payment&reason=payment_access",
        headers=support_headers,
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Permission required: support:reports"
    assert listing.status_code == 200
    listing_body = listing.json()
    assert listing_body["total"] == 1
    assert [item["id"] for item in listing_body["items"]] == [seeded["report_id"]]
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["status"] == "resolved"
    assert updated_body["priority"] == "high"
    assert updated_body["assigned_to_user_id"] == seeded["assignee_id"]
    assert updated_body["reviewed_by_user_id"] is not None
    assert updated_body["resolved_at"] is not None
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "in_review"
    assert reopened.json()["reviewed_by_user_id"] is None
    assert reopened.json()["resolved_at"] is None
    assert reopened.json()["resolution_action"] == ""
    assert reopened.json()["resolution_note"] == ""
    assert post_update_listing.status_code == 200
    assert [item["id"] for item in post_update_listing.json()["items"]] == [seeded["other_report_id"]]

    audit = run_db(_latest_report_audit(seeded["report_id"]))
    assert audit is not None
    assert audit.request_path == f"/api/admin/reports/{seeded['report_id']}"
    assert audit.changed_data["status"] == "in_review"
    assert audit.changed_data["priority"] == "high"
    assert audit.changed_data["assigned_to_user_id"] == seeded["assignee_id"]


def test_admin_report_assignment_requires_active_verified_staff(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            reporter = User(
                email="content-report-assignment-reporter@example.com",
                full_name="Reporter",
                is_active=True,
                is_email_verified=True,
            )
            support_staff = User(
                email="content-report-assignment-support@example.com",
                full_name="Support Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            student = User(
                email="content-report-assignment-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
            )
            db.add_all([reporter, support_staff, student])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=support_staff.id,
                    permission="support:reports",
                    status="active",
                    reason="report queue access",
                    granted_by_user_id=support_staff.id,
                )
            )
            report = ContentReport(
                reporter_user_id=reporter.id,
                target_type="exercise",
                target_id="99",
                reason="broken_content",
                title="Broken image",
                description="The image does not load.",
                idempotency_key="assignment-report",
            )
            db.add(report)
            await db.commit()
            return {
                "report_id": int(report.id),
                "student_id": int(student.id),
                "support_staff_token": create_token(support_staff.id, test_settings),
            }

    seeded = run_db(_seed())
    headers = {"Authorization": f"Bearer {seeded['support_staff_token']}"}

    missing = app_client.patch(
        f"/api/admin/reports/{seeded['report_id']}",
        json={"assigned_to_user_id": 999999999},
        headers=headers,
    )
    invalid = app_client.patch(
        f"/api/admin/reports/{seeded['report_id']}",
        json={"assigned_to_user_id": seeded["student_id"]},
        headers=headers,
    )
    unassigned = app_client.patch(
        f"/api/admin/reports/{seeded['report_id']}",
        json={"assigned_to_user_id": None},
        headers=headers,
    )

    assert missing.status_code == 404
    assert missing.json()["detail"] == "Assignee not found"
    assert invalid.status_code == 400
    assert invalid.json()["detail"] == "Reports can only be assigned to active verified staff"
    assert unassigned.status_code == 200
    assert unassigned.json()["assigned_to_user_id"] is None


def test_admin_comment_moderation_actions_hide_restore_and_soft_delete_reported_comment(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    reporter_token, _reporter_id = auth_token(email="comment-moderation-reporter@example.com")
    seeded = run_db(_seed_reportable_exercises())

    async def _seed_staff():
        session_factory = get_session_factory()
        async with session_factory() as db:
            plain_staff = User(
                email="comment-moderation-plain@example.com",
                full_name="Plain Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            support_staff = User(
                email="comment-moderation-support@example.com",
                full_name="Support Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add_all([plain_staff, support_staff])
            await db.flush()
            db.add(
                UserPermission(
                    user_id=support_staff.id,
                    permission="support:reports",
                    status="active",
                    reason="moderation access",
                    granted_by_user_id=support_staff.id,
                )
            )
            await db.commit()
            return create_token(plain_staff.id, test_settings), create_token(support_staff.id, test_settings)

    plain_staff_token, support_staff_token = run_db(_seed_staff())
    reporter_headers = {"Authorization": f"Bearer {reporter_token}"}
    plain_headers = {"Authorization": f"Bearer {plain_staff_token}"}
    support_headers = {"Authorization": f"Bearer {support_staff_token}"}

    created_comment = app_client.post(
        "/api/interactions/exercise-comments",
        json={"exercise_id": seeded["first_exercise_id"], "body": "This is abusive."},
        headers=reporter_headers,
    )
    assert created_comment.status_code == 200
    comment_id = created_comment.json()["id"]

    created_report = app_client.post(
        "/api/reports",
        json={
            "target_type": "comment",
            "target_id": str(comment_id),
            "reason": "inappropriate",
            "title": "Bad comment",
            "description": "This needs moderation.",
        },
        headers=reporter_headers,
    )
    assert created_report.status_code == 200
    report_id = created_report.json()["id"]
    restore_report = app_client.post(
        "/api/reports",
        json={
            "target_type": "comment",
            "target_id": str(comment_id),
            "reason": "other",
            "idempotency_key": "restore-comment-after-hide",
        },
        headers=reporter_headers,
    )
    delete_report = app_client.post(
        "/api/reports",
        json={
            "target_type": "comment",
            "target_id": str(comment_id),
            "reason": "spam",
            "idempotency_key": "delete-comment-after-restore",
        },
        headers=reporter_headers,
    )
    assert restore_report.status_code == 200
    assert delete_report.status_code == 200
    restore_report_id = restore_report.json()["id"]
    delete_report_id = delete_report.json()["id"]

    blocked = app_client.post(
        f"/api/admin/reports/{report_id}/comment-moderation",
        json={"action": "hide", "note": "Needs review."},
        headers=plain_headers,
    )
    hidden = app_client.post(
        f"/api/admin/reports/{report_id}/comment-moderation",
        json={"action": "hide", "note": "Hide abusive wording."},
        headers=support_headers,
    )
    hidden_listing = app_client.get(
        f"/api/interactions/exercise-comments?exercise_id={seeded['first_exercise_id']}",
        headers=reporter_headers,
    )
    owner_delete_hidden = app_client.delete(f"/api/interactions/comments/{comment_id}", headers=reporter_headers)
    reply_to_hidden = app_client.post(
        "/api/interactions/exercise-comments",
        json={"exercise_id": seeded["first_exercise_id"], "body": "Reply", "parent_id": comment_id},
        headers=reporter_headers,
    )
    restored = app_client.post(
        f"/api/admin/reports/{restore_report_id}/comment-moderation",
        json={"action": "restore", "note": "Restored after review."},
        headers=support_headers,
    )
    restored_listing = app_client.get(
        f"/api/interactions/exercise-comments?exercise_id={seeded['first_exercise_id']}",
        headers=reporter_headers,
    )
    deleted = app_client.post(
        f"/api/admin/reports/{delete_report_id}/comment-moderation",
        json={"action": "delete", "note": "Soft delete after escalation."},
        headers=support_headers,
    )
    deleted_listing = app_client.get(
        f"/api/interactions/exercise-comments?exercise_id={seeded['first_exercise_id']}",
        headers=reporter_headers,
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Permission required: support:reports"
    assert hidden.status_code == 200
    assert hidden.json()["comment_status"] == "hidden"
    assert hidden.json()["report"]["status"] == "resolved"
    assert hidden.json()["report"]["resolution_action"] == "hide"
    assert hidden_listing.status_code == 200
    assert hidden_listing.json() == []
    assert owner_delete_hidden.status_code == 404
    assert reply_to_hidden.status_code == 404
    assert reply_to_hidden.json()["detail"] == "Parent comment not found"
    assert restored.status_code == 200
    assert restored.json()["comment_status"] == "visible"
    assert restored.json()["report"]["resolution_action"] == "restore"
    assert restored_listing.status_code == 200
    assert [item["id"] for item in restored_listing.json()] == [comment_id]
    assert restored_listing.json()[0]["status"] == "visible"
    assert deleted.status_code == 200
    assert deleted.json()["comment_status"] == "deleted"
    assert deleted.json()["report"]["resolution_action"] == "delete"
    assert deleted_listing.status_code == 200
    assert deleted_listing.json() == []

    audit = run_db(_latest_comment_moderation_audit(comment_id))
    assert audit is not None
    assert audit.request_path == f"/api/admin/reports/{delete_report_id}/comment-moderation"
    assert audit.changed_data["report_id"] == delete_report_id
    assert audit.changed_data["comment_id"] == comment_id
    assert audit.changed_data["moderation_action"] == "delete"
    assert audit.changed_data["previous_comment_status"] == "visible"
    assert audit.changed_data["comment_status"] == "deleted"


def test_admin_comment_moderation_rejects_invalid_or_closed_reports_and_no_action_dismisses(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    reporter_token, _reporter_id = auth_token(email="comment-moderation-invalid-reporter@example.com")
    seeded = run_db(_seed_reportable_exercises())

    async def _seed_support_staff():
        session_factory = get_session_factory()
        async with session_factory() as db:
            support_staff = User(
                email="comment-moderation-invalid-support@example.com",
                full_name="Support Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            db.add(support_staff)
            await db.flush()
            db.add(
                UserPermission(
                    user_id=support_staff.id,
                    permission="support:reports",
                    status="active",
                    reason="moderation access",
                    granted_by_user_id=support_staff.id,
                )
            )
            await db.commit()
            return create_token(support_staff.id, test_settings)

    support_headers = {"Authorization": f"Bearer {run_db(_seed_support_staff())}"}
    reporter_headers = {"Authorization": f"Bearer {reporter_token}"}

    created_comment = app_client.post(
        "/api/interactions/exercise-comments",
        json={"exercise_id": seeded["first_exercise_id"], "body": "Maybe okay."},
        headers=reporter_headers,
    )
    assert created_comment.status_code == 200
    comment_id = created_comment.json()["id"]

    comment_report = app_client.post(
        "/api/reports",
        json={"target_type": "comment", "target_id": str(comment_id), "reason": "other"},
        headers=reporter_headers,
    )
    exercise_report = app_client.post(
        "/api/reports",
        json={"target_type": "exercise", "target_id": str(seeded["first_exercise_id"]), "reason": "wrong_answer"},
        headers=reporter_headers,
    )
    assert comment_report.status_code == 200
    assert exercise_report.status_code == 200
    comment_report_id = comment_report.json()["id"]
    exercise_report_id = exercise_report.json()["id"]

    non_comment = app_client.post(
        f"/api/admin/reports/{exercise_report_id}/comment-moderation",
        json={"action": "hide", "note": "wrong endpoint"},
        headers=support_headers,
    )
    no_action = app_client.post(
        f"/api/admin/reports/{comment_report_id}/comment-moderation",
        json={"action": "no_action", "note": "No moderation needed."},
        headers=support_headers,
    )
    repeated = app_client.post(
        f"/api/admin/reports/{comment_report_id}/comment-moderation",
        json={"action": "hide", "note": "late mutation"},
        headers=support_headers,
    )

    async def _seed_missing_comment_report() -> int:
        session_factory = get_session_factory()
        async with session_factory() as db:
            reporter = await db.scalar(select(User).where(User.email == "comment-moderation-invalid-reporter@example.com"))
            report = ContentReport(
                reporter_user_id=reporter.id,
                target_type="comment",
                target_id="999999999",
                reason="spam",
                idempotency_key="missing-comment-report",
            )
            db.add(report)
            await db.commit()
            return int(report.id)

    missing_report_id = run_db(_seed_missing_comment_report())
    missing_target = app_client.post(
        f"/api/admin/reports/{missing_report_id}/comment-moderation",
        json={"action": "hide", "note": "missing"},
        headers=support_headers,
    )

    assert non_comment.status_code == 400
    assert non_comment.json()["detail"] == "Report target is not a comment"
    assert no_action.status_code == 200
    assert no_action.json()["action"] == "no_action"
    assert no_action.json()["comment_status"] == "visible"
    assert no_action.json()["report"]["status"] == "dismissed"
    assert no_action.json()["report"]["resolution_action"] == "no_action"
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "Report is already closed"
    assert missing_target.status_code == 404
    assert missing_target.json()["detail"] == "Comment not found"


def test_admin_live_message_moderation_actions_hide_restore_delete_and_no_action(
    app_client,
    run_db,
    test_settings,
):
    seeded = run_db(_seed_reportable_live_interactions(test_settings))
    exercise_seeded = run_db(_seed_reportable_exercises())
    plain_staff_token, support_staff_token = run_db(
        _seed_report_support_staff(test_settings, email_prefix="live-message-moderation")
    )
    reporter_headers = {"Authorization": f"Bearer {seeded['reporter_token']}"}
    plain_headers = {"Authorization": f"Bearer {plain_staff_token}"}
    support_headers = {"Authorization": f"Bearer {support_staff_token}"}

    hide_report = app_client.post(
        "/api/reports",
        json={"target_type": "live_message", "target_id": str(seeded["visible_message_id"]), "reason": "spam"},
        headers=reporter_headers,
    )
    restore_report = app_client.post(
        "/api/reports",
        json={
            "target_type": "live_message",
            "target_id": str(seeded["visible_message_id"]),
            "reason": "other",
            "idempotency_key": "restore-live-message",
        },
        headers=reporter_headers,
    )
    delete_report = app_client.post(
        "/api/reports",
        json={
            "target_type": "live_message",
            "target_id": str(seeded["visible_message_id"]),
            "reason": "inappropriate",
            "idempotency_key": "delete-live-message",
        },
        headers=reporter_headers,
    )
    no_action_report = app_client.post(
        "/api/reports",
        json={
            "target_type": "live_message",
            "target_id": str(seeded["answered_question_id"]),
            "reason": "broken_content",
            "idempotency_key": "no-action-live-message",
        },
        headers=reporter_headers,
    )
    exercise_report = app_client.post(
        "/api/reports",
        json={"target_type": "exercise", "target_id": str(exercise_seeded["first_exercise_id"]), "reason": "wrong_answer"},
        headers=reporter_headers,
    )
    assert hide_report.status_code == 200
    assert restore_report.status_code == 200
    assert delete_report.status_code == 200
    assert no_action_report.status_code == 200
    assert exercise_report.status_code == 200

    hide_report_id = hide_report.json()["id"]
    restore_report_id = restore_report.json()["id"]
    delete_report_id = delete_report.json()["id"]
    no_action_report_id = no_action_report.json()["id"]
    exercise_report_id = exercise_report.json()["id"]

    blocked = app_client.post(
        f"/api/admin/reports/{hide_report_id}/live-message-moderation",
        json={"action": "hide", "note": "Plain staff cannot moderate."},
        headers=plain_headers,
    )
    hidden = app_client.post(
        f"/api/admin/reports/{hide_report_id}/live-message-moderation",
        json={"action": "hide", "note": "Hide live spam."},
        headers=support_headers,
    )
    hidden_student_list = app_client.get(
        f"/api/professor/student-live-sessions/{seeded['live_session_id']}/interactions?kind=message",
        headers=reporter_headers,
    )
    restored = app_client.post(
        f"/api/admin/reports/{restore_report_id}/live-message-moderation",
        json={"action": "restore", "note": "Restored after review."},
        headers=support_headers,
    )
    restored_student_list = app_client.get(
        f"/api/professor/student-live-sessions/{seeded['live_session_id']}/interactions?kind=message",
        headers=reporter_headers,
    )
    deleted = app_client.post(
        f"/api/admin/reports/{delete_report_id}/live-message-moderation",
        json={"action": "delete", "note": "Delete after escalation."},
        headers=support_headers,
    )
    deleted_student_list = app_client.get(
        f"/api/professor/student-live-sessions/{seeded['live_session_id']}/interactions?kind=message",
        headers=reporter_headers,
    )
    no_action = app_client.post(
        f"/api/admin/reports/{no_action_report_id}/live-message-moderation",
        json={"action": "no_action", "note": "No moderation needed."},
        headers=support_headers,
    )
    repeated = app_client.post(
        f"/api/admin/reports/{no_action_report_id}/live-message-moderation",
        json={"action": "hide", "note": "Closed report."},
        headers=support_headers,
    )
    non_live_message = app_client.post(
        f"/api/admin/reports/{exercise_report_id}/live-message-moderation",
        json={"action": "hide", "note": "Wrong endpoint."},
        headers=support_headers,
    )

    async def _seed_missing_live_message_report() -> int:
        session_factory = get_session_factory()
        async with session_factory() as db:
            report = ContentReport(
                reporter_user_id=int(seeded["reporter_id"]),
                target_type="live_message",
                target_id="999999999",
                reason="spam",
                idempotency_key="missing-live-message-report",
            )
            db.add(report)
            await db.commit()
            return int(report.id)

    missing_report_id = run_db(_seed_missing_live_message_report())
    missing_target = app_client.post(
        f"/api/admin/reports/{missing_report_id}/live-message-moderation",
        json={"action": "hide", "note": "Missing target."},
        headers=support_headers,
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Permission required: support:reports"
    assert hidden.status_code == 200
    assert hidden.json()["live_message_status"] == "hidden"
    assert hidden.json()["report"]["status"] == "resolved"
    assert hidden.json()["report"]["resolution_action"] == "hide"
    assert hidden_student_list.status_code == 200
    assert seeded["visible_message_id"] not in [item["id"] for item in hidden_student_list.json()]
    assert restored.status_code == 200
    assert restored.json()["live_message_status"] == "pending"
    assert restored.json()["report"]["resolution_action"] == "restore"
    assert restored_student_list.status_code == 200
    assert seeded["visible_message_id"] in [item["id"] for item in restored_student_list.json()]
    assert deleted.status_code == 200
    assert deleted.json()["live_message_status"] == "deleted"
    assert deleted.json()["report"]["resolution_action"] == "delete"
    assert deleted_student_list.status_code == 200
    assert seeded["visible_message_id"] not in [item["id"] for item in deleted_student_list.json()]
    assert no_action.status_code == 200
    assert no_action.json()["action"] == "no_action"
    assert no_action.json()["live_message_status"] == "answered"
    assert no_action.json()["report"]["status"] == "dismissed"
    assert no_action.json()["report"]["resolution_action"] == "no_action"
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "Report is already closed"
    assert non_live_message.status_code == 400
    assert non_live_message.json()["detail"] == "Report target is not a live message"
    assert missing_target.status_code == 404
    assert missing_target.json()["detail"] == "Live message not found"

    audit = run_db(_latest_live_message_moderation_audit(int(seeded["visible_message_id"])))
    outbox = run_db(
        _latest_live_interaction_outbox(
            int(seeded["live_session_id"]),
            int(seeded["visible_message_id"]),
            "live.interaction.deleted",
        )
    )
    assert audit is not None
    assert audit.request_path == f"/api/admin/reports/{delete_report_id}/live-message-moderation"
    assert audit.changed_data["report_id"] == delete_report_id
    assert audit.changed_data["live_message_id"] == seeded["visible_message_id"]
    assert audit.changed_data["moderation_action"] == "delete"
    assert audit.changed_data["previous_live_message_status"] == "pending"
    assert audit.changed_data["live_message_status"] == "deleted"
    assert outbox is not None
    assert outbox.payload_json["id"] == seeded["visible_message_id"]
    assert outbox.payload_json["status"] == "deleted"
