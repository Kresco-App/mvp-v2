"""
Management command: python manage.py seed_data
Creates realistic mock data for Moroccan Bac curriculum.
"""
from django.core.management.base import BaseCommand
from courses.models import Subject, Chapter, Lesson, ChapterBlock
from quizzes.models import Quiz, QuizQuestion, QuizOption


SUBJECTS = [
    {
        "title": "Mathématiques",
        "description": "Maîtrisez l'algèbre, la géométrie analytique, les suites et l'analyse pour réussir votre Bac.",
        "thumbnail_url": "",
        "chapters": [
            {
                "title": "Suites Numériques",
                "lessons": [
                    {"title": "Introduction aux suites arithmétiques", "duration": 720, "free": True},
                    {"title": "Suites géométriques et leurs propriétés", "duration": 840},
                    {"title": "Convergence et limites des suites", "duration": 900},
                    {"title": "Exercices corrigés — Suites", "duration": 1080},
                ],
                "blocks": [
                    {"title": "Rappel : Formules clés des suites", "content": "## Suites arithmétiques\n\nUne suite $(u_n)$ est arithmétique si $u_{n+1} - u_n = r$ (raison constante).\n\n**Terme général :** $u_n = u_0 + nr$\n\n**Somme :** $S = \\frac{(u_0 + u_n)(n+1)}{2}$\n\n## Suites géométriques\n\nUne suite $(u_n)$ est géométrique si $\\frac{u_{n+1}}{u_n} = q$ (raison constante).\n\n**Terme général :** $u_n = u_0 \\cdot q^n$"},
                ],
            },
            {
                "title": "Fonctions et Analyse",
                "lessons": [
                    {"title": "Limites de fonctions — Définition et calcul", "duration": 780, "free": True},
                    {"title": "Dérivabilité et étude de fonctions", "duration": 960},
                    {"title": "Fonctions logarithme et exponentielle", "duration": 1020},
                    {"title": "Intégration — Méthodes et applications", "duration": 1140},
                ],
                "blocks": [],
            },
            {
                "title": "Géométrie dans l'Espace",
                "lessons": [
                    {"title": "Vecteurs et produit scalaire en 3D", "duration": 660, "free": True},
                    {"title": "Plans et droites dans l'espace", "duration": 780},
                    {"title": "Barycentre et transformations", "duration": 840},
                ],
                "blocks": [],
            },
        ],
    },
    {
        "title": "Physique-Chimie",
        "description": "Comprenez la mécanique, l'électricité, la thermodynamique et la chimie organique.",
        "thumbnail_url": "",
        "chapters": [
            {
                "title": "Mécanique Newtonienne",
                "lessons": [
                    {"title": "Les lois de Newton — Rappels et approfondissement", "duration": 900, "free": True},
                    {"title": "Mouvement dans un champ de pesanteur uniforme", "duration": 840},
                    {"title": "Travail et énergie cinétique", "duration": 780},
                    {"title": "Chute libre et mouvement parabolique", "duration": 960},
                ],
                "blocks": [
                    {"title": "Formulaire Mécanique", "content": "## Lois de Newton\n\n**1ère loi (inertie):** Un objet au repos reste au repos en l'absence de force.\n\n**2ème loi:** $\\vec{F} = m\\vec{a}$\n\n**3ème loi:** Pour toute action, il existe une réaction égale et opposée."},
                ],
            },
            {
                "title": "Électricité et Circuits",
                "lessons": [
                    {"title": "Dipôles et lois des circuits", "duration": 720, "free": True},
                    {"title": "Le condensateur — Charge et décharge", "duration": 900},
                    {"title": "La bobine et les circuits RL", "duration": 840},
                ],
                "blocks": [],
            },
            {
                "title": "Chimie Organique",
                "lessons": [
                    {"title": "Nomenclature des composés organiques", "duration": 660, "free": True},
                    {"title": "Réactions d'estérification et d'hydrolyse", "duration": 780},
                    {"title": "Polymères et matériaux", "duration": 720},
                ],
                "blocks": [],
            },
        ],
    },
    {
        "title": "Sciences de la Vie et de la Terre",
        "description": "Explorez la biologie cellulaire, la génétique, l'écologie et la géologie.",
        "thumbnail_url": "",
        "chapters": [
            {
                "title": "Génétique et Hérédité",
                "lessons": [
                    {"title": "Les lois de Mendel et la monohybridation", "duration": 840, "free": True},
                    {"title": "Dihybridation et brassage génétique", "duration": 900},
                    {"title": "Génétique humaine et maladies héréditaires", "duration": 960},
                ],
                "blocks": [
                    {"title": "Vocabulaire de Génétique", "content": "## Termes essentiels\n\n- **Allèle :** Forme alternative d'un gène\n- **Génotype :** Constitution génétique d'un individu\n- **Phénotype :** Caractères observables\n- **Dominant / Récessif :** Nature des allèles\n- **Homozygote / Hétérozygote :** État du génotype"},
                ],
            },
            {
                "title": "Immunologie",
                "lessons": [
                    {"title": "Le système immunitaire — Vue d'ensemble", "duration": 720, "free": True},
                    {"title": "Réponse immunitaire spécifique et anticorps", "duration": 840},
                    {"title": "Les vaccins et la mémoire immunitaire", "duration": 780},
                ],
                "blocks": [],
            },
        ],
    },
    {
        "title": "Langue Française",
        "description": "Maîtrisez la langue française : expression écrite, lecture analytique et grammaire avancée.",
        "thumbnail_url": "",
        "chapters": [
            {
                "title": "Compréhension de l'Écrit",
                "lessons": [
                    {"title": "Lire et analyser un texte argumentatif", "duration": 600, "free": True},
                    {"title": "Les figures de style et leur analyse", "duration": 540},
                    {"title": "Méthode du commentaire littéraire", "duration": 720},
                ],
                "blocks": [],
            },
            {
                "title": "Expression Écrite",
                "lessons": [
                    {"title": "Rédiger un essai argumentatif", "duration": 660, "free": True},
                    {"title": "La dissertation — Plan et rédaction", "duration": 780},
                ],
                "blocks": [
                    {"title": "Connecteurs logiques", "content": "## Connecteurs logiques essentiels\n\n**Addition :** de plus, en outre, par ailleurs\n\n**Opposition :** cependant, néanmoins, toutefois, en revanche\n\n**Cause :** car, parce que, puisque, étant donné que\n\n**Conséquence :** donc, ainsi, par conséquent, c'est pourquoi\n\n**Illustration :** par exemple, notamment, c'est le cas de"},
                ],
            },
        ],
    },
    {
        "title": "Histoire-Géographie",
        "description": "Comprenez les grands événements du XXe siècle et les enjeux géopolitiques contemporains.",
        "thumbnail_url": "",
        "chapters": [
            {
                "title": "Le Monde en 1945",
                "lessons": [
                    {"title": "Les conséquences de la Seconde Guerre Mondiale", "duration": 780, "free": True},
                    {"title": "La Guerre Froide — Origines et bipolarisation", "duration": 840},
                    {"title": "La décolonisation en Afrique et en Asie", "duration": 900},
                ],
                "blocks": [],
            },
            {
                "title": "Le Maroc Contemporain",
                "lessons": [
                    {"title": "Le Maroc de l'indépendance à nos jours", "duration": 720, "free": True},
                    {"title": "Les réformes économiques et sociales au Maroc", "duration": 660},
                ],
                "blocks": [],
            },
        ],
    },
    {
        "title": "Philosophie",
        "description": "Développez votre pensée critique à travers les grands courants philosophiques.",
        "thumbnail_url": "",
        "chapters": [
            {
                "title": "La Conscience et le Sujet",
                "lessons": [
                    {"title": "La conscience de soi — Descartes et Hegel", "duration": 660, "free": True},
                    {"title": "L'inconscient selon Freud", "duration": 720},
                ],
                "blocks": [],
            },
        ],
    },
]

QUIZZES = [
    {
        "lesson_index": 0,  # first lesson of first chapter of first subject
        "subject": 0, "chapter": 0,
        "title": "Quiz — Suites arithmétiques",
        "pass_score": 60,
        "questions": [
            {
                "text": "Quelle est la raison d'une suite arithmétique dont u₀ = 3 et u₄ = 19 ?",
                "options": [("r = 4", True), ("r = 16", False), ("r = 3", False), ("r = 5", False)],
            },
            {
                "text": "La somme des 10 premiers termes d'une suite arithmétique de raison 2 et de premier terme 1 est :",
                "options": [("S = 100", True), ("S = 55", False), ("S = 110", False), ("S = 45", False)],
            },
            {
                "text": "Une suite géométrique de raison q = 2 et u₀ = 3. Quelle est la valeur de u₃ ?",
                "options": [("24", True), ("12", False), ("6", False), ("48", False)],
            },
            {
                "text": "Lequel des énoncés suivants caractérise une suite arithmétique ?",
                "options": [
                    ("u_{n+1} - u_n = constante", True),
                    ("u_{n+1} / u_n = constante", False),
                    ("u_n = n²", False),
                    ("u_n est décroissante", False),
                ],
            },
        ],
    },
    {
        "subject": 1, "chapter": 0,
        "title": "Quiz — Lois de Newton",
        "pass_score": 70,
        "questions": [
            {
                "text": "Un objet de masse 5 kg est soumis à une force de 20 N. Quelle est son accélération ?",
                "options": [("4 m/s²", True), ("100 m/s²", False), ("0.25 m/s²", False), ("25 m/s²", False)],
            },
            {
                "text": "Selon la 1ère loi de Newton, un objet en mouvement rectiligne uniforme :",
                "options": [
                    ("N'est soumis à aucune force résultante", True),
                    ("Subit une force dans la direction du mouvement", False),
                    ("Décélère naturellement", False),
                    ("Est en chute libre", False),
                ],
            },
            {
                "text": "La relation fondamentale de la dynamique est :",
                "options": [("ΣF = ma", True), ("F = mv", False), ("F = mv²", False), ("ΣF = mv²", False)],
            },
        ],
    },
    {
        "subject": 2, "chapter": 0,
        "title": "Quiz — Génétique Mendélienne",
        "pass_score": 70,
        "questions": [
            {
                "text": "Dans un croisement entre deux individus hétérozygotes (Aa × Aa), quelle est la probabilité d'obtenir un individu homozygote dominant (AA) ?",
                "options": [("25%", True), ("50%", False), ("75%", False), ("0%", False)],
            },
            {
                "text": "Quel terme désigne l'ensemble des caractères visibles d'un individu ?",
                "options": [("Phénotype", True), ("Génotype", False), ("Allèle", False), ("Locus", False)],
            },
            {
                "text": "Un allèle récessif s'exprime :",
                "options": [
                    ("Uniquement à l'état homozygote", True),
                    ("Toujours, quelle que soit la situation", False),
                    ("Uniquement chez la femelle", False),
                    ("À l'état hétérozygote", False),
                ],
            },
        ],
    },
]


class Command(BaseCommand):
    help = 'Seed the database with Moroccan Bac mock curriculum data'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Seeding database...'))

        created_subjects = []

        for s_idx, s_data in enumerate(SUBJECTS):
            subject, created = Subject.objects.get_or_create(
                title=s_data["title"],
                defaults={
                    "description": s_data["description"],
                    "thumbnail_url": s_data.get("thumbnail_url", ""),
                    "is_published": True,
                    "order": s_idx,
                }
            )
            if created:
                self.stdout.write(f'  ✓ Subject: {subject.title}')
            created_subjects.append(subject)

            for c_idx, c_data in enumerate(s_data["chapters"]):
                chapter, _ = Chapter.objects.get_or_create(
                    subject=subject,
                    title=c_data["title"],
                    defaults={"order": c_idx}
                )

                for l_idx, l_data in enumerate(c_data["lessons"]):
                    lesson, _ = Lesson.objects.get_or_create(
                        chapter=chapter,
                        title=l_data["title"],
                        defaults={
                            "vdocipher_id": f"mock-video-{s_idx}-{c_idx}-{l_idx}",
                            "duration_seconds": l_data["duration"],
                            "is_free_preview": l_data.get("free", False),
                            "order": l_idx,
                        }
                    )

                for b_idx, b_data in enumerate(c_data.get("blocks", [])):
                    ChapterBlock.objects.get_or_create(
                        chapter=chapter,
                        title=b_data["title"],
                        defaults={
                            "content": b_data["content"],
                            "block_type": "markdown",
                            "order": b_idx,
                        }
                    )

        # Create quizzes
        for q_data in QUIZZES:
            s_idx = q_data["subject"]
            c_idx = q_data["chapter"]
            if s_idx >= len(created_subjects):
                continue

            subject = created_subjects[s_idx]
            chapters = list(subject.chapters.order_by('order'))
            if c_idx >= len(chapters):
                continue

            chapter = chapters[c_idx]
            lessons = list(chapter.lessons.order_by('order'))
            if not lessons:
                continue

            lesson = lessons[0]

            quiz, created = Quiz.objects.get_or_create(
                lesson=lesson,
                defaults={
                    "title": q_data["title"],
                    "pass_score": q_data["pass_score"],
                }
            )

            if created:
                self.stdout.write(f'  ✓ Quiz: {quiz.title}')
                for q_idx, question_data in enumerate(q_data["questions"]):
                    question = QuizQuestion.objects.create(
                        quiz=quiz,
                        text=question_data["text"],
                        order=q_idx,
                    )
                    for opt_text, is_correct in question_data["options"]:
                        QuizOption.objects.create(
                            question=question,
                            text=opt_text,
                            is_correct=is_correct,
                        )

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Seed complete! {Subject.objects.count()} subjects, '
            f'{Chapter.objects.count()} chapters, '
            f'{Lesson.objects.count()} lessons, '
            f'{Quiz.objects.count()} quizzes.'
        ))
