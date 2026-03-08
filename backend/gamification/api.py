from datetime import date, timedelta

from ninja import Router
from ninja.errors import HttpError
from django.utils import timezone
from django.db import models
from django.db.models import Sum
from gamification.models import (
    LessonProgress, ContentProgress,
    UserXP, XPTransaction, QuizResult, VideoQuizTrigger,
    DailyQuest,
)
from gamification.schemas import (
    ProgressUpdateIn, ProgressCompleteIn, SectionCompleteIn,
    SubjectPlanOut, LessonProgressOut,
    XPOut, XPTransactionOut, LessonAccessOut, VideoQuizTriggerOut,
    LeaderboardEntryOut, DailyQuestOut, UserStatsOut,
)
from courses.models import Subject, Lesson
from users.auth import jwt_auth

router = Router(auth=jwt_auth)

XP_REWARDS = {
    # Canonical marking system (spec-aligned)
    'video_complete': 10,      # Video watched ≥ 90%
    'quiz_correct': 5,         # Per correct quiz answer
    'lab_complete': 50,        # Lab / interactive activity
    'exam_complete': 100,      # Chapter exam / Examen Blanc
    # Derived / bonus
    'quiz_pass': 20,           # Flat bonus for passing a quiz section
    'quiz_perfect': 15,        # Bonus for 100% score
    'daily_login': 10,
    'streak_bonus': 25,
    # Backward-compat alias
    'lesson_complete': 10,
}


def award_xp(user, reason: str, description: str = '') -> int:
    amount = XP_REWARDS.get(reason, 0)
    if not amount:
        return 0
    xp_obj, _ = UserXP.objects.get_or_create(user=user)
    xp_obj.total_xp += amount
    xp_obj.save()
    XPTransaction.objects.create(user=user, amount=amount, reason=reason, description=description)
    # Update earn_xp daily quest
    DailyQuest.objects.filter(
        user=user, quest_type='earn_xp', date=date.today(), completed=False
    ).update(progress=models.F('progress') + amount)
    return amount


# ── Subject plan ──────────────────────────────────────────────────────────────

@router.get("/subject-plan/{subject_id}", response=SubjectPlanOut)
def get_subject_plan(request, subject_id: int):
    try:
        subject = Subject.objects.prefetch_related(
            'chapters__lessons', 'chapters__blocks', 'chapters__sections'
        ).get(id=subject_id)
    except Subject.DoesNotExist:
        raise HttpError(404, "Subject not found")

    lesson_ids, block_ids, quiz_ids, section_ids = [], [], [], []
    for ch in subject.chapters.all():
        for lesson in ch.lessons.all():
            lesson_ids.append(lesson.id)
            if hasattr(lesson, 'quiz'):
                quiz_ids.append(lesson.quiz.id)
        for block in ch.blocks.all():
            block_ids.append(block.id)
        for section in ch.sections.all():
            section_ids.append(section.id)

    completed_lessons = list(
        LessonProgress.objects.filter(
            user=request.auth, lesson_id__in=lesson_ids, status='completed'
        ).values_list('lesson_id', flat=True)
    )
    completed_blocks = list(
        ContentProgress.objects.filter(
            user=request.auth, item_type='block', item_id__in=block_ids
        ).values_list('item_id', flat=True)
    )
    completed_quizzes = list(
        ContentProgress.objects.filter(
            user=request.auth, item_type='quiz', item_id__in=quiz_ids
        ).values_list('item_id', flat=True)
    )
    completed_sections = list(
        ContentProgress.objects.filter(
            user=request.auth, item_type='section', item_id__in=section_ids
        ).values_list('item_id', flat=True)
    )
    return SubjectPlanOut(
        completed_lesson_ids=completed_lessons,
        completed_block_ids=completed_blocks,
        completed_quiz_ids=completed_quizzes,
        completed_section_ids=completed_sections,
        total_section_count=len(section_ids),
        total_lesson_count=len(lesson_ids),
    )


# ── Progress update ───────────────────────────────────────────────────────────

@router.post("/update", response=LessonProgressOut)
def update_progress(request, body: ProgressUpdateIn):
    try:
        lesson = Lesson.objects.get(id=body.lesson_id)
    except Lesson.DoesNotExist:
        raise HttpError(404, "Lesson not found")

    progress, _ = LessonProgress.objects.get_or_create(user=request.auth, lesson=lesson)

    if body.watched_seconds > progress.watched_seconds:
        progress.watched_seconds = body.watched_seconds

    # Complete at 95% watched
    if lesson.duration_seconds > 0:
        pct = progress.watched_seconds / lesson.duration_seconds
        if pct >= 0.95 and progress.status != 'completed':
            progress.status = 'completed'
            # Award XP for lesson completion
            award_xp(request.auth, 'lesson_complete', f'Leçon : {lesson.title}')
            # Increment complete_lesson daily quest
            DailyQuest.objects.filter(
                user=request.auth, quest_type='complete_lesson',
                date=date.today(), completed=False
            ).update(progress=models.F('progress') + 1)

    progress.save()
    return LessonProgressOut(
        lesson_id=lesson.id,
        watched_seconds=progress.watched_seconds,
        status=progress.status,
    )


# ── Mark complete ─────────────────────────────────────────────────────────────

@router.post("/complete")
def mark_complete(request, body: ProgressCompleteIn):
    if body.item_type not in ('block', 'quiz'):
        raise HttpError(400, "item_type must be 'block' or 'quiz'")
    ContentProgress.objects.get_or_create(
        user=request.auth, item_type=body.item_type, item_id=body.item_id
    )
    return {"ok": True}


# ── Lesson access gating ──────────────────────────────────────────────────────

@router.get("/lessons/{lesson_id}/access", response=LessonAccessOut)
def check_lesson_access(request, lesson_id: int):
    try:
        lesson = Lesson.objects.select_related('chapter').get(id=lesson_id)
    except Lesson.DoesNotExist:
        raise HttpError(404, "Lesson not found")

    # Free preview: always accessible
    if lesson.is_free_preview:
        return LessonAccessOut(can_access=True, reason='free_preview')

    # Pro required
    if not request.auth.is_pro:
        return LessonAccessOut(can_access=False, reason='requires_pro')

    # First lesson in chapter: always unlocked for pro
    lessons_in_chapter = list(lesson.chapter.lessons.order_by('order'))
    idx = next((i for i, l in enumerate(lessons_in_chapter) if l.id == lesson_id), -1)

    if idx <= 0:
        return LessonAccessOut(can_access=True, reason='first_lesson')

    # Check previous lesson completed
    prev = lessons_in_chapter[idx - 1]
    prev_progress = LessonProgress.objects.filter(
        user=request.auth, lesson=prev, status='completed'
    ).first()

    if not prev_progress:
        return LessonAccessOut(can_access=False, reason='previous_lesson_incomplete', blocker_lesson_id=prev.id)

    # Check previous lesson quiz passed (>= 80%)
    if hasattr(prev, 'quiz'):
        passed = QuizResult.objects.filter(
            user=request.auth, quiz=prev.quiz, passed=True
        ).exists()
        if not passed:
            return LessonAccessOut(
                can_access=False,
                reason='previous_quiz_not_passed',
                blocker_lesson_id=prev.id,
                blocker_quiz_id=prev.quiz.id,
            )

    return LessonAccessOut(can_access=True, reason='unlocked')


# ── Section completion + gating ───────────────────────────────────────────────

@router.post("/section-complete")
def complete_section(request, body: SectionCompleteIn):
    """Mark a chapter section as complete. Returns xp_earned."""
    from courses.models import ChapterSection
    try:
        section = ChapterSection.objects.get(id=body.section_id)
    except ChapterSection.DoesNotExist:
        raise HttpError(404, "Section not found")

    passed = True
    if section.section_type in ('quiz', 'activity'):
        passed = body.score >= section.pass_score

    xp_earned = 0
    if passed:
        _, created = ContentProgress.objects.get_or_create(
            user=request.auth, item_type='section', item_id=body.section_id
        )
        if created:
            # Award XP based on section type (marking system)
            if section.section_type == 'video':
                xp_earned += award_xp(request.auth, 'video_complete', f'Video: {section.title}')
            elif section.section_type == 'quiz':
                # 5 XP per correct answer
                if body.correct_answers > 0:
                    per_q = XP_REWARDS.get('quiz_correct', 5)
                    xp_obj, _ = UserXP.objects.get_or_create(user=request.auth)
                    bonus = body.correct_answers * per_q
                    xp_obj.total_xp += bonus
                    xp_obj.save()
                    XPTransaction.objects.create(user=request.auth, amount=bonus, reason='quiz_correct',
                                                 description=f'{body.correct_answers} bonnes reponses: {section.title}')
                    xp_earned += bonus
                xp_earned += award_xp(request.auth, 'quiz_pass', f'Quiz reussi: {section.title}')
                if body.score == 100:
                    xp_earned += award_xp(request.auth, 'quiz_perfect', 'Score parfait !')
                # Increment daily quest
                DailyQuest.objects.filter(
                    user=request.auth, quest_type='pass_quiz',
                    date=date.today(), completed=False
                ).update(progress=models.F('progress') + 1)
            elif section.section_type == 'activity':
                xp_earned += award_xp(request.auth, 'lab_complete', f'Lab: {section.title}')
            # Increment complete_lesson daily quest for all types
            DailyQuest.objects.filter(
                user=request.auth, quest_type='complete_lesson',
                date=date.today(), completed=False
            ).update(progress=models.F('progress') + 1)

    return {"ok": True, "passed": passed, "score": body.score, "xp_earned": xp_earned}


@router.get("/sections/{section_id}/access")
def check_section_access(request, section_id: int):
    """Check if user can access a section based on gating."""
    from courses.models import ChapterSection
    section = ChapterSection.objects.get(id=section_id)

    if section.is_free_preview:
        return {"can_access": True, "reason": "free_preview"}

    if not request.auth.is_pro:
        # Check if there's any free section (first one in chapter usually)
        if section.order == 0:
            return {"can_access": True, "reason": "first_section"}
        return {"can_access": False, "reason": "requires_pro"}

    # Check immediate previous section is completed
    prev_section = ChapterSection.objects.filter(
        chapter=section.chapter, order__lt=section.order, is_gating=True
    ).order_by('-order').first()

    if prev_section:
        completed = ContentProgress.objects.filter(
            user=request.auth, item_type='section', item_id=prev_section.id
        ).exists()
        if not completed:
            return {"can_access": False, "reason": "previous_incomplete", "blocker_id": prev_section.id}

    return {"can_access": True, "reason": "unlocked"}


# ── XP ────────────────────────────────────────────────────────────────────────

@router.get("/xp", response=XPOut)
def get_xp(request):
    xp, _ = UserXP.objects.get_or_create(user=request.auth)
    today = date.today()

    if xp.last_active_date != today:
        yesterday = today - timedelta(days=1)
        if xp.last_active_date == yesterday:
            xp.streak_days += 1
        else:
            xp.streak_days = 1
        xp.last_active_date = today
        xp.save()

        # Award daily login XP
        award_xp(request.auth, 'daily_login', 'Connexion quotidienne')
        # Streak bonus if streak >= 3
        if xp.streak_days >= 3:
            award_xp(request.auth, 'streak_bonus', f'Streak de {xp.streak_days} jours')
        # Refresh after XP awards
        xp.refresh_from_db()

    return XPOut(
        total_xp=xp.total_xp,
        level=xp.level,
        xp_progress_pct=xp.xp_progress_pct,
        xp_for_next_level=xp.xp_for_next_level,
        streak_days=xp.streak_days,
    )


@router.get("/xp/history", response=list[XPTransactionOut])
def get_xp_history(request):
    return list(XPTransaction.objects.filter(user=request.auth)[:20])


# ── Mid-video quiz triggers ───────────────────────────────────────────────────

@router.get("/lessons/{lesson_id}/quiz-triggers", response=list[VideoQuizTriggerOut])
def get_quiz_triggers(request, lesson_id: int):
    return list(
        VideoQuizTrigger.objects.filter(lesson_id=lesson_id).values(
            'id', 'timestamp_seconds', 'quiz_id', 'is_blocking'
        )
    )


# ── Quiz result recording ─────────────────────────────────────────────────────

@router.post("/quiz-result")
def record_quiz_result(request, quiz_id: int, score: int, passed: bool):
    QuizResult.objects.create(user=request.auth, quiz_id=quiz_id, score=score, passed=passed)
    earned = 0
    if passed:
        earned += award_xp(request.auth, 'quiz_pass', f'Quiz ID {quiz_id}')
        if score == 100:
            earned += award_xp(request.auth, 'quiz_perfect', 'Score parfait !')
        ContentProgress.objects.get_or_create(user=request.auth, item_type='quiz', item_id=quiz_id)
        # Increment pass_quiz daily quest
        DailyQuest.objects.filter(
            user=request.auth, quest_type='pass_quiz',
            date=date.today(), completed=False
        ).update(progress=models.F('progress') + 1)
    return {"ok": True, "xp_earned": earned}


# ── Leaderboard ──────────────────────────────────────────────────────────────

@router.get("/leaderboard", response=list[LeaderboardEntryOut])
def get_leaderboard(request, limit: int = 50, offset: int = 0, search: str = ''):
    qs = UserXP.objects.select_related('user').order_by('-total_xp')
    if search:
        qs = qs.filter(user__full_name__icontains=search)
    all_users = list(qs)
    # Find current user's rank in the full unfiltered list
    all_ranked = list(UserXP.objects.select_related('user').order_by('-total_xp'))
    my_rank = next((i + 1 for i, u in enumerate(all_ranked) if u.user_id == request.auth.id), None)

    paginated = all_users[offset:offset + limit]
    result = []
    for rank, uxp in enumerate(all_ranked, start=1):
        if uxp not in paginated:
            continue
        result.append(LeaderboardEntryOut(
            rank=rank,
            user_id=uxp.user.id,
            full_name=uxp.user.full_name,
            avatar_url=uxp.user.avatar_url or '',
            total_xp=uxp.total_xp,
            level=uxp.level,
            is_current_user=(uxp.user_id == request.auth.id),
        ))
    # If current user not in result, append at end
    current_in_result = any(e.is_current_user for e in result)
    if not current_in_result and my_rank and not search and offset == 0:
        try:
            my_xp = UserXP.objects.get(user=request.auth)
            result.append(LeaderboardEntryOut(
                rank=my_rank,
                user_id=request.auth.id,
                full_name=request.auth.full_name,
                avatar_url=request.auth.avatar_url or '',
                total_xp=my_xp.total_xp,
                level=my_xp.level,
                is_current_user=True,
            ))
        except UserXP.DoesNotExist:
            pass
    return result


# ── Daily Quests ─────────────────────────────────────────────────────────────

def _generate_daily_quests(user):
    """Generate 3 default daily quests for today."""
    today = date.today()
    quests = [
        DailyQuest(
            user=user, quest_type='complete_lesson',
            title='Completer 1 lecon', target=1, xp_reward=25, date=today,
        ),
        DailyQuest(
            user=user, quest_type='pass_quiz',
            title='Reussir 1 quiz', target=1, xp_reward=50, date=today,
        ),
        DailyQuest(
            user=user, quest_type='earn_xp',
            title='Gagner 100 XP', target=100, xp_reward=25, date=today,
        ),
    ]
    DailyQuest.objects.bulk_create(quests, ignore_conflicts=True)
    return DailyQuest.objects.filter(user=user, date=today)


@router.get("/daily-quests", response=list[DailyQuestOut])
def get_daily_quests(request):
    today = date.today()
    quests = DailyQuest.objects.filter(user=request.auth, date=today)
    if not quests.exists():
        quests = _generate_daily_quests(request.auth)
    return list(quests)


@router.post("/daily-quests/{quest_id}/claim")
def claim_daily_quest(request, quest_id: int):
    try:
        quest = DailyQuest.objects.get(id=quest_id, user=request.auth)
    except DailyQuest.DoesNotExist:
        raise HttpError(404, "Quest not found")

    if quest.progress < quest.target:
        raise HttpError(400, "Quest not yet completed")

    if quest.completed:
        raise HttpError(400, "Quest already claimed")

    quest.completed = True
    quest.save()

    earned = quest.xp_reward
    xp_obj, _ = UserXP.objects.get_or_create(user=request.auth)
    xp_obj.total_xp += earned
    xp_obj.save()
    XPTransaction.objects.create(
        user=request.auth, amount=earned,
        reason='daily_login', description=f'Quete quotidienne: {quest.title}',
    )

    return {"ok": True, "xp_earned": earned}


# ── User Stats ───────────────────────────────────────────────────────────────

@router.get("/stats", response=UserStatsOut)
def get_user_stats(request):
    user = request.auth
    lessons_completed = LessonProgress.objects.filter(user=user, status='completed').count()
    quizzes_passed = QuizResult.objects.filter(user=user, passed=True).count()
    total_seconds = LessonProgress.objects.filter(user=user).aggregate(
        total=Sum('watched_seconds')
    )['total'] or 0
    total_watch_minutes = total_seconds // 60

    return UserStatsOut(
        total_watch_minutes=total_watch_minutes,
        quizzes_passed=quizzes_passed,
        lessons_completed=lessons_completed,
        is_pro=user.is_pro,
    )
