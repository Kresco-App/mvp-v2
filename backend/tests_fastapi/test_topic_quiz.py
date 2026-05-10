from app.database import get_session_factory
from app.models.courses import Subject, TabContent, Topic, TopicItem, TopicSection


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
