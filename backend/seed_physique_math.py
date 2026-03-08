import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from courses.models import Subject, Chapter, ChapterSection
import random

def seed_content():
    print("Seeding Physique and Math...")

    # PHYSIQUE
    physique, _ = Subject.objects.get_or_create(
        title="Physique",
        defaults={"description": "Cours complet de Physique."}
    )

    # Physique: Les ondes lumineuses (or just "Ondes")
    chap_ondes, _ = Chapter.objects.get_or_create(
        subject=physique,
        title="Les ondes lumineuses",
        defaults={"order": 1, "description": "Comprendre les ondes mécaniques et lumineuses."}
    )

    # Sections for Ondes
    andes_sections = [
        {
            "title": "Les ondes mécaniques progressives",
            "vdo_id": "36af6ddfc79844bebc33857d45763567",
            "activity_type": "OndePropagation",
            "order": 1
        },
        {
            "title": "Les ondes progressives périodiques",
            "vdo_id": "41e98feec5424feebfd7cc4b2ccfe171",
            "activity_type": "OndeCaracteristiques",
            "order": 2
        },
        {
            "title": "Les ondes lumineuses",
            "vdo_id": "1c9b4eaf45cb4974a95e791f4a9b6eb5",
            "activity_type": "OndeTrueFalse",
            "order": 3
        }
    ]

    for item in andes_sections:
        # Create video section
        sec, created = ChapterSection.objects.get_or_create(
            chapter=chap_ondes,
            title=item["title"],
            defaults={
                "section_type": "video",
                "vdocipher_id": item["vdo_id"],
                "order": item["order"] * 2 - 1,
                "duration_seconds": 600,
                "is_gating": True
            }
        )
        if not created and not sec.vdocipher_id:
            sec.vdocipher_id = item["vdo_id"]
            sec.save()
            
        # Add the specific lab activity directly associated, we can make it an 'activity' section but wait...
        # The user wants the Lab tab INSIDE the video page to show the activity. 
        # In my updated watch/[lessonId]/page.tsx, it conditionally renders the "Lab" tab based on `section.activity_type` of the CURRENT video section!
        # So I just need to UPDATE the video section to have `activity_type`!
        sec.activity_type = item["activity_type"]
        sec.save()

    print("Physique seeded.")

    # MATHEMATIQUES
    maths, _ = Subject.objects.get_or_create(
        title="Mathématiques",
        defaults={"description": "Cours complet de Mathématiques."}
    )

    # Math: Ensembles
    chap_ensembles, _ = Chapter.objects.get_or_create(
        subject=maths,
        title="Ensembles",
        defaults={"order": 1, "description": "Théorie des ensembles."}
    )

    # Ensembles video + quiz
    ensem_vid, _ = ChapterSection.objects.get_or_create(
        chapter=chap_ensembles,
        title="1. Introduction aux ensembles",
        defaults={
            "section_type": "video",
            "vdocipher_id": "dummy_ensembles_vid",
            "order": 1,
            "duration_seconds": 300
        }
    )
    
    ensem_quiz, _ = ChapterSection.objects.get_or_create(
        chapter=chap_ensembles,
        title="2. Quiz: Opérations sur les ensembles",
        defaults={
            "section_type": "quiz",
            "order": 2,
            "quiz_data": {
                "questions": [
                    {
                        "type": "mcq",
                        "question": "Quelle opération représente l'intersection de A et B ?",
                        "options": ["A U B", "A ∩ B", "A \\ B", "A \u0394 B"],
                        "correct_answer": 1,
                        "explanation": "L'intersection est notée avec le symbole ∩."
                    }
                ]
            }
        }
    )

    # Math: Limites et continuité
    chap_limites, _ = Chapter.objects.get_or_create(
        subject=maths,
        title="Limites et continuité",
        defaults={"order": 2, "description": "Calcul de limites et théorèmes de continuité."}
    )

    lim_vid, _ = ChapterSection.objects.get_or_create(
        chapter=chap_limites,
        title="1. Introduction aux limites",
        defaults={
            "section_type": "video",
            "vdocipher_id": "dummy_limites_vid",
            "order": 1,
            "duration_seconds": 450
        }
    )

    lim_quiz, _ = ChapterSection.objects.get_or_create(
        chapter=chap_limites,
        title="2. Quiz: Calculs basiques",
        defaults={
            "section_type": "quiz",
            "order": 2,
            "quiz_data": {
                "questions": [
                    {
                        "type": "mcq",
                        "question": "Quelle est la limite de 1/x quand x tend vers +infini ?",
                        "options": ["+infini", "1", "0", "-infini"],
                        "correct_answer": 2,
                        "explanation": "Plus le dénominateur est grand, plus la fraction s'approche de 0."
                    }
                ]
            }
        }
    )

    print("Mathématiques seeded.")
    print("Content generation successful.")

if __name__ == "__main__":
    seed_content()
