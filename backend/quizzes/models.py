from django.db import models
from courses.models import Lesson


class Quiz(models.Model):
    lesson = models.OneToOneField(Lesson, on_delete=models.CASCADE, related_name='quiz')
    title = models.CharField(max_length=255)
    pass_score = models.IntegerField(default=70, help_text="Minimum % to pass")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'quizzes'
        verbose_name_plural = 'Quizzes'

    def __str__(self):
        return f"Quiz: {self.title}"


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='questions')
    text = models.TextField()
    order = models.IntegerField(default=0)

    class Meta:
        db_table = 'quiz_questions'
        ordering = ['order']

    def __str__(self):
        return self.text[:80]


class QuizOption(models.Model):
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name='options')
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)

    class Meta:
        db_table = 'quiz_options'

    def __str__(self):
        return f"{'✓' if self.is_correct else '✗'} {self.text[:60]}"
