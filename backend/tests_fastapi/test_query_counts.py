from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.database import get_session_factory
from app.models.courses import (
    Chapter,
    ChapterSection,
    Lesson,
    Resource,
    Subject,
    TabContent,
    Topic,
    TopicItem,
    TopicSection,
)
from app.models.gamification import TopicItemProgress
from app.models.interactions import UserNote
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.quizzes import Question, QuestionSet, Quiz, QuizOption, QuizQuestion
from app.models.users import User, UserSubjectEntitlement
from app.services.auth import create_token


def test_topic_workspace_has_bounded_query_count(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="query-topic-workspace@example.com", is_pro=True)
    topic_id = run_db(_seed_topic_workspace(user_id))

    with query_counter() as queries:
        response = app_client.get(
            f"/api/courses/topics/{topic_id}/workspace?q=Concept",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert queries.count <= 8, queries.statements


def test_watch_context_has_bounded_query_count(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="query-watch-context@example.com", is_pro=True)
    section_id = run_db(_seed_watch_context(user_id))

    with query_counter() as queries:
        response = app_client.get(
            f"/api/courses/sections/{section_id}/watch-context",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert queries.count <= 12, queries.statements


def test_legacy_quiz_submit_has_bounded_query_count(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="query-legacy-quiz-submit@example.com", is_pro=True)
    lesson_id, answers = run_db(_seed_legacy_quiz(user_id))

    with query_counter() as queries:
        response = app_client.post(
            f"/api/quizzes/lessons/{lesson_id}/quiz/submit",
            headers={"Authorization": f"Bearer {token}"},
            json={"answers": answers},
        )

    assert response.status_code == 200
    assert response.json()["passed"] is True
    assert queries.count <= 20, queries.statements


def test_tab_quiz_submit_xp_batch_has_bounded_query_count(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="query-tab-quiz-submit@example.com", is_pro=True)
    tab_id, answers = run_db(_seed_tab_quiz(user_id))

    with query_counter() as queries:
        response = app_client.post(
            f"/api/courses/tabs/{tab_id}/quiz/submit",
            headers={"Authorization": f"Bearer {token}"},
            json={"answers": answers},
        )

    assert response.status_code == 200
    assert response.json()["correct"] == 10
    assert response.json()["xp_earned"] == 70
    assert queries.count <= 24, queries.statements


def test_student_live_interaction_create_has_bounded_query_count(app_client, query_counter, run_db, test_settings):
    token, live_session_id = run_db(_seed_live_interaction_context(test_settings))

    with query_counter() as queries:
        response = app_client.post(
            f"/api/professor/student-live-sessions/{live_session_id}/interactions",
            headers={"Authorization": f"Bearer {token}"},
            json={"kind": "question", "body": "Can you repeat the last proof?"},
        )

    assert response.status_code == 201
    assert response.json()["status"] == "pending"
    assert queries.count <= 22, queries.statements


async def _seed_topic_workspace(user_id: int) -> int:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Query Workspace {suffix}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        topic = Topic(
            subject_id=subject.id,
            slug=f"query-workspace-{suffix}",
            title="Workspace Query Count",
            description="Concept search target",
            status="published",
            order=1,
        )
        db.add(topic)
        await db.flush()
        first_item_id = None
        for section_index in range(3):
            section = TopicSection(
                topic_id=topic.id,
                title=f"Section {section_index}",
                section_type="lessons",
                order=section_index,
            )
            db.add(section)
            await db.flush()
            for item_index in range(4):
                resource = Resource(
                    topic_id=topic.id,
                    title=f"Resource {section_index}-{item_index}",
                    resource_type="video",
                    provider="vdocipher",
                    provider_resource_id=f"video-{suffix}-{section_index}-{item_index}",
                    status="published",
                )
                db.add(resource)
                await db.flush()
                item = TopicItem(
                    topic_id=topic.id,
                    section_id=section.id,
                    primary_resource_id=resource.id,
                    title=f"Concept item {section_index}-{item_index}",
                    description="Concept searchable body",
                    item_type="video",
                    renderer_key="video",
                    order=item_index,
                    status="published",
                    concept_slugs=["concept"],
                )
                db.add(item)
                await db.flush()
                if first_item_id is None:
                    first_item_id = item.id
                db.add(TabContent(
                    topic_item_id=item.id,
                    resource_id=resource.id,
                    label="Video",
                    tab_type="video",
                    content="Concept tab",
                    order=1,
                    status="published",
                ))
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
        if first_item_id is not None:
            db.add(TopicItemProgress(
                user_id=user_id,
                topic_id=topic.id,
                topic_item_id=first_item_id,
                status="completed",
                watched_seconds=300,
            ))
            db.add(UserNote(
                user_id=user_id,
                subject_id=subject.id,
                topic_id=topic.id,
                topic_item_id=first_item_id,
                body="Concept note",
            ))
        await db.commit()
        return topic.id


async def _seed_watch_context(user_id: int) -> int:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Query Watch {suffix}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        target_section_id = None
        for chapter_index in range(4):
            chapter = Chapter(
                subject_id=subject.id,
                title=f"Chapter {chapter_index}",
                description="",
                order=chapter_index,
            )
            db.add(chapter)
            await db.flush()
            for section_index in range(3):
                section = ChapterSection(
                    chapter_id=chapter.id,
                    title=f"Section {chapter_index}-{section_index}",
                    section_type="video",
                    order=section_index,
                    is_free_preview=False,
                    vdocipher_id=f"video-{suffix}-{chapter_index}-{section_index}",
                    duration_seconds=600,
                    content="Watch content",
                )
                db.add(section)
                await db.flush()
                if target_section_id is None:
                    target_section_id = section.id
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
        await db.commit()
        assert target_section_id is not None
        return target_section_id


async def _seed_legacy_quiz(user_id: int) -> tuple[int, dict[str, int]]:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Query Quiz {suffix}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        chapter = Chapter(subject_id=subject.id, title="Quiz Chapter", description="", order=1)
        db.add(chapter)
        await db.flush()
        lesson = Lesson(
            chapter_id=chapter.id,
            title="Quiz Lesson",
            order=1,
            duration_seconds=600,
            is_free_preview=False,
        )
        db.add(lesson)
        await db.flush()
        quiz = Quiz(lesson_id=lesson.id, title="Bounded Quiz", pass_score=70)
        db.add(quiz)
        await db.flush()
        answers: dict[str, int] = {}
        for index in range(5):
            question = QuizQuestion(quiz_id=quiz.id, text=f"Question {index}", order=index)
            db.add(question)
            await db.flush()
            correct = QuizOption(question_id=question.id, text="Correct", is_correct=True)
            wrong = QuizOption(question_id=question.id, text="Wrong", is_correct=False)
            db.add_all([correct, wrong])
            await db.flush()
            answers[str(question.id)] = correct.id
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
        await db.commit()
        return lesson.id, answers


async def _seed_tab_quiz(user_id: int) -> tuple[int, dict[str, str]]:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Query Tab Quiz {suffix}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        topic = Topic(
            subject_id=subject.id,
            slug=f"query-tab-quiz-{suffix}",
            title="Query Tab Quiz",
            status="published",
            order=1,
        )
        db.add(topic)
        await db.flush()
        section = TopicSection(topic_id=topic.id, title="Quiz Section", section_type="lessons", order=1)
        db.add(section)
        await db.flush()
        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            title="Tab Quiz Item",
            item_type="checkpoint_quiz",
            order=1,
            status="published",
        )
        db.add(item)
        await db.flush()
        questions = [
            {
                "id": f"q{index}",
                "type": "multiple_choice",
                "prompt": f"Question {index}",
                "options": ["A", "B"],
                "answer": "A",
            }
            for index in range(10)
        ]
        tab = TabContent(
            topic_item_id=item.id,
            label="Quiz",
            tab_type="quiz",
            order=1,
            status="published",
            config_json={"pass_score": 70, "questions": questions},
        )
        db.add(tab)
        await db.flush()
        question_set = QuestionSet(
            subject_id=subject.id,
            topic_id=topic.id,
            topic_section_id=section.id,
            topic_item_id=item.id,
            tab_content_id=tab.id,
            title="Quiz",
            source_type="tab",
            pass_score=70,
            status="published",
            order=1,
        )
        db.add(question_set)
        await db.flush()
        db.add_all([
            Question(
                question_set_id=question_set.id,
                external_id=question["id"],
                type=question["type"],
                title=question["prompt"],
                prompt=question["prompt"],
                answer_json={"answer": question["answer"]},
                order=index + 1,
                status="published",
            )
            for index, question in enumerate(questions)
        ])
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
        await db.commit()
        return tab.id, {question["id"]: "A" for question in questions}


async def _seed_live_interaction_context(test_settings) -> tuple[str, int]:
    suffix = uuid4().hex[:8]
    filiere = f"Query Track {suffix}"
    now = datetime.now(timezone.utc)
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"query-professor-{suffix}@example.com",
            full_name="Professor Query",
            role="professor",
            tier="basic",
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        student = User(
            email=f"query-student-{suffix}@example.com",
            full_name="Student Query",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        subject = Subject(title=f"Query Live {suffix}", description="", is_published=True, order=1)
        track = ProgramTrack(niveau="2BAC", filiere=filiere, title=f"2BAC {filiere}")
        db.add_all([professor, student, subject, track])
        await db.flush()
        offering = CourseOffering(
            subject_id=subject.id,
            track_id=track.id,
            professor_user_id=professor.id,
            title="Query Live Offering",
        )
        db.add(offering)
        await db.flush()
        live_session = LiveSession(
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            title="Query Live Session",
            starts_at=now - timedelta(minutes=5),
            ends_at=now + timedelta(hours=1),
            status="live",
            join_url="https://live.example/query",
            vdocipher_live_id="live-query",
        )
        db.add(live_session)
        db.add(UserSubjectEntitlement(user_id=student.id, subject_id=subject.id, source="test", status="active"))
        await db.commit()
        return create_token(student.id, test_settings), live_session.id
