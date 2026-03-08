from ninja import Router
from ninja.errors import HttpError
from quizzes.models import Quiz, QuizQuestion, QuizOption
from quizzes.schemas import QuizOut, QuizQuestionOut, QuizOptionOut, QuizSubmitIn, QuizResultOut
from users.auth import jwt_auth

router = Router()


@router.get("/{quiz_id}", response=QuizOut, auth=jwt_auth)
def get_quiz(request, quiz_id: int):
    try:
        quiz = Quiz.objects.prefetch_related('questions__options').get(id=quiz_id)
    except Quiz.DoesNotExist:
        raise HttpError(404, "Quiz not found")

    questions = []
    for q in quiz.questions.all():
        questions.append(QuizQuestionOut(
            id=q.id,
            text=q.text,
            order=q.order,
            options=[QuizOptionOut(id=o.id, text=o.text) for o in q.options.all()],
        ))

    return QuizOut(
        id=quiz.id,
        title=quiz.title,
        pass_score=quiz.pass_score,
        questions=questions,
    )


@router.post("/lessons/{lesson_id}/quiz/submit", response=QuizResultOut, auth=jwt_auth)
def submit_quiz(request, lesson_id: int, body: QuizSubmitIn):
    try:
        quiz = Quiz.objects.prefetch_related('questions__options').get(lesson_id=lesson_id)
    except Quiz.DoesNotExist:
        raise HttpError(404, "Quiz not found for this lesson")

    correct = 0
    total = quiz.questions.count()

    for question in quiz.questions.all():
        selected_option_id = body.answers.get(question.id)
        if selected_option_id:
            try:
                option = question.options.get(id=selected_option_id)
                if option.is_correct:
                    correct += 1
            except QuizOption.DoesNotExist:
                pass

    score = round((correct / total) * 100) if total > 0 else 0
    passed = score >= 80  # Minimum 80% required to pass

    from gamification.models import ContentProgress, QuizResult
    from gamification.api import award_xp

    # Record quiz attempt
    QuizResult.objects.create(user=request.auth, quiz=quiz, score=score, passed=passed)

    xp_earned = 0
    if passed:
        ContentProgress.objects.get_or_create(
            user=request.auth,
            item_type='quiz',
            item_id=quiz.id,
        )
        xp_earned += award_xp(request.auth, 'quiz_pass', f'Quiz : {quiz.title}')
        if score == 100:
            xp_earned += award_xp(request.auth, 'quiz_perfect', 'Score parfait !')

    return QuizResultOut(
        score=score,
        passed=passed,
        correct=correct,
        total=total,
        pass_score=80,
        xp_earned=xp_earned,
    )
