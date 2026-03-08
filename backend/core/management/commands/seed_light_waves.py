from django.core.management.base import BaseCommand
from django.db import transaction
import requests

from courses.models import Chapter, ChapterSection, Subject
from courses.vdocipher import fetch_video_duration_seconds


SUBJECT_TITLE = "Physique-Chimie"
CHAPTER_TITLE = "Les ondes lumineuses"
CHAPTER_DESCRIPTION = (
    "Chapitre aligne sur le programme marocain de 2eme annee du baccalaureat : "
    "mise en evidence de la nature ondulatoire de la lumiere par diffraction, "
    "refraction et dispersion par le prisme, et grandeurs caracteristiques de "
    "la lumiere en tant qu'onde."
)

SECTION_SPECS = [
    {
        "title": "Nature ondulatoire de la lumiere",
        "vdocipher_id": "2b524afb877b4f00a665ac53d4081332",
        "is_free_preview": True,
        "activity_type": "diffraction_simulator",
    },
    {
        "title": "Prisme et lois de Descartes",
        "vdocipher_id": "562c7b1b502044588678b678179430ba",
        "is_free_preview": False,
        "activity_type": "prism_simulator",
    },
    {
        "title": "Caracteristiques de la lumiere en tant qu'onde",
        "vdocipher_id": "fa1c30a17b874965ac332e03f68545df",
        "is_free_preview": False,
        "activity_type": "wave_simulator",
    },
]


class Command(BaseCommand):
    help = "Create or update the 'Les ondes lumineuses' chapter for Physique-Chimie."

    def resolve_duration_seconds(self, video_id: str, existing_duration: int = 0) -> int:
        try:
            duration_seconds = fetch_video_duration_seconds(video_id)
        except requests.RequestException as exc:
            self.stdout.write(
                self.style.WARNING(
                    f"  - warning: failed to fetch VdoCipher duration for {video_id}: {exc}"
                )
            )
            duration_seconds = None

        if duration_seconds is None:
            return existing_duration

        return duration_seconds

    @transaction.atomic
    def handle(self, *args, **options):
        subject, _ = Subject.objects.get_or_create(
            title=SUBJECT_TITLE,
            defaults={
                "description": (
                    "Comprenez la mecanique, l'electricite, l'optique et la chimie organique."
                ),
                "is_published": True,
                "order": 1,
            },
        )

        chapter, created = Chapter.objects.get_or_create(
            subject=subject,
            title=CHAPTER_TITLE,
            defaults={
                "description": CHAPTER_DESCRIPTION,
                "order": 2,
            },
        )
        chapter.description = CHAPTER_DESCRIPTION
        chapter.order = 2
        chapter.save(update_fields=["description", "order"])

        chemistry_chapter = Chapter.objects.filter(
            subject=subject,
            title="Chimie Organique",
        ).first()
        if chemistry_chapter and chemistry_chapter.id != chapter.id and chemistry_chapter.order < 3:
            chemistry_chapter.order = 3
            chemistry_chapter.save(update_fields=["order"])

        for order, spec in enumerate(SECTION_SPECS):
            existing_section = ChapterSection.objects.filter(
                chapter=chapter,
                title=spec["title"],
            ).only("duration_seconds").first()
            duration_seconds = self.resolve_duration_seconds(
                spec["vdocipher_id"],
                existing_duration=existing_section.duration_seconds if existing_section else 0,
            )
            section, section_created = ChapterSection.objects.update_or_create(
                chapter=chapter,
                title=spec["title"],
                defaults={
                    "section_type": "video",
                    "order": order,
                    "is_gating": True,
                    "vdocipher_id": spec["vdocipher_id"],
                    "duration_seconds": duration_seconds,
                    "is_free_preview": spec["is_free_preview"],
                    "activity_type": spec["activity_type"],
                },
            )
            action = "created" if section_created else "updated"
            self.stdout.write(
                f"  - {action}: {section.title} ({section.duration_seconds}s)"
            )

        status = "created" if created else "updated"
        self.stdout.write(
            self.style.SUCCESS(f"{status.capitalize()} chapter '{CHAPTER_TITLE}' for '{SUBJECT_TITLE}'.")
        )
