from app.database import get_session_factory
from app.models.courses import Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import QuestionAttempt, QuizAttempt, XPTransaction
from app.models.quizzes import Question, QuestionSet
from sqlalchemy import select


def test_tab_quiz_grades_required_question_types(app_client, auth_token, run_db):
    token, _ = auth_token(email="quiz-types@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="quiz-types-topic", title="Quiz Types", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Quiz item", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Quiz",
                tab_type="quiz",
                order=1,
                config_json={
                    "pass_score": 70,
                    "questions": [
                        {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"},
                        {"id": "tf", "type": "true_false", "prompt": "True?", "options": ["true", "false"], "answer": "true"},
                        {"id": "blank", "type": "fill_in_blank", "prompt": "Fill", "answer": "lambda"},
                        {"id": "multi", "type": "multi_select", "prompt": "Pick two", "options": ["a", "b", "c"], "answer": ["a", "c"]},
                        {"id": "num", "type": "numeric_answer", "prompt": "2+2", "answer": "4", "tolerance": 0},
                        {"id": "short", "type": "short_answer", "prompt": "Keyword", "accepted_answers": ["unit", "units"], "answer": "unit"},
                        {"id": "match", "type": "matching", "prompt": "Match", "answer": {"T": "s", "f": "Hz"}},
                        {"id": "order", "type": "ordering", "prompt": "Order", "answer": ["define", "substitute", "conclude"]},
                        {"id": "drag", "type": "drag_and_drop", "prompt": "Sort", "answer": {"period": "time", "lambda": "space"}},
                        {"id": "checkpoint", "type": "interactive_checkpoint", "prompt": "Checkpoint", "answer": "done"},
                    ],
                },
            )
            db.add(tab)
            await db.commit()
            await db.refresh(tab)
            return tab.id

    tab_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "answers": {
                "mc": "A",
                "tf": "true",
                "blank": "Lambda",
                "multi": ["c", "a"],
                "num": "4",
                "short": "units",
                "match": {"T": "s", "f": "Hz"},
                "order": ["define", "substitute", "conclude"],
                "drag": {"period": "time", "lambda": "space"},
                "checkpoint": "done",
            }
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["correct"] == 10
    assert body["score"] == 100
    assert body["passed"] is True

    async def _assert_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            questions = (await db.execute(select(Question).where(Question.question_set_id == question_set.id))).scalars().all()
            quiz_attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            question_attempts = (await db.execute(select(QuestionAttempt).where(QuestionAttempt.quiz_attempt_id == quiz_attempt.id))).scalars().all()
            xp_rows = (await db.execute(select(XPTransaction).where(XPTransaction.quiz_attempt_id == quiz_attempt.id))).scalars().all()
            assert question_set.topic_section_id is not None
            assert len(questions) == 10
            assert len(question_attempts) == 10
            assert all(attempt.is_correct for attempt in question_attempts)
            assert len(xp_rows) == 11
            assert {row.reason for row in xp_rows} == {"quiz_correct", "quiz_pass"}

    run_db(_assert_tracking())


def test_tab_quiz_tracks_figma_audit_primitives(app_client, auth_token, run_db):
    token, _ = auth_token(email="quiz-figma-primitives@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Figma Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="figma-quiz-topic", title="Figma Quiz", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Chapitre", section_type="chapter", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Primitive quiz", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Primitive Quiz",
                tab_type="quiz",
                order=1,
                concept_slugs=["ondes"],
                config_json={
                    "pass_score": 80,
                    "questions": [
                        {"id": "approx", "type": "numeric_approximation", "title": "Approx", "prompt": "Estimate", "answer": 2, "tolerance": 0.1, "unit": "m", "sample": "2.00"},
                        {"id": "slider", "type": "slider_estimation", "title": "Slider", "prompt": "Estimate", "min": 0, "max": 10, "step": 0.1, "start": 6.5, "answer": 4, "tolerance": 0.4, "unit": "cm"},
                        {"id": "exact", "type": "exact_match", "title": "Exact", "prompt": "Unit", "answer": "Hz", "sample": "Hz"},
                        {"id": "formula", "type": "formula_builder", "title": "Formula", "prompt": "Build", "tokens": [{"id": "lambda", "label": "lambda"}], "answer": ["lambda", "equals", "v", "divide", "f"]},
                        {"id": "error", "type": "error_spotting", "title": "Error", "prompt": "Spot", "lines": [{"id": "line_1", "label": "ok"}, {"id": "line_2", "label": "bad"}], "answer": "line_2"},
                        {"id": "hotspot", "type": "image_hotspot", "title": "Hotspot", "prompt": "Aim", "cursor": {"x": 38, "y": 62, "radius": 7}, "answerRegion": {"shape": "ellipse", "label": "crest", "x": 63, "y": 29, "rx": 10, "ry": 12}},
                    ],
                },
            )
            db.add(tab)
            await db.commit()
            await db.refresh(tab)
            return tab.id

    tab_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "answers": {
                "approx": 2.03,
                "slider": 4.2,
                "exact": "hz",
                "formula": ["lambda", "equals", "v", "divide", "f"],
                "error": "line_2",
                "hotspot": {"x": 63, "y": 29, "radius": 7},
            },
            "duration_seconds": 45,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["correct"] == 6
    assert body["score"] == 100
    assert body["passed"] is True

    async def _assert_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            questions = (await db.execute(select(Question).where(Question.question_set_id == question_set.id))).scalars().all()
            quiz_attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            question_attempts = (await db.execute(select(QuestionAttempt).where(QuestionAttempt.quiz_attempt_id == quiz_attempt.id))).scalars().all()
            assert question_set.pass_score == 80
            assert question_set.topic_section_id is not None
            assert {question.type for question in questions} == {
                "numeric_approximation",
                "slider_estimation",
                "exact_match",
                "formula_builder",
                "error_spotting",
                "image_hotspot",
            }
            assert len(question_attempts) == 6
            assert all(attempt.is_correct for attempt in question_attempts)

    run_db(_assert_tracking())
