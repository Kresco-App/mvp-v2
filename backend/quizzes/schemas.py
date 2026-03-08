from ninja import Schema
from typing import List, Dict


class QuizOptionOut(Schema):
    id: int
    text: str


class QuizQuestionOut(Schema):
    id: int
    text: str
    order: int
    options: List[QuizOptionOut] = []


class QuizOut(Schema):
    id: int
    title: str
    pass_score: int
    questions: List[QuizQuestionOut] = []


class QuizSubmitIn(Schema):
    answers: Dict[int, int]  # {question_id: option_id}


class QuizResultOut(Schema):
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    xp_earned: int = 0
