from pathlib import Path

from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.gamification import QuestionAttempt
from app.models.mistake_notebook import MistakeNotebookEntry
from app.models.quizzes import Question, QuestionSet
from app.services.quiz_attempt_submission import persist_quiz_submission


def test_mistake_notebook_tracks_quiz_mistakes_and_corrections(app_client, auth_token, run_db):
    token, user_id = auth_token(email="mistake-notebook@example.com", is_pro=True)

    async def _seed_attempts():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Physique", is_published=True)
            db.add(subject)
            await db.flush()
            question_set = QuestionSet(
                subject_id=subject.id,
                title="Ondes quiz",
                pass_score=70,
                source_type="bank",
            )
            db.add(question_set)
            await db.flush()
            first_question = Question(
                question_set_id=question_set.id,
                external_id="amplitude",
                type="short_answer",
                title="Amplitude",
                prompt="Donner l'amplitude.",
                answer_json={"answer": "A"},
                difficulty="moyen",
                concept_slugs=["ondes"],
                order=1,
            )
            second_question = Question(
                question_set_id=question_set.id,
                external_id="periode",
                type="short_answer",
                title="Periode",
                prompt="Donner la periode.",
                answer_json={"answer": "T"},
                difficulty="facile",
                concept_slugs=["ondes"],
                order=2,
            )
            db.add_all([first_question, second_question])
            await db.flush()
            subject_id = subject.id
            question_set_id = question_set.id
            first_question_id = first_question.id
            second_question_id = second_question.id

            raw_questions = [
                {"id": str(first_question_id), "type": "short_answer", "answer": "A"},
                {"id": str(second_question_id), "type": "short_answer", "answer": "T"},
            ]
            first_answers = {str(first_question_id): "wrong", str(second_question_id): "T"}
            first_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=first_answers,
                hash_answers=first_answers,
                score=50,
                passed=False,
                grading={"questions": [{"id": first_question_id, "correct": False}]},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=first_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        selected_answer_json={"value": "wrong"},
                        correct_answer_json={"value": "A"},
                        is_correct=False,
                        score_awarded=0,
                        max_score=1,
                        grading_json={"correct": False, "reason": "manual"},
                    ),
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=second_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        selected_answer_json={"value": "T"},
                        correct_answer_json={"value": "T"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    ),
                ],
            )
            assert not first_result.is_duplicate
            await db.commit()

            duplicate_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=first_answers,
                hash_answers=first_answers,
                score=50,
                passed=False,
                grading={"questions": [{"id": first_question_id, "correct": False}]},
                question_attempt_rows=[],
            )
            assert duplicate_result.is_duplicate

            entry = await db.scalar(select(MistakeNotebookEntry).where(MistakeNotebookEntry.user_id == user_id))
            assert entry is not None
            assert entry.question_id == first_question_id
            assert entry.status == "open"
            assert entry.mistake_count == 1
            assert entry.corrected_count == 0

            question_set = await db.get(QuestionSet, question_set_id)
            assert question_set is not None
            second_answers = {str(first_question_id): "A", str(second_question_id): "T"}
            second_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=second_answers,
                hash_answers=second_answers,
                score=100,
                passed=True,
                grading={"questions": [{"id": first_question_id, "correct": True}]},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=first_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        selected_answer_json={"value": "A"},
                        correct_answer_json={"value": "A"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    )
                ],
            )
            assert not second_result.is_duplicate
            await db.commit()

            question_set = await db.get(QuestionSet, question_set_id)
            assert question_set is not None
            third_answers = {str(first_question_id): "A", str(second_question_id): "changed"}
            third_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=third_answers,
                hash_answers=third_answers,
                score=100,
                passed=True,
                grading={"questions": [{"id": first_question_id, "correct": True}]},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=first_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        selected_answer_json={"value": "A"},
                        correct_answer_json={"value": "A"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    )
                ],
            )
            assert not third_result.is_duplicate
            await db.commit()
            return subject_id, first_question_id

    subject_id, question_id = run_db(_seed_attempts())
    headers = {"Authorization": f"Bearer {token}"}

    open_response = app_client.get("/api/progress/mistakes?status=open", headers=headers)
    corrected_response = app_client.get(
        f"/api/progress/mistakes?status=corrected&subject_id={subject_id}",
        headers=headers,
    )

    assert open_response.status_code == 200
    assert open_response.json()["total"] == 0
    assert corrected_response.status_code == 200
    payload = corrected_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["question_id"] == question_id
    assert item["status"] == "corrected"
    assert item["mistake_count"] == 1
    assert item["corrected_count"] == 1
    assert "last_correct_answer_json" not in item
    assert "last_grading_json" not in item
    assert item["question_title"] == "Amplitude"
    assert item["question_difficulty"] == "moyen"
    assert item["question_concept_slugs"] == ["ondes"]


def test_mistake_notebook_is_scoped_to_current_user(app_client, auth_token, run_db):
    owner_token, owner_id = auth_token(email="mistake-owner@example.com", is_pro=True)
    other_token, _other_id = auth_token(email="mistake-other@example.com", is_pro=True)

    async def _seed_entry():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Math", is_published=True)
            db.add(subject)
            await db.flush()
            question_set = QuestionSet(subject_id=subject.id, title="Functions")
            db.add(question_set)
            await db.flush()
            question = Question(
                question_set_id=question_set.id,
                type="short_answer",
                title="Limit",
                prompt="Compute the limit.",
                answer_json={"answer": "0"},
            )
            db.add(question)
            await db.flush()
            db.add(
                MistakeNotebookEntry(
                    user_id=owner_id,
                    question_id=question.id,
                    question_set_id=question_set.id,
                    subject_id=subject.id,
                    status="open",
                    mistake_count=1,
                )
            )
            await db.commit()

    run_db(_seed_entry())

    owner_response = app_client.get("/api/progress/mistakes", headers={"Authorization": f"Bearer {owner_token}"})
    other_response = app_client.get("/api/progress/mistakes", headers={"Authorization": f"Bearer {other_token}"})

    assert owner_response.status_code == 200
    assert owner_response.json()["total"] == 1
    assert other_response.status_code == 200
    assert other_response.json()["total"] == 0


def test_mistake_notebook_migration_and_model_are_declared():
    migration = (
        Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0063_mistake_notebook_entries.py"
    ).read_text(encoding="utf-8")

    assert "revision: str = \"0063\"" in migration
    assert "down_revision: Union[str, None] = \"0062\"" in migration
    assert "mistake_notebook_entries" in migration
    assert "uq_mistake_notebook_entries_user_question" in migration
    assert "ck_mistake_notebook_entries_status" in migration
    assert "ix_mistake_notebook_entries_user_status_updated" in migration
    assert MistakeNotebookEntry.__tablename__ == "mistake_notebook_entries"
    assert any(
        constraint.name == "uq_mistake_notebook_entries_user_question"
        for constraint in MistakeNotebookEntry.__table__.constraints
    )
