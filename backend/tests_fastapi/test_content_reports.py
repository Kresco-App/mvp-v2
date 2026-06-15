from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.courses import Subject
from app.models.exercises import Exercise
from app.models.reports import ContentReport
from app.models.users import User, UserPermission
from app.services.auth import create_token


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


async def _seed_reportable_exercises() -> dict[str, int]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title="Reportable Physics", is_published=True, order=77)
        db.add(subject)
        await db.flush()
        exercises = [
            Exercise(
                subject_id=subject.id,
                title=f"Reportable Exercise {index}",
                slug=f"reportable-exercise-{index}",
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


def test_admin_report_queue_requires_permission_filters_and_audits_updates(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            reporter = User(
                email="content-report-reporter@example.com",
                full_name="Reporter",
                is_active=True,
                is_email_verified=True,
                password="!",
            )
            plain_staff = User(
                email="content-report-plain-staff@example.com",
                full_name="Plain Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            support_staff = User(
                email="content-report-support-staff@example.com",
                full_name="Support Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            assignee = User(
                email="content-report-assignee@example.com",
                full_name="Assignee",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
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
                password="!",
            )
            support_staff = User(
                email="content-report-assignment-support@example.com",
                full_name="Support Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            student = User(
                email="content-report-assignment-student@example.com",
                full_name="Student",
                is_active=True,
                is_email_verified=True,
                password="!",
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
