import math
from django.db import models
from django.conf import settings
from courses.models import Lesson


class LessonProgress(models.Model):
    STATUS_CHOICES = [('started', 'Started'), ('completed', 'Completed')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='lesson_progress')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='progress')
    watched_seconds = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='started')
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lesson_progress'
        unique_together = ('user', 'lesson')

    def __str__(self):
        return f"{self.user.email} - {self.lesson.title} ({self.status})"


class ContentProgress(models.Model):
    ITEM_TYPE_CHOICES = [('block', 'Block'), ('quiz', 'Quiz'), ('section', 'Section')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='content_progress')
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    item_id = models.IntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'content_progress'
        unique_together = ('user', 'item_type', 'item_id')

    def __str__(self):
        return f"{self.user.email} - {self.item_type}:{self.item_id}"


class UserXP(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='xp')
    total_xp = models.IntegerField(default=0)
    streak_days = models.IntegerField(default=0)
    last_active_date = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_xp'

    @property
    def level(self):
        return int(math.sqrt(max(self.total_xp, 0) / 50)) + 1

    @property
    def xp_for_current_level(self):
        return (self.level - 1) ** 2 * 50

    @property
    def xp_for_next_level(self):
        return self.level ** 2 * 50

    @property
    def xp_progress_pct(self):
        cl = self.xp_for_current_level
        nl = self.xp_for_next_level
        if nl == cl:
            return 100
        return min(100, int((self.total_xp - cl) / (nl - cl) * 100))

    def __str__(self):
        return f"{self.user.email} — Level {self.level} ({self.total_xp} XP)"


class XPTransaction(models.Model):
    REASONS = [
        ('lesson_complete', 'Leçon terminée'),
        ('quiz_pass', 'Quiz réussi'),
        ('quiz_perfect', 'Score parfait'),
        ('daily_login', 'Connexion quotidienne'),
        ('streak_bonus', 'Bonus streak'),
        ('exam_complete', 'Examen terminé'),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='xp_transactions')
    amount = models.IntegerField()
    reason = models.CharField(max_length=50, choices=REASONS)
    description = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'xp_transactions'
        ordering = ['-created_at']

    def __str__(self):
        return f"+{self.amount} XP — {self.user.email}"


class QuizResult(models.Model):
    """Stores quiz attempt results for gating and XP logic."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='quiz_results')
    quiz = models.ForeignKey('quizzes.Quiz', on_delete=models.CASCADE, related_name='results')
    score = models.IntegerField()   # 0–100
    passed = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'quiz_results'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} — {self.quiz.title}: {self.score}%"


class DailyQuest(models.Model):
    QUEST_TYPES = [
        ('complete_lesson', 'Complete a lesson'),
        ('pass_quiz', 'Pass a quiz'),
        ('study_minutes', 'Study for X minutes'),
        ('earn_xp', 'Earn X XP'),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='daily_quests')
    quest_type = models.CharField(max_length=30, choices=QUEST_TYPES)
    title = models.CharField(max_length=200)
    target = models.IntegerField(default=1)
    progress = models.IntegerField(default=0)
    xp_reward = models.IntegerField(default=25)
    date = models.DateField()
    completed = models.BooleanField(default=False)

    class Meta:
        db_table = 'daily_quests'
        unique_together = ('user', 'quest_type', 'date')

    def __str__(self):
        return f"{self.user.email} - {self.title} ({self.date})"


class VideoQuizTrigger(models.Model):
    """Defines a mid-video quiz interrupt at a given timestamp."""
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='quiz_triggers')
    timestamp_seconds = models.IntegerField(help_text="Pause video at this second mark")
    quiz = models.ForeignKey('quizzes.Quiz', on_delete=models.CASCADE, related_name='triggers')
    is_blocking = models.BooleanField(default=True, help_text="Must answer to continue")

    class Meta:
        db_table = 'video_quiz_triggers'
        ordering = ['timestamp_seconds']

    def __str__(self):
        return f"{self.lesson.title} @ {self.timestamp_seconds}s → {self.quiz.title}"
