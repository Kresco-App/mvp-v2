from datetime import datetime, timedelta, timezone

from app.database import get_session_factory
from app.models.courses import Chapter, Exam, ExamProblem, Lesson, Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.quizzes import Quiz
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


def test_quiz_result_awards_xp_once_and_uses_server_pass_score(app_client, auth_token, run_db):
    token, _ = auth_token(email="quiz-result-xp@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Quiz XP", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            chapter = Chapter(subject_id=subject.id, title="Chapter", description="", order=1)
            db.add(chapter)
            await db.flush()

            lesson = Lesson(
                chapter_id=chapter.id,
                title="Quiz lesson",
                order=1,
                duration_seconds=600,
                is_free_preview=True,
            )
            db.add(lesson)
            await db.flush()

            quiz = Quiz(lesson_id=lesson.id, title="Checkpoint", pass_score=70)
            db.add(quiz)
            await db.commit()
            return quiz.id

    quiz_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    fake_pass = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=60&passed=true",
        headers=headers,
    )
    assert fake_pass.status_code == 200
    assert fake_pass.json()["passed"] is False
    assert fake_pass.json()["xp_earned"] == 0

    first_pass = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=80&passed=true",
        headers=headers,
    )
    assert first_pass.status_code == 200
    assert first_pass.json()["passed"] is True
    assert first_pass.json()["xp_earned"] == 20

    duplicate_pass = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=90&passed=true",
        headers=headers,
    )
    assert duplicate_pass.status_code == 200
    assert duplicate_pass.json()["passed"] is True
    assert duplicate_pass.json()["xp_earned"] == 0


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
    assert workspace.status_code == 200
    workspace_body = workspace.json()
    assert workspace_body["can_access"] is False
    assert workspace_body["locked_reason"] == "pro_required"
    assert workspace_body["sections"][0]["items"][0]["can_access"] is False
    assert workspace_body["sections"][0]["items"][0]["locked_reason"] == "pro_required"


def test_free_preview_topic_marks_locked_items(app_client, auth_token, run_db):
    token, _ = auth_token(email="free-preview-items@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Math", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            topic = Topic(
                subject_id=subject.id,
                slug="free-preview-item-locks",
                title="Free Preview Topic",
                description="Topic opens but paid items stay locked.",
                status="published",
                is_free_preview=True,
            )
            db.add(topic)
            await db.flush()

            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()

            free_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Intro preview",
                item_type="video",
                status="published",
                is_free_preview=True,
                order=1,
            )
            paid_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Paid lesson",
                item_type="video",
                status="published",
                required_tier="pro",
                order=2,
            )
            db.add_all([free_item, paid_item])
            await db.commit()
            return topic.id, free_item.id, paid_item.id

    topic_id, free_item_id, paid_item_id = run_db(_seed())
    response = app_client.get(f"/api/courses/topics/{topic_id}/workspace", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["active_item_id"] == free_item_id
    items = {item["id"]: item for section in body["sections"] for item in section["items"]}
    assert items[free_item_id]["can_access"] is True
    assert items[paid_item_id]["can_access"] is False
    assert items[paid_item_id]["locked_reason"] == "pro_required"
    assert body["item_count"] == 1


def test_locked_topic_workspace_redacts_protected_payloads(app_client, auth_token, run_db):
    token, _ = auth_token(email="locked-preview-redaction@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Physics", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            topic = Topic(
                subject_id=subject.id,
                slug="locked-preview-redaction",
                title="Locked Preview Redaction",
                description="Preview metadata remains visible.",
                status="published",
                required_tier="pro",
            )
            db.add(topic)
            await db.flush()

            resource = Resource(
                topic_id=topic.id,
                title="Protected video",
                resource_type="video",
                provider="vdocipher",
                provider_resource_id="secret-video-id",
                url="https://example.test/protected",
                summary="Short public preview summary.",
                metadata_json={"download": "secret"},
            )
            db.add(resource)
            await db.flush()

            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()

            item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                primary_resource_id=resource.id,
                title="Protected lesson",
                description="Visible locked preview description.",
                item_type="video",
                status="published",
            )
            db.add(item)
            await db.flush()

            db.add(TabContent(
                topic_item_id=item.id,
                resource_id=resource.id,
                label="Quiz",
                tab_type="quiz",
                content="Protected explanation body.",
                config_json={"questions": [{"id": "q1", "answer": "secret"}]},
                status="published",
            ))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())
    response = app_client.get(f"/api/courses/topics/{topic_id}/workspace", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    item = body["sections"][0]["items"][0]
    assert item["can_access"] is False
    assert item["description"] == "Visible locked preview description."
    assert item["primary_resource"]["summary"] == "Short public preview summary."
    assert item["primary_resource"]["provider_resource_id"] == ""
    assert item["primary_resource"]["url"] == ""
    assert item["primary_resource"]["metadata_json"] == {}
    assert item["tabs"][0]["content"] == ""
    assert item["tabs"][0]["config_json"] == {}
    assert item["tabs"][0]["resource"]["provider_resource_id"] == ""
    assert item["tabs"][0]["resource"]["url"] == ""


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
    assert locked_workspace.status_code == 200
    locked_body = locked_workspace.json()
    assert locked_body["can_access"] is False
    assert locked_body["locked_reason"] == "subject_access_required"
    assert locked_body["sections"][0]["items"][0]["can_access"] is False
    assert locked_body["sections"][0]["items"][0]["locked_reason"] == "subject_access_required"


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
                    written_solution="Protected written solution.",
                    written_solution_url="https://example.test/protected-solution.pdf",
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
    assert by_id[locked_exam_id]["problems"][0]["statement"] == "Read and answer."
    assert by_id[locked_exam_id]["problems"][0]["written_solution"] == ""
    assert by_id[locked_exam_id]["problems"][0]["written_solution_url"] == ""
    assert allowed_exam_id not in by_id

    subject_response = app_client.get("/api/courses/exam-bank?q=philosophy", headers={"Authorization": f"Bearer {token}"})
    assert subject_response.status_code == 200
    subject_results = {item["id"]: item for item in subject_response.json()}
    assert allowed_exam_id in subject_results
    assert subject_results[allowed_exam_id]["can_access"] is True
