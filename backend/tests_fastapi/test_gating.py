from datetime import datetime, timedelta, timezone

from app.database import get_session_factory
from app.models.courses import Chapter, Exam, ExamProblem, Lesson, Subject, Topic, TopicItem, TopicSection
from app.models.users import UserSubjectEntitlement


def test_non_pro_user_cannot_access_locked_lesson(app_client, auth_token, run_db):
    token, _ = auth_token(email="nonpro@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Math", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            chapter = Chapter(subject_id=subject.id, title="Chapter 1", description="", order=1)
            db.add(chapter)
            await db.flush()

            lesson = Lesson(
                chapter_id=chapter.id,
                title="Paid Lesson",
                order=1,
                duration_seconds=600,
                is_free_preview=False,
            )
            db.add(lesson)
            await db.commit()
            await db.refresh(lesson)
            return lesson.id

    lesson_id = run_db(_seed())
    response = app_client.get(
        f"/api/progress/lessons/{lesson_id}/access",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["can_access"] is False
    assert body["reason"] == "pro_required"


def test_topic_cards_report_pro_access_state(app_client, auth_token, run_db):
    token, _ = auth_token(email="topic-nonpro@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Physics", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            topic = Topic(
                subject_id=subject.id,
                slug="paid-topic-access-state",
                title="Paid Topic",
                description="Requires Pro access.",
                status="published",
                required_tier="pro",
            )
            db.add(topic)
            await db.flush()

            section = TopicSection(topic_id=topic.id, title="Main Path", section_type="main_path", order=1)
            db.add(section)
            await db.flush()

            db.add(TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Video lesson",
                item_type="video",
                status="published",
            ))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())
    response = app_client.get("/api/courses/topics", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    topic = next(item for item in response.json() if item["id"] == topic_id)
    assert topic["can_access"] is False
    assert topic["locked_reason"] == "pro_required"

    workspace = app_client.get(f"/api/courses/topics/{topic_id}/workspace", headers={"Authorization": f"Bearer {token}"})
    assert workspace.status_code == 403
    assert workspace.json()["detail"] == "pro_required"


def test_topic_workspace_requires_matching_subject_entitlement(app_client, auth_token, run_db):
    token, user_id = auth_token(email="subject-entitlement@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            allowed_subject = Subject(title="Math", description="", is_published=True, order=1)
            locked_subject = Subject(title="Biology", description="", is_published=True, order=2)
            db.add_all([allowed_subject, locked_subject])
            await db.flush()

            allowed_topic = Topic(
                subject_id=allowed_subject.id,
                slug="allowed-entitlement-topic",
                title="Allowed Topic",
                description="Allowed by subject entitlement.",
                status="published",
            )
            locked_topic = Topic(
                subject_id=locked_subject.id,
                slug="locked-entitlement-topic",
                title="Locked Topic",
                description="Requires a matching subject entitlement.",
                status="published",
            )
            db.add_all([allowed_topic, locked_topic])
            await db.flush()

            for topic in [allowed_topic, locked_topic]:
                section = TopicSection(topic_id=topic.id, title="Main Path", section_type="main_path", order=1)
                db.add(section)
                await db.flush()
                db.add(TopicItem(
                    topic_id=topic.id,
                    section_id=section.id,
                    title=f"{topic.title} item",
                    item_type="reading",
                    status="published",
                ))

            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=allowed_subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return allowed_topic.id, locked_topic.id

    allowed_topic_id, locked_topic_id = run_db(_seed())

    response = app_client.get("/api/courses/topics", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    by_id = {item["id"]: item for item in response.json()}
    assert by_id[allowed_topic_id]["can_access"] is True
    assert by_id[locked_topic_id]["can_access"] is False
    assert by_id[locked_topic_id]["locked_reason"] == "subject_access_required"

    allowed_workspace = app_client.get(f"/api/courses/topics/{allowed_topic_id}/workspace", headers={"Authorization": f"Bearer {token}"})
    assert allowed_workspace.status_code == 200

    locked_workspace = app_client.get(f"/api/courses/topics/{locked_topic_id}/workspace", headers={"Authorization": f"Bearer {token}"})
    assert locked_workspace.status_code == 403
    assert locked_workspace.json()["detail"] == "subject_access_required"


def test_exam_bank_reports_access_policy_and_searches_exam_metadata(app_client, auth_token, run_db):
    token, user_id = auth_token(email="exam-bank-policy@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            allowed_subject = Subject(title="Philosophy", description="", is_published=True, order=1)
            locked_subject = Subject(title="English", description="", is_published=True, order=2)
            db.add_all([allowed_subject, locked_subject])
            await db.flush()

            allowed_exam = Exam(
                subject_id=allowed_subject.id,
                title="National Bac Philosophy",
                year=2024,
                session="Normal",
                status="published",
            )
            locked_exam = Exam(
                subject_id=locked_subject.id,
                title="National Bac English",
                year=2025,
                session="Rattrapage",
                status="published",
            )
            db.add_all([allowed_exam, locked_exam])
            await db.flush()

            db.add_all([
                ExamProblem(
                    exam_id=allowed_exam.id,
                    title="Argument analysis",
                    statement="Analyze a philosophical argument.",
                    difficulty="bac",
                    concept_slugs=["argumentation"],
                    status="published",
                ),
                ExamProblem(
                    exam_id=locked_exam.id,
                    title="Reading comprehension",
                    statement="Read and answer.",
                    difficulty="bac",
                    concept_slugs=["reading"],
                    status="published",
                    required_feature_key="exam_bank_video_solutions",
                ),
                UserSubjectEntitlement(
                    user_id=user_id,
                    subject_id=allowed_subject.id,
                    starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                    source="test",
                    status="active",
                ),
            ])
            await db.commit()
            return allowed_exam.id, locked_exam.id

    allowed_exam_id, locked_exam_id = run_db(_seed())

    response = app_client.get("/api/courses/exam-bank?q=2025", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    by_id = {item["id"]: item for item in response.json()}
    assert locked_exam_id in by_id
    assert by_id[locked_exam_id]["can_access"] is False
    assert by_id[locked_exam_id]["locked_reason"] == "subject_access_required"
    assert by_id[locked_exam_id]["problems"][0]["can_access"] is False
    assert by_id[locked_exam_id]["problems"][0]["locked_reason"] == "subject_access_required"
    assert allowed_exam_id not in by_id

    subject_response = app_client.get("/api/courses/exam-bank?q=philosophy", headers={"Authorization": f"Bearer {token}"})
    assert subject_response.status_code == 200
    subject_results = {item["id"]: item for item in subject_response.json()}
    assert allowed_exam_id in subject_results
    assert subject_results[allowed_exam_id]["can_access"] is True
