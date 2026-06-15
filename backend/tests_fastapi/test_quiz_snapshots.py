from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import QuizAttempt
from app.models.quizzes import Question, QuestionSet
from app.models.users import UserSubjectEntitlement
from app.services.quiz_snapshots import (
    build_question_set_snapshot,
    question_snapshot_hash,
    quiz_attempt_submission_hash,
)


async def _seed_quiz_tab(user_id: int):
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title="Snapshot subject", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        topic = Topic(subject_id=subject.id, slug="snapshot-topic", title="Snapshot topic", order=1, is_free_preview=True)
        db.add(topic)
        await db.flush()
        section = TopicSection(topic_id=topic.id, title="Quizzes", section_type="quizzes", order=1)
        db.add(section)
        await db.flush()
        item = TopicItem(topic_id=topic.id, section_id=section.id, title="Snapshot quiz", item_type="checkpoint_quiz", order=1)
        db.add(item)
        await db.flush()
        tab = TabContent(
            topic_item_id=item.id,
            label="Quiz",
            tab_type="quiz",
            content="",
            order=1,
            config_json={
                "pass_score": 70,
                "questions": [
                    {
                        "id": "mc",
                        "type": "multiple_choice",
                        "prompt": "Pick A",
                        "options": ["A", "B"],
                        "answer": "A",
                    }
                ],
            },
        )
        db.add(tab)
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
        await db.commit()
        return tab.id


def test_question_snapshot_hash_is_deterministic():
    question_set = QuestionSet(
        id=42,
        title="Deterministic",
        source_type="tab",
        pass_score=70,
        status="published",
        order=1,
        concept_slugs=["waves"],
    )
    raw_questions = [
        {"id": "q1", "type": "short_answer", "prompt": "Unit?", "answer": "Hz"},
        {"answer": "A", "prompt": "Pick", "type": "multiple_choice", "id": "q2"},
    ]

    first = build_question_set_snapshot(question_set, raw_questions)
    second = build_question_set_snapshot(question_set, list(raw_questions))

    assert first == second
    assert question_snapshot_hash(first) == question_snapshot_hash(second)

    edited = build_question_set_snapshot(
        question_set,
        [{**raw_questions[0], "tolerance": 0.01}, raw_questions[1]],
    )
    assert question_snapshot_hash(edited) != question_snapshot_hash(first)
    assert quiz_attempt_submission_hash(
        answer_hash="answers",
        snapshot_hash=question_snapshot_hash(edited),
    ) != quiz_attempt_submission_hash(
        answer_hash="answers",
        snapshot_hash=question_snapshot_hash(first),
    )


def test_tab_quiz_attempt_persists_frozen_question_snapshot(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-snapshot@example.com", is_pro=True)
    tab_id = run_db(_seed_quiz_tab(user_id))

    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={"answers": {"mc": "A"}},
    )

    assert response.status_code == 200

    async def _assert_snapshot_survives_source_edit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            question = (await db.execute(select(Question).where(Question.question_set_id == question_set.id))).scalar_one()

            assert attempt.question_snapshot_version == 1
            assert len(attempt.question_snapshot_hash or "") == 64
            assert attempt.question_snapshot_json["question_set"]["id"] == question_set.id
            assert attempt.question_snapshot_json["questions"][0]["prompt"] == "Pick A"
            assert attempt.question_snapshot_json["questions"][0]["answer"] == "A"
            assert question_snapshot_hash(attempt.question_snapshot_json) == attempt.question_snapshot_hash

            question.prompt = "Pick B"
            question.answer_json = {"answer": "B"}
            await db.commit()

        async with session_factory() as db:
            attempt_after_edit = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            assert attempt_after_edit.question_snapshot_json["questions"][0]["prompt"] == "Pick A"
            assert attempt_after_edit.question_snapshot_json["questions"][0]["answer"] == "A"
            assert question_snapshot_hash(attempt_after_edit.question_snapshot_json) == attempt_after_edit.question_snapshot_hash

    run_db(_assert_snapshot_survives_source_edit())

    second = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={"answers": {"mc": "A"}},
    )

    assert second.status_code == 200
    assert second.json()["attempt"]["id"] == response.json()["attempt"]["id"]

    async def _raise_pass_score():
        session_factory = get_session_factory()
        async with session_factory() as db:
            tab = await db.get(TabContent, tab_id)
            tab.config_json = {
                **tab.config_json,
                "pass_score": 101,
            }
            await db.commit()

    run_db(_raise_pass_score())

    changed_version = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={"answers": {"mc": "A"}},
    )

    assert changed_version.status_code == 200
    assert changed_version.json()["attempt"]["id"] != response.json()["attempt"]["id"]
    assert changed_version.json()["attempt"]["passed"] is False

    async def _assert_new_version_snapshot():
        session_factory = get_session_factory()
        async with session_factory() as db:
            attempts = (
                await db.execute(
                    select(QuizAttempt)
                    .where(QuizAttempt.tab_content_id == tab_id)
                    .order_by(QuizAttempt.attempt_number.asc())
                )
            ).scalars().all()
            assert len(attempts) == 2
            assert [attempt.question_snapshot_json["question_set"]["pass_score"] for attempt in attempts] == [70, 101]
            assert len({attempt.submission_hash for attempt in attempts}) == 2
            assert len({attempt.question_snapshot_hash for attempt in attempts}) == 2

    run_db(_assert_new_version_snapshot())

    history = app_client.get(
        f"/api/courses/tabs/{tab_id}/quiz/attempts",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert history.status_code == 200
    history_body = history.json()
    assert not _contains_any_key(
        history_body,
        {
            "answer",
            "accepted_answers",
            "correct_answer_json",
            "question_snapshot_hash",
            "question_snapshot_json",
        },
    )


def _contains_any_key(value, forbidden: set[str]) -> bool:
    if isinstance(value, dict):
        return any(key in forbidden or _contains_any_key(item, forbidden) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_any_key(item, forbidden) for item in value)
    return False
