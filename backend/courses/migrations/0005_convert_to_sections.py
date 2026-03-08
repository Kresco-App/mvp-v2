# Data migration: Convert existing Lessons, Quizzes, and ChapterBlocks into ChapterSections

from django.db import migrations


def convert_to_sections(apps, schema_editor):
    Chapter = apps.get_model('courses', 'Chapter')
    Lesson = apps.get_model('courses', 'Lesson')
    ChapterBlock = apps.get_model('courses', 'ChapterBlock')
    ChapterSection = apps.get_model('courses', 'ChapterSection')
    Quiz = apps.get_model('quizzes', 'Quiz')
    QuizQuestion = apps.get_model('quizzes', 'QuizQuestion')
    QuizOption = apps.get_model('quizzes', 'QuizOption')

    for chapter in Chapter.objects.all():
        order_counter = 0

        # Process lessons ordered by their order field
        lessons = Lesson.objects.filter(chapter=chapter).order_by('order')
        for lesson in lessons:
            # Create video section
            ChapterSection.objects.create(
                chapter=chapter,
                title=lesson.title,
                section_type='video',
                order=order_counter,
                is_gating=True,
                vdocipher_id=lesson.vdocipher_id or '',
                duration_seconds=lesson.duration_seconds,
                is_free_preview=lesson.is_free_preview,
            )
            order_counter += 1

            # Check if lesson has a quiz (OneToOne)
            try:
                quiz = Quiz.objects.get(lesson=lesson)
            except Quiz.DoesNotExist:
                quiz = None

            if quiz:
                # Build quiz_data JSON
                quiz_data = {"questions": []}
                questions = QuizQuestion.objects.filter(quiz=quiz).order_by('order')
                for q in questions:
                    question = {"text": q.text, "options": []}
                    options = QuizOption.objects.filter(question=q)
                    for opt in options:
                        question["options"].append({
                            "text": opt.text,
                            "is_correct": opt.is_correct,
                        })
                    quiz_data["questions"].append(question)

                ChapterSection.objects.create(
                    chapter=chapter,
                    title=f"Quiz: {quiz.title}",
                    section_type='quiz',
                    order=order_counter,
                    is_gating=True,
                    quiz_data=quiz_data,
                    pass_score=quiz.pass_score,
                )
                order_counter += 1

        # Append text blocks at the end
        blocks = ChapterBlock.objects.filter(chapter=chapter).order_by('order')
        for block in blocks:
            ChapterSection.objects.create(
                chapter=chapter,
                title=block.title or f"Lecture ({block.block_type})",
                section_type='text',
                order=order_counter,
                is_gating=False,
                content=block.content,
            )
            order_counter += 1


def reverse_migration(apps, schema_editor):
    ChapterSection = apps.get_model('courses', 'ChapterSection')
    ChapterSection.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('courses', '0004_chaptersection'),
        ('quizzes', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(convert_to_sections, reverse_migration),
    ]
