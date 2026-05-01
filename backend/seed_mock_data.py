"""
Seed script: creates schema + populates RDS with realistic Moroccan Bac mock data.
Usage: cd backend && source venv/bin/activate && python seed_mock_data.py
"""
import asyncio, os, random
from datetime import date, datetime, timedelta, timezone
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
VALID_VDOCIPHER_IDS = [
    "fa1c30a17b874965ac332e03f68545df",
    "562c7b1b502044588678b678179430ba",
    "2b524afb877b4f00a665ac53d4081332",
    "ab23780708d9abdaf4afe627ad3bdb6b",
]

# ── async bootstrap ─────────────────────────────────────────────
async def main():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.models.base import Base
    # Import all models so metadata is populated
    from app.models import users, courses, quizzes, gamification, interactions  # noqa

    url = DATABASE_URL
    connect_args = {}
    if url.startswith("postgresql://"):
        from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
        p = urlparse(url)
        qs = parse_qs(p.query)
        if qs.pop("sslmode", [None])[0] == "require":
            connect_args["ssl"] = "require"
        url = urlunparse(p._replace(scheme="postgresql+asyncpg", query=urlencode({k: v[0] for k, v in qs.items()})))

    engine = create_async_engine(url, poolclass=NullPool, connect_args=connect_args)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Schema created")

    async with Session() as db:
        await seed_all(db)

    await engine.dispose()
    print("✅ Done!")


# ── Seed data ────────────────────────────────────────────────────
from app.models.users import User
from app.models.courses import Subject, Chapter, ChapterSection, Lesson, ChapterBlock, Activity, CoursePDF
from app.models.quizzes import Quiz, QuizQuestion, QuizOption
from app.models.gamification import UserXP, XPTransaction, LessonProgress, ContentProgress, DailyQuest, QuizResult
from app.models.interactions import Comment

SUBJECTS_DATA = [
    {
        "title": "Mathématiques", "description": "Programme complet de Mathématiques 2BAC Sciences Mathématiques",
        "thumbnail_url": "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400",
        "chapters": [
            {"title": "Les suites numériques", "sections": [
                ("Introduction aux suites", "video", 720), ("Suites arithmétiques", "video", 900),
                ("Suites géométriques", "video", 840), ("Quiz - Suites", "quiz", 0),
                ("Convergence des suites", "video", 960), ("Exercices corrigés", "text", 0),
            ]},
            {"title": "Les limites et la continuité", "sections": [
                ("Notion de limite", "video", 780), ("Limites et opérations", "video", 660),
                ("Continuité d'une fonction", "video", 900), ("Quiz - Limites", "quiz", 0),
                ("Théorème des valeurs intermédiaires", "video", 720), ("Applications", "activity", 0),
            ]},
            {"title": "La dérivation", "sections": [
                ("Nombre dérivé et tangente", "video", 840), ("Fonction dérivée", "video", 780),
                ("Dérivées des fonctions usuelles", "video", 660), ("Quiz - Dérivation", "quiz", 0),
                ("Études de fonctions", "video", 1020), ("Optimisation", "text", 0),
            ]},
            {"title": "Les fonctions logarithmiques", "sections": [
                ("Fonction logarithme népérien", "video", 900), ("Propriétés de ln", "video", 720),
                ("Fonction logarithme décimal", "video", 600), ("Quiz - Logarithmes", "quiz", 0),
                ("Équations et inéquations", "video", 840),
            ]},
            {"title": "Les fonctions exponentielles", "sections": [
                ("Fonction exponentielle", "video", 960), ("Propriétés de exp", "video", 780),
                ("Croissances comparées", "video", 720), ("Quiz - Exponentielles", "quiz", 0),
            ]},
        ],
    },
    {
        "title": "Physique-Chimie", "description": "Cours de Physique-Chimie 2BAC Sciences",
        "thumbnail_url": "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=400",
        "chapters": [
            {"title": "Les ondes mécaniques", "sections": [
                ("Définition et propriétés", "video", 840), ("Propagation des ondes", "video", 900),
                ("Ondes sonores", "video", 720), ("Quiz - Ondes", "quiz", 0),
                ("Effet Doppler", "video", 660), ("TP simulé", "activity", 0),
            ]},
            {"title": "Les ondes lumineuses", "sections": [
                ("Diffraction de la lumière", "video", 780), ("Interférences lumineuses", "video", 900),
                ("Quiz - Ondes lumineuses", "quiz", 0), ("Spectroscopie", "video", 720),
            ]},
            {"title": "Transformations nucléaires", "sections": [
                ("Radioactivité", "video", 960), ("Décroissance radioactive", "video", 840),
                ("Fission et fusion", "video", 780), ("Quiz - Nucléaire", "quiz", 0),
                ("Applications médicales", "text", 0),
            ]},
            {"title": "Électricité - RC et RL", "sections": [
                ("Dipôle RC", "video", 900), ("Dipôle RL", "video", 840),
                ("Régime transitoire", "video", 720), ("Quiz - Circuits", "quiz", 0),
            ]},
        ],
    },
    {
        "title": "Sciences de la Vie et de la Terre", "description": "Programme SVT 2BAC",
        "thumbnail_url": "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=400",
        "chapters": [
            {"title": "La génétique humaine", "sections": [
                ("Transmission des caractères héréditaires", "video", 900),
                ("Arbres généalogiques", "video", 780), ("Quiz - Génétique", "quiz", 0),
                ("Maladies génétiques", "video", 840), ("Exercices", "text", 0),
            ]},
            {"title": "L'immunologie", "sections": [
                ("Le soi et le non-soi", "video", 720), ("Réponse immunitaire", "video", 960),
                ("Vaccination", "video", 660), ("Quiz - Immunologie", "quiz", 0),
            ]},
            {"title": "La géologie", "sections": [
                ("Tectonique des plaques", "video", 900), ("Les roches", "video", 780),
                ("Quiz - Géologie", "quiz", 0), ("Ressources naturelles", "text", 0),
            ]},
        ],
    },
    {
        "title": "Philosophie", "description": "Cours de Philosophie Terminale",
        "thumbnail_url": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400",
        "chapters": [
            {"title": "La conscience", "sections": [
                ("Qu'est-ce que la conscience?", "video", 1080), ("Conscience et inconscient", "video", 960),
                ("Quiz - Conscience", "quiz", 0), ("Dissertation guidée", "text", 0),
            ]},
            {"title": "La liberté", "sections": [
                ("Libre arbitre et déterminisme", "video", 1020), ("La liberté politique", "video", 900),
                ("Quiz - Liberté", "quiz", 0),
            ]},
            {"title": "La vérité", "sections": [
                ("Vérité et opinion", "video", 960), ("Les critères de la vérité", "video", 840),
                ("Quiz - Vérité", "quiz", 0), ("Texte de Descartes", "text", 0),
            ]},
        ],
    },
    {
        "title": "Français", "description": "Langue française et littérature",
        "thumbnail_url": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400",
        "chapters": [
            {"title": "Le Dernier Jour d'un Condamné", "sections": [
                ("Présentation de l'œuvre", "video", 720), ("Analyse des thèmes", "video", 900),
                ("Quiz - Le Condamné", "quiz", 0), ("Commentaire composé", "text", 0),
            ]},
            {"title": "La Boîte à Merveilles", "sections": [
                ("Biographie de Sefrioui", "video", 600), ("Résumé et structure", "video", 840),
                ("Quiz - La Boîte", "quiz", 0), ("Personnages principaux", "text", 0),
            ]},
            {"title": "Antigone de Jean Anouilh", "sections": [
                ("Contexte historique", "video", 720), ("Analyse d'Antigone", "video", 960),
                ("Le conflit tragique", "video", 840), ("Quiz - Antigone", "quiz", 0),
            ]},
        ],
    },
    {
        "title": "Anglais", "description": "English Language - 2BAC",
        "thumbnail_url": "https://images.unsplash.com/photo-1543109740-4bdb38fda756?w=400",
        "chapters": [
            {"title": "Writing Skills", "sections": [
                ("Essay Structure", "video", 780), ("Argumentative Writing", "video", 900),
                ("Quiz - Writing", "quiz", 0), ("Practice Essay", "text", 0),
            ]},
            {"title": "Grammar Review", "sections": [
                ("Tenses Review", "video", 720), ("Conditional Sentences", "video", 660),
                ("Reported Speech", "video", 780), ("Quiz - Grammar", "quiz", 0),
            ]},
        ],
    },
]

QUIZ_BANK = {
    "Mathématiques": [
        {"q": "Quelle est la limite de (1+1/n)^n quand n→+∞?", "opts": ["e", "1", "0", "+∞"], "correct": 0},
        {"q": "La dérivée de ln(x) est:", "opts": ["1/x", "x", "ln(x)/x", "e^x"], "correct": 0},
        {"q": "Si u_n = 3n + 1, la suite est:", "opts": ["Arithmétique", "Géométrique", "Ni l'un ni l'autre", "Constante"], "correct": 0},
        {"q": "exp(ln(x)) = ?", "opts": ["x", "1", "e", "ln(x)"], "correct": 0},
    ],
    "Physique-Chimie": [
        {"q": "La célérité du son dans l'air est environ:", "opts": ["340 m/s", "3×10⁸ m/s", "1500 m/s", "100 m/s"], "correct": 0},
        {"q": "La demi-vie du carbone 14 est:", "opts": ["5730 ans", "1600 ans", "14 ans", "100 000 ans"], "correct": 0},
        {"q": "La constante de temps d'un circuit RC est:", "opts": ["τ = RC", "τ = R/C", "τ = R+C", "τ = 1/RC"], "correct": 0},
    ],
    "Sciences de la Vie et de la Terre": [
        {"q": "Le groupe sanguin est déterminé par:", "opts": ["Les gènes", "L'environnement", "L'alimentation", "L'âge"], "correct": 0},
        {"q": "Les anticorps sont produits par:", "opts": ["Les lymphocytes B", "Les globules rouges", "Les plaquettes", "Les neurones"], "correct": 0},
    ],
    "Philosophie": [
        {"q": "Qui a dit 'Je pense donc je suis'?", "opts": ["Descartes", "Platon", "Kant", "Nietzsche"], "correct": 0},
        {"q": "L'inconscient est un concept central chez:", "opts": ["Freud", "Aristote", "Marx", "Rousseau"], "correct": 0},
    ],
    "Français": [
        {"q": "Qui a écrit 'Le Dernier Jour d'un Condamné'?", "opts": ["Victor Hugo", "Balzac", "Zola", "Flaubert"], "correct": 0},
        {"q": "'La Boîte à Merveilles' est une œuvre:", "opts": ["Autobiographique", "Théâtrale", "Poétique", "Épistolaire"], "correct": 0},
    ],
    "Anglais": [
        {"q": "Which tense: 'I have been studying for 3 hours'?", "opts": ["Present perfect continuous", "Past simple", "Future perfect", "Past continuous"], "correct": 0},
        {"q": "The correct conditional: 'If I ___ rich, I would travel.'", "opts": ["were", "am", "will be", "was being"], "correct": 0},
    ],
}

MOCK_USERS = [
    {"email": "ahmed.benali@gmail.com", "full_name": "Ahmed Benali", "niveau": "2bac", "filiere": "Bac Sciences Mathematiques A"},
    {"email": "fatima.zahra@gmail.com", "full_name": "Fatima Zahra El Idrissi", "niveau": "2bac", "filiere": "Bac Sciences Physiques"},
    {"email": "youssef.amrani@gmail.com", "full_name": "Youssef Amrani", "niveau": "2bac", "filiere": "Bac Sciences Mathematiques B"},
    {"email": "khadija.bennani@gmail.com", "full_name": "Khadija Bennani", "niveau": "1bac", "filiere": "Bac SVT"},
    {"email": "omar.tazi@gmail.com", "full_name": "Omar Tazi", "niveau": "2bac", "filiere": "Bac Sciences Economiques"},
    {"email": "salma.alaoui@gmail.com", "full_name": "Salma Alaoui", "niveau": "2bac", "filiere": "Bac Sciences Mathematiques A", "is_pro": True},
    {"email": "hamza.fassi@gmail.com", "full_name": "Hamza Fassi Fihri", "niveau": "2bac", "filiere": "Bac Sciences Physiques", "is_pro": True},
    {"email": "imane.chraibi@gmail.com", "full_name": "Imane Chraibi", "niveau": "1bac", "filiere": "Bac Lettres"},
    {"email": "mehdi.berrada@gmail.com", "full_name": "Mehdi Berrada", "niveau": "2bac", "filiere": "Bac SVT", "is_pro": True},
    {"email": "nadia.hakimi@gmail.com", "full_name": "Nadia Hakimi", "niveau": "2bac", "filiere": "Bac Sciences Mathematiques A"},
]


async def seed_all(db: AsyncSession):
    from sqlalchemy import select, text

    # Check if already seeded
    result = await db.execute(select(Subject))
    if result.scalars().first():
        print("⚠️  Data already exists, skipping seed.")
        return

    # 1. Create users
    print("👤 Creating users...")
    user_objects = []
    for u in MOCK_USERS:
        user = User(email=u["email"], full_name=u["full_name"], niveau=u["niveau"],
                     filiere=u["filiere"], is_pro=u.get("is_pro", False), password="!")
        db.add(user)
        user_objects.append(user)
    await db.flush()

    # Create XP records for all users
    for i, user in enumerate(user_objects):
        xp_val = random.randint(50, 2000)
        streak = random.randint(0, 15)
        db.add(UserXP(user_id=user.id, total_xp=xp_val, streak_days=streak,
                       last_active_date=date.today() - timedelta(days=random.randint(0, 3))))
    await db.flush()
    print(f"  ✅ {len(user_objects)} users created")

    # 2. Create subjects, chapters, sections
    print("📚 Creating courses...")
    all_sections = []
    quiz_section_map = []  # (section, subject_title)

    for order, subj_data in enumerate(SUBJECTS_DATA):
        subject = Subject(title=subj_data["title"], description=subj_data["description"],
                          thumbnail_url=subj_data["thumbnail_url"], is_published=True, order=order)
        db.add(subject)
        await db.flush()

        for ch_order, ch_data in enumerate(subj_data["chapters"]):
            chapter = Chapter(subject_id=subject.id, title=ch_data["title"],
                              description=f"Chapitre sur {ch_data['title']}", order=ch_order)
            db.add(chapter)
            await db.flush()

            # Also create a legacy Lesson for each video section (keeps old routes working)
            lesson_order = 0

            for sec_order, (sec_title, sec_type, duration) in enumerate(ch_data["sections"]):
                is_free = sec_order == 0  # First section of each chapter is free preview
                vdocipher_id = VALID_VDOCIPHER_IDS[(subject.id + chapter.id + sec_order) % len(VALID_VDOCIPHER_IDS)] if sec_type == "video" else ""

                quiz_data = None
                activity_data = None
                content = ""

                if sec_type == "quiz":
                    quiz_section_map.append((None, subj_data["title"], chapter.id, sec_order))  # placeholder
                elif sec_type == "text":
                    content = f"# {sec_title}\n\nContenu détaillé pour {sec_title}. Ce chapitre couvre les concepts fondamentaux..."
                elif sec_type == "activity":
                    activity_data = {"type": "drag_and_drop", "items": [
                        {"id": 1, "label": "Élément A", "target": "Zone 1"},
                        {"id": 2, "label": "Élément B", "target": "Zone 2"},
                    ]}

                section = ChapterSection(
                    chapter_id=chapter.id, title=sec_title, section_type=sec_type,
                    order=sec_order, is_gating=(sec_type in ("quiz", "video")),
                    vdocipher_id=vdocipher_id, duration_seconds=duration,
                    is_free_preview=is_free, content=content,
                    quiz_data=quiz_data, pass_score=70,
                    activity_type="drag_and_drop" if sec_type == "activity" else "",
                    activity_data=activity_data,
                )
                db.add(section)
                all_sections.append(section)

                # Create legacy lesson for video sections
                if sec_type == "video":
                    lesson = Lesson(chapter_id=chapter.id, title=sec_title,
                                    vdocipher_id=vdocipher_id, duration_seconds=duration,
                                    is_free_preview=is_free, order=lesson_order)
                    db.add(lesson)
                    lesson_order += 1

        await db.flush()

    print(f"  ✅ {len(SUBJECTS_DATA)} subjects created")

    # 3. Create quizzes (both inline JSON and normalized)
    print("📝 Creating quizzes...")
    # Get all quiz-type sections
    from sqlalchemy import select
    quiz_sections = await db.execute(
        select(ChapterSection).where(ChapterSection.section_type == "quiz")
    )
    quiz_secs = quiz_sections.scalars().all()

    # Get all lessons for normalized quizzes
    all_lessons = await db.execute(select(Lesson))
    lessons_list = all_lessons.scalars().all()

    # Assign quiz data to quiz sections
    for qs in quiz_secs:
        # Get parent chapter to find subject
        ch = await db.execute(select(Chapter).where(Chapter.id == qs.chapter_id))
        chapter_obj = ch.scalar_one()
        subj = await db.execute(select(Subject).where(Subject.id == chapter_obj.subject_id))
        subject_obj = subj.scalar_one()
        
        bank = QUIZ_BANK.get(subject_obj.title, QUIZ_BANK["Mathématiques"])
        questions = random.sample(bank, min(len(bank), 3))

        quiz_json = {"questions": []}
        for q in questions:
            quiz_json["questions"].append({
                "text": q["q"],
                "options": [{"text": o, "is_correct": i == q["correct"]} for i, o in enumerate(q["opts"])],
            })
        qs.quiz_data = quiz_json
    await db.flush()

    # Create normalized quizzes for first 6 lessons
    for i, lesson in enumerate(lessons_list[:6]):
        ch = await db.execute(select(Chapter).where(Chapter.id == lesson.chapter_id))
        chapter_obj = ch.scalar_one()
        subj = await db.execute(select(Subject).where(Subject.id == chapter_obj.subject_id))
        subject_obj = subj.scalar_one()

        quiz = Quiz(lesson_id=lesson.id, title=f"Quiz - {lesson.title}", pass_score=70)
        db.add(quiz)
        await db.flush()

        bank = QUIZ_BANK.get(subject_obj.title, QUIZ_BANK["Mathématiques"])
        for q_order, q_data in enumerate(bank[:3]):
            question = QuizQuestion(quiz_id=quiz.id, text=q_data["q"], order=q_order)
            db.add(question)
            await db.flush()
            for opt_i, opt_text in enumerate(q_data["opts"]):
                db.add(QuizOption(question_id=question.id, text=opt_text, is_correct=(opt_i == q_data["correct"])))
    await db.flush()
    print(f"  ✅ Quizzes created")

    # 4. Progress & XP data
    print("🎮 Creating progress data...")
    # Mark some sections as completed for each user
    for user in user_objects:
        num_completed = random.randint(3, 15)
        completed_sections = random.sample(all_sections[:30], min(num_completed, len(all_sections[:30])))
        for sec in completed_sections:
            db.add(ContentProgress(user_id=user.id, item_type="section", item_id=sec.id))

        # XP transactions
        reasons = ["video_complete", "quiz_pass", "daily_login", "streak_bonus", "lab_complete"]
        for _ in range(random.randint(5, 20)):
            reason = random.choice(reasons)
            amount = {"video_complete": 10, "quiz_pass": 20, "daily_login": 10, "streak_bonus": 25, "lab_complete": 50}[reason]
            db.add(XPTransaction(
                user_id=user.id, amount=amount, reason=reason,
                description=f"Auto-generated {reason}",
                created_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30)),
            ))

        # Lesson progress for some lessons
        for lesson in random.sample(lessons_list[:15], min(5, len(lessons_list[:15]))):
            watched = random.randint(60, lesson.duration_seconds) if lesson.duration_seconds > 0 else 120
            status = "completed" if watched > (lesson.duration_seconds * 0.9 if lesson.duration_seconds else 100) else "started"
            db.add(LessonProgress(user_id=user.id, lesson_id=lesson.id, watched_seconds=watched, status=status))

    await db.flush()
    print(f"  ✅ Progress data created")

    # 5. Comments
    print("💬 Creating comments...")
    comment_texts = [
        "Très bien expliqué, merci!", "J'ai pas compris la partie sur les limites...",
        "Est-ce que c'est au programme du national?", "Quelqu'un peut m'expliquer l'exercice 3?",
        "Excellent cours, continuez comme ça!", "La qualité vidéo est top 👌",
        "Peut-on avoir plus d'exercices corrigés?", "Merci prof, c'est clair maintenant!",
        "Je recommande ce cours à tous les bacheliers", "Le quiz était difficile mais instructif",
    ]
    for _ in range(25):
        user = random.choice(user_objects)
        sec = random.choice(all_sections[:20])
        db.add(Comment(
            user_id=user.id, target_type="section", target_id=sec.id,
            body=random.choice(comment_texts),
        ))
    await db.flush()
    print(f"  ✅ 25 comments created")

    # 6. Daily quests for today
    print("🎯 Creating daily quests...")
    templates = [
        {"quest_type": "complete_lesson", "title": "Compléter 1 leçon", "target": 1, "xp_reward": 25},
        {"quest_type": "pass_quiz", "title": "Réussir 1 quiz", "target": 1, "xp_reward": 50},
        {"quest_type": "earn_xp", "title": "Gagner 100 XP aujourd'hui", "target": 100, "xp_reward": 25},
    ]
    for user in user_objects:
        for t in templates:
            progress = random.randint(0, t["target"])
            db.add(DailyQuest(
                user_id=user.id, date=date.today(),
                quest_type=t["quest_type"], title=t["title"],
                target=t["target"], progress=progress,
                xp_reward=t["xp_reward"], completed=(progress >= t["target"]),
            ))
    await db.flush()
    print(f"  ✅ Daily quests created")

    # 7. Quiz results
    print("📊 Creating quiz results...")
    all_quizzes = (await db.execute(select(Quiz))).scalars().all()
    for user in user_objects[:7]:
        for quiz in random.sample(all_quizzes, min(3, len(all_quizzes))):
            score = random.randint(40, 100)
            db.add(QuizResult(user_id=user.id, quiz_id=quiz.id, score=score, passed=(score >= 70)))
    await db.flush()
    print(f"  ✅ Quiz results created")

    await db.commit()
    print("\n🎉 All mock data seeded successfully!")


if __name__ == "__main__":
    asyncio.run(main())
