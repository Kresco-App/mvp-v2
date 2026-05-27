from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.models.quizzes import Quiz


@dataclass(frozen=True)
class QuizScore:
    correct: int
    total: int
    score: int
    passed: bool


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def score_quiz_answers(quiz: Quiz, answers: Mapping[Any, Any]) -> QuizScore:
    correct_options_by_question: dict[int, int] = {}
    for question in quiz.questions:
        for option in question.options:
            if option.is_correct:
                correct_options_by_question[question.id] = option.id
                break

    correct = 0
    for question_id, option_id in answers.items():
        normalized_question_id = _coerce_int(question_id)
        normalized_option_id = _coerce_int(option_id)
        if normalized_question_id is None or normalized_option_id is None:
            continue
        if correct_options_by_question.get(normalized_question_id) == normalized_option_id:
            correct += 1

    total = len(quiz.questions)
    score = round((correct / total) * 100) if total > 0 else 0
    return QuizScore(
        correct=correct,
        total=total,
        score=score,
        passed=score >= quiz.pass_score,
    )
