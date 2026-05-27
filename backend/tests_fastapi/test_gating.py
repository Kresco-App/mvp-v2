from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Activity, Chapter, ChapterSection, CoursePDF, Exam, ExamProblem, Lesson, Resource, Subject, TabContent, Topic, TopicItem, TopicSection, VideoQuizTrigger
from app.models.gamification import QuizResult, XPTransaction
from app.models.quizzes import Quiz, QuizOption, QuizQuestion
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


def test_locked_lesson_quiz_cannot_be_fetched_or_submitted(app_client, auth_token, run_db):
    token, user_id = auth_token(email="locked-lesson-quiz@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Locked Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            chapter = Chapter(subject_id=subject.id, title="Chapter", description="", order=1)
            db.add(chapter)
            await db.flush()
            lesson = Lesson(chapter_id=chapter.id, title="Locked quiz lesson", order=1, duration_seconds=600, is_free_preview=False)
            db.add(lesson)
            await db.flush()
            quiz = Quiz(lesson_id=lesson.id, title="Locked quiz", pass_score=70)
            db.add(quiz)
            await db.flush()
            question = QuizQuestion(quiz_id=quiz.id, text="2 + 2?", order=1)
            db.add(question)
            await db.flush()
            option = QuizOption(question_id=question.id, text="4", is_correct=True)
            db.add(option)
            await db.commit()
            return quiz.id, lesson.id, question.id, option.id

    quiz_id, lesson_id, question_id, option_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    get_response = app_client.get(f"/api/quizzes/{quiz_id}", headers=headers)
    assert get_response.status_code == 403

    submit_response = app_client.post(
        f"/api/quizzes/lessons/{lesson_id}/quiz/submit",
        headers=headers,
        json={"answers": {str(question_id): option_id}},
    )
    assert submit_response.status_code == 403

    async def _count_results():
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(
                select(QuizResult).where(QuizResult.user_id == user_id, QuizResult.quiz_id == quiz_id)
            )
            return len(result.scalars().all())

    assert run_db(_count_results()) == 0


def test_locked_legacy_lesson_payloads_are_redacted_or_forbidden(app_client, auth_token, run_db):
    token, _ = auth_token(email="legacy-payload-lock@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Legacy Payload Lock", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            chapter = Chapter(subject_id=subject.id, title="Locked chapter", description="", order=1)
            db.add(chapter)
            await db.flush()
            lesson = Lesson(chapter_id=chapter.id, title="Locked lesson", vdocipher_id="secret-video", duration_seconds=600, order=1, is_free_preview=False)
            db.add(lesson)
            await db.flush()
            db.add(Activity(lesson_id=lesson.id, title="Secret activity", activity_type="drag", config_json={"answer": "secret"}, order=1))
            db.add(CoursePDF(lesson_id=lesson.id, title="Secret PDF", file_url="/media/secret.pdf", order=1))
            quiz = Quiz(lesson_id=lesson.id, title="Secret checkpoint", pass_score=70)
            db.add(quiz)
            await db.flush()
            db.add(VideoQuizTrigger(lesson_id=lesson.id, timestamp_seconds=30, quiz_id=quiz.id, is_blocking=True))
            section = ChapterSection(
                chapter_id=chapter.id,
                title="Locked section",
                section_type="quiz",
                order=1,
                is_free_preview=False,
                vdocipher_id="secret-section-video",
                content="secret text",
                quiz_data={"questions": ["secret"]},
                activity_data={"secret": True},
            )
            db.add(section)
            await db.commit()
            return lesson.id, chapter.id, section.id

    lesson_id, chapter_id, section_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    lesson_response = app_client.get(f"/api/courses/lessons/{lesson_id}", headers=headers)
    assert lesson_response.status_code == 200
    assert lesson_response.json()["vdocipher_id"] == ""

    stream_response = app_client.get(f"/api/courses/lessons/{lesson_id}/stream", headers=headers)
    assert stream_response.status_code == 403

    activities_response = app_client.get(f"/api/courses/lessons/{lesson_id}/activities", headers=headers)
    assert activities_response.status_code == 403

    pdf_response = app_client.get(f"/api/courses/lessons/{lesson_id}/pdfs", headers=headers)
    assert pdf_response.status_code == 403

    quiz_triggers_response = app_client.get(f"/api/progress/lessons/{lesson_id}/quiz-triggers", headers=headers)
    assert quiz_triggers_response.status_code == 403

    sections_response = app_client.get(f"/api/courses/chapters/{chapter_id}/sections", headers=headers)
    assert sections_response.status_code == 200
    section = sections_response.json()[0]
    assert section["vdocipher_id"] == ""
    assert section["content"] == ""
    assert section["quiz_data"] is None
    assert section["activity_data"] is None

    section_stream_response = app_client.get(f"/api/courses/sections/{section_id}/stream", headers=headers)
    assert section_stream_response.status_code == 403

    watch_context_response = app_client.get(f"/api/courses/sections/{section_id}/watch-context", headers=headers)
    assert watch_context_response.status_code == 200
    watch_context = watch_context_response.json()
    assert watch_context["subject_title"] == "Legacy Payload Lock"
    assert watch_context["section"]["id"] == section_id
    assert watch_context["section"]["quiz_data"] is None
    assert watch_context["chapters"][0]["sections"][0]["id"] == section_id


def test_quiz_result_awards_xp_once_and_uses_server_pass_score(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-result-xp@example.com", is_pro=True)

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
            await db.flush()

            first_question = QuizQuestion(quiz_id=quiz.id, text="2 + 2?", order=1)
            second_question = QuizQuestion(quiz_id=quiz.id, text="3 + 3?", order=2)
            db.add_all([first_question, second_question])
            await db.flush()

            first_correct = QuizOption(question_id=first_question.id, text="4", is_correct=True)
            first_wrong = QuizOption(question_id=first_question.id, text="5", is_correct=False)
            second_correct = QuizOption(question_id=second_question.id, text="6", is_correct=True)
            db.add_all([first_correct, first_wrong, second_correct])
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return quiz.id, first_question.id, first_correct.id, first_wrong.id, second_question.id, second_correct.id

    quiz_id, first_question_id, first_correct_id, first_wrong_id, second_question_id, second_correct_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    missing_answers = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=100&passed=true",
        headers=headers,
    )
    assert missing_answers.status_code == 422

    fake_pass = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=100&passed=true",
        headers=headers,
        json={"answers": {str(first_question_id): first_wrong_id, str(second_question_id): second_correct_id}},
    )
    assert fake_pass.status_code == 200
    assert fake_pass.json()["score"] == 50
    assert fake_pass.json()["passed"] is False
    assert fake_pass.json()["xp_earned"] == 0

    first_pass = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=0&passed=false",
        headers=headers,
        json={"answers": {str(first_question_id): first_correct_id, str(second_question_id): second_correct_id}},
    )
    assert first_pass.status_code == 200
    assert first_pass.json()["score"] == 100
    assert first_pass.json()["passed"] is True
    assert first_pass.json()["xp_earned"] == 20

    duplicate_pass = app_client.post(
        f"/api/progress/quiz-result?quiz_id={quiz_id}&score=90&passed=true",
        headers=headers,
        json={"answers": {str(first_question_id): first_correct_id, str(second_question_id): second_correct_id}},
    )
    assert duplicate_pass.status_code == 200
    assert duplicate_pass.json()["passed"] is True
    assert duplicate_pass.json()["xp_earned"] == 0


def test_progress_update_lesson_completion_uses_idempotent_xp_key(app_client, auth_token, run_db):
    token, user_id = auth_token(email="lesson-progress-idempotency@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Progress XP", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            chapter = Chapter(subject_id=subject.id, title="Chapter", description="", order=1)
            db.add(chapter)
            await db.flush()
            lesson = Lesson(chapter_id=chapter.id, title="Progress lesson", order=1, duration_seconds=100, is_free_preview=True)
            db.add(lesson)
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return lesson.id

    lesson_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post("/api/progress/update", headers=headers, json={"lesson_id": lesson_id, "watched_seconds": 95})
    duplicate = app_client.post("/api/progress/update", headers=headers, json={"lesson_id": lesson_id, "watched_seconds": 100})

    assert first.status_code == 200
    assert first.json()["status"] == "completed"
    assert duplicate.status_code == 200
    assert duplicate.json()["status"] == "completed"

    async def _assert_xp():
        session_factory = get_session_factory()
        async with session_factory() as db:
            rows = (
                await db.execute(
                    select(XPTransaction).where(
                        XPTransaction.reason == "lesson_complete",
                        XPTransaction.description == f"Lesson {lesson_id} completed",
                    )
                )
            ).scalars().all()
            assert len(rows) == 1
            assert rows[0].idempotency_key == f"lesson_complete:user:{rows[0].user_id}:lesson:{lesson_id}"

    run_db(_assert_xp())


def test_legacy_lesson_quiz_submit_awards_pass_and_perfect_xp_once(app_client, auth_token, run_db):
    token, user_id = auth_token(email="legacy-quiz-submit-idempotency@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Legacy Quiz XP", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            chapter = Chapter(subject_id=subject.id, title="Chapter", description="", order=1)
            db.add(chapter)
            await db.flush()
            lesson = Lesson(chapter_id=chapter.id, title="Legacy quiz lesson", order=1, duration_seconds=600, is_free_preview=True)
            db.add(lesson)
            await db.flush()
            quiz = Quiz(lesson_id=lesson.id, title="Legacy checkpoint", pass_score=70)
            db.add(quiz)
            await db.flush()
            question = QuizQuestion(quiz_id=quiz.id, text="2 + 2?", order=1)
            db.add(question)
            await db.flush()
            option = QuizOption(question_id=question.id, text="4", is_correct=True)
            db.add(option)
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return lesson.id, quiz.id, question.id, option.id

    lesson_id, quiz_id, question_id, option_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"answers": {str(question_id): option_id}}

    first = app_client.post(f"/api/quizzes/lessons/{lesson_id}/quiz/submit", headers=headers, json=payload)
    duplicate = app_client.post(f"/api/quizzes/lessons/{lesson_id}/quiz/submit", headers=headers, json=payload)

    assert first.status_code == 200
    assert first.json()["passed"] is True
    assert first.json()["xp_earned"] == 35
    assert duplicate.status_code == 200
    assert duplicate.json()["passed"] is True
    assert duplicate.json()["xp_earned"] == 0

    async def _assert_xp():
        session_factory = get_session_factory()
        async with session_factory() as db:
            rows = (
                await db.execute(
                    select(XPTransaction).where(
                        XPTransaction.user_id == user_id,
                    )
                )
            ).scalars().all()
            quiz_rows = [row for row in rows if row.description.startswith(f"Quiz {quiz_id} ")]
            assert {row.reason for row in quiz_rows} == {"quiz_pass", "quiz_perfect"}
            assert {row.amount for row in quiz_rows} == {20, 15}
            assert {row.idempotency_key for row in quiz_rows} == {
                f"legacy_quiz_pass:user:{user_id}:quiz:{quiz_id}",
                f"legacy_quiz_perfect:user:{user_id}:quiz:{quiz_id}",
            }
            result_rows = (
                await db.execute(
                    select(QuizResult).where(
                        QuizResult.user_id == user_id,
                        QuizResult.quiz_id == quiz_id,
                    )
                )
            ).scalars().all()
            assert len(result_rows) == 1

    run_db(_assert_xp())


def test_legacy_lesson_quiz_submit_reuses_failed_result_row(app_client, auth_token, run_db):
    token, user_id = auth_token(email="legacy-quiz-submit-failed-idempotency@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Legacy Quiz Failed Attempts", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            chapter = Chapter(subject_id=subject.id, title="Chapter", description="", order=1)
            db.add(chapter)
            await db.flush()
            lesson = Lesson(chapter_id=chapter.id, title="Failed quiz lesson", order=1, duration_seconds=600, is_free_preview=True)
            db.add(lesson)
            await db.flush()
            quiz = Quiz(lesson_id=lesson.id, title="Failed checkpoint", pass_score=70)
            db.add(quiz)
            await db.flush()
            question = QuizQuestion(quiz_id=quiz.id, text="2 + 2?", order=1)
            db.add(question)
            await db.flush()
            correct = QuizOption(question_id=question.id, text="4", is_correct=True)
            wrong = QuizOption(question_id=question.id, text="5", is_correct=False)
            db.add_all([correct, wrong])
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return lesson.id, quiz.id, question.id, correct.id, wrong.id

    lesson_id, quiz_id, question_id, correct_id, wrong_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}
    wrong_payload = {"answers": {str(question_id): wrong_id}}
    correct_payload = {"answers": {str(question_id): correct_id}}

    first_failed = app_client.post(f"/api/quizzes/lessons/{lesson_id}/quiz/submit", headers=headers, json=wrong_payload)
    duplicate_failed = app_client.post(f"/api/quizzes/lessons/{lesson_id}/quiz/submit", headers=headers, json=wrong_payload)
    passed = app_client.post(f"/api/quizzes/lessons/{lesson_id}/quiz/submit", headers=headers, json=correct_payload)

    assert first_failed.status_code == 200
    assert first_failed.json()["passed"] is False
    assert duplicate_failed.status_code == 200
    assert duplicate_failed.json()["passed"] is False
    assert passed.status_code == 200
    assert passed.json()["passed"] is True
    assert passed.json()["xp_earned"] == 35

    async def _assert_single_result():
        session_factory = get_session_factory()
        async with session_factory() as db:
            result_rows = (
                await db.execute(
                    select(QuizResult).where(
                        QuizResult.user_id == user_id,
                        QuizResult.quiz_id == quiz_id,
                    )
                )
            ).scalars().all()
            assert len(result_rows) == 1
            assert result_rows[0].passed is True
            assert result_rows[0].score == 100

    run_db(_assert_single_result())


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


def test_legacy_is_pro_user_with_basic_tier_gets_pro_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="legacy-pro-basic-tier@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Legacy Pro Access", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            topic = Topic(
                subject_id=subject.id,
                slug="legacy-pro-basic-tier-topic",
                title="Legacy Pro Topic",
                description="Seed/payment users may have is_pro true while tier remains basic.",
                status="published",
                required_tier="pro",
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            db.add(TopicItem(topic_id=topic.id, section_id=section.id, title="Paid item", item_type="lesson_video", status="published"))
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())
    response = app_client.get(f"/api/courses/topics/{topic_id}/workspace", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["can_access"] is True


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


def test_expired_entitlement_rows_leave_paid_user_without_subject_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="expired-entitlement-scope@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            expired_subject = Subject(title="Expired Math", description="", is_published=True, order=1)
            open_subject = Subject(title="Open Biology", description="", is_published=True, order=2)
            db.add_all([expired_subject, open_subject])
            await db.flush()

            topics = []
            for subject in [expired_subject, open_subject]:
                topic = Topic(
                    subject_id=subject.id,
                    slug=f"expired-scope-{subject.id}",
                    title=f"{subject.title} Topic",
                    status="published",
                    order=subject.order,
                )
                db.add(topic)
                await db.flush()
                section = TopicSection(topic_id=topic.id, title="Main Path", section_type="main_path", order=1)
                db.add(section)
                await db.flush()
                db.add(TopicItem(
                    topic_id=topic.id,
                    section_id=section.id,
                    title=f"{subject.title} item",
                    item_type="reading",
                    status="published",
                ))
                topics.append(topic)

            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=expired_subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=10),
                ends_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return [topic.id for topic in topics]

    topic_ids = run_db(_seed())
    response = app_client.get("/api/courses/topics", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    by_id = {item["id"]: item for item in response.json() if item["id"] in topic_ids}
    assert set(by_id) == set(topic_ids)
    assert all(item["can_access"] is False for item in by_id.values())
    assert all(item["locked_reason"] == "subject_access_required" for item in by_id.values())


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
