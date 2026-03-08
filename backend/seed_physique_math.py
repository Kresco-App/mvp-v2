import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from courses.models import Subject, Chapter, ChapterSection

def seed_content():
    print("Seeding Physique and Math...")

    # PHYSIQUE
    physique, _ = Subject.objects.get_or_create(
        title="Physique",
        defaults={"description": "Cours complet de Physique."}
    )

    # Physique: Les ondes lumineuses
    chap_ondes, _ = Chapter.objects.get_or_create(
        subject=physique,
        title="Les ondes lumineuses",
        defaults={"order": 1, "description": "Propagation et propriétés des ondes lumineuses."}
    )

    # Sections for Ondes
    ondes_sections = [
        {
            "title": "Nature ondulatoire de la lumière",
            "vdo_id": "2b524afb877b4f00a665ac53d4081332",
            "activity_type": "OndeTrueFalse",
            "activity_data": {
                "statements": [
                    {
                        "statement": "La diffraction est un phénomène qui met en évidence la nature ondulatoire de la lumière.",
                        "isTrue": True,
                        "explanation": "La diffraction est un comportement typique des ondes."
                    },
                    {
                        "statement": "La lumière a besoin d'un milieu matériel pour se propager.",
                        "isTrue": False,
                        "explanation": "La lumière se propage dans le vide : c'est une onde électromagnétique."
                    },
                    {
                        "statement": "La dispersion par un prisme est liée au fait que l'indice dépend de la longueur d'onde.",
                        "isTrue": True
                    },
                    {
                        "statement": "La célérité de la lumière dans le vide dépend de la couleur.",
                        "isTrue": False,
                        "explanation": "Dans le vide, toutes les couleurs se propagent à la même vitesse c."
                    }
                ]
            },
            "order": 1
        },
        {
            "title": "Prisme de Descartes et dispersion",
            "vdo_id": "562c7b1b502044588678b678179430ba",
            "activity_type": "OndePropagation",
            "activity_data": {
                "question": "Associez chaque notion à sa définition",
                "pairs": [
                    { "id": "snell", "left": "Lois de Descartes", "right": "n₁ sin(i) = n₂ sin(r)" },
                    { "id": "indice", "left": "Indice de réfraction", "right": "n = c / v" },
                    { "id": "prisme", "left": "Prisme", "right": "Dévie et disperse la lumière blanche" },
                    { "id": "dispersion", "left": "Dispersion", "right": "Séparation des couleurs par réfraction" }
                ]
            },
            "order": 2
        },
        {
            "title": "Caractéristiques de la lumière comme onde",
            "vdo_id": "fa1c30a17b874965ac332e03f68545df",
            "activity_type": "OndeCaracteristiques",
            "activity_data": {
                "questions": [
                    {
                        "sentence": "La longueur d'onde est liée à la célérité et la fréquence : λ = v / {{blank}}",
                        "answer": "f",
                        "hint": "fréquence"
                    },
                    {
                        "sentence": "La période et la fréquence sont liées par : T = {{blank}} / f",
                        "answer": "1",
                        "hint": "constante numérique"
                    },
                    {
                        "sentence": "Dans un milieu d'indice n, la célérité vaut : v = c / {{blank}}",
                        "answer": "n",
                        "hint": "indice"
                    }
                ]
            },
            "order": 3
        }
    ]

    existing_ondes = {s.order: s for s in ChapterSection.objects.filter(chapter=chap_ondes)}
    used_orders = set()
    for item in ondes_sections:
        order = item["order"]
        used_orders.add(order)
        sec = existing_ondes.get(order) or ChapterSection(chapter=chap_ondes, order=order)
        sec.title = item["title"]
        sec.section_type = "video"
        sec.vdocipher_id = item["vdo_id"]
        sec.duration_seconds = 600
        sec.is_gating = True
        sec.activity_type = item["activity_type"]
        sec.activity_data = item.get("activity_data")
        sec.save()

    # Remove old sections not in the new program
    ChapterSection.objects.filter(chapter=chap_ondes).exclude(order__in=used_orders).delete()

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

    ensembles_sections = [
        {
            "title": "1. Introduction aux ensembles",
            "section_type": "video",
            "vdocipher_id": "dummy_ensembles_vid",
            "order": 1,
            "duration_seconds": 300
        },
        {
            "title": "2. QCM — Vocabulaire des ensembles",
            "section_type": "quiz",
            "order": 2,
            "quiz_data": {
                "questions": [
                    {
                        "text": "On note généralement l'ensemble des nombres naturels par :",
                        "options": [
                            {"text": "ℝ", "is_correct": False},
                            {"text": "ℕ", "is_correct": True},
                            {"text": "ℤ", "is_correct": False},
                            {"text": "∅", "is_correct": False}
                        ]
                    },
                    {
                        "text": "Le symbole “∈” signifie :",
                        "options": [
                            {"text": "Appartient à", "is_correct": True},
                            {"text": "Inclus dans", "is_correct": False},
                            {"text": "Union", "is_correct": False},
                            {"text": "Intersection", "is_correct": False}
                        ]
                    },
                    {
                        "text": "Si A ⊂ B, alors :",
                        "options": [
                            {"text": "A et B sont disjoints", "is_correct": False},
                            {"text": "A est inclus dans B", "is_correct": True},
                            {"text": "B est inclus dans A", "is_correct": False},
                            {"text": "A = ∅", "is_correct": False}
                        ]
                    }
                ]
            }
        },
        {
            "title": "3. Activité — Associer symboles et significations",
            "section_type": "activity",
            "activity_type": "matching",
            "activity_data": {
                "question": "Associez chaque symbole à sa signification",
                "pairs": [
                    {"id": "union", "left": "∪", "right": "Union"},
                    {"id": "inter", "left": "∩", "right": "Intersection"},
                    {"id": "subset", "left": "⊂", "right": "Inclus dans"},
                    {"id": "empty", "left": "∅", "right": "Ensemble vide"}
                ]
            },
            "order": 3
        },
        {
            "title": "4. Activité — Appartenance (glisser-déposer)",
            "section_type": "activity",
            "activity_type": "drag_and_drop",
            "activity_data": {
                "question": "Placez chaque élément dans le bon ensemble",
                "items": [
                    {"id": "2", "label": "2"},
                    {"id": "3", "label": "3"},
                    {"id": "0.5", "label": "1/2"},
                    {"id": "-1", "label": "-1"}
                ],
                "zones": [
                    {"id": "naturals", "label": "ℕ", "correctItemId": "2"},
                    {"id": "integers", "label": "ℤ", "correctItemId": "-1"},
                    {"id": "rationals", "label": "ℚ", "correctItemId": "0.5"},
                    {"id": "naturals2", "label": "ℕ", "correctItemId": "3"}
                ]
            },
            "order": 4
        },
        {
            "title": "5. QCM — Opérations sur les ensembles",
            "section_type": "quiz",
            "order": 5,
            "quiz_data": {
                "questions": [
                    {
                        "text": "Quelle opération représente l'intersection de A et B ?",
                        "options": [
                            {"text": "A ∪ B", "is_correct": False},
                            {"text": "A ∩ B", "is_correct": True},
                            {"text": "A \\ B", "is_correct": False},
                            {"text": "A Δ B", "is_correct": False}
                        ]
                    },
                    {
                        "text": "A \\ B correspond à :",
                        "options": [
                            {"text": "Les éléments de A qui ne sont pas dans B", "is_correct": True},
                            {"text": "Les éléments de B qui ne sont pas dans A", "is_correct": False},
                            {"text": "Tous les éléments de A et B", "is_correct": False},
                            {"text": "L'intersection", "is_correct": False}
                        ]
                    }
                ]
            }
        },
        {
            "title": "6. Activité — Ordre d'une construction",
            "section_type": "activity",
            "activity_type": "ordering",
            "activity_data": {
                "question": "Remettez dans l'ordre les étapes pour déterminer A ∩ B",
                "items": [
                    {"id": "s1", "label": "Identifier les éléments de A"},
                    {"id": "s2", "label": "Identifier les éléments de B"},
                    {"id": "s3", "label": "Garder uniquement les éléments communs"},
                    {"id": "s4", "label": "Former l'ensemble résultat"}
                ],
                "correctOrder": ["s1", "s2", "s3", "s4"]
            },
            "order": 6
        }
    ]

    existing_ensembles = {s.order: s for s in ChapterSection.objects.filter(chapter=chap_ensembles)}
    used_orders = set()
    for item in ensembles_sections:
        order = item["order"]
        used_orders.add(order)
        sec = existing_ensembles.get(order) or ChapterSection(chapter=chap_ensembles, order=order)
        sec.title = item["title"]
        sec.section_type = item["section_type"]
        sec.vdocipher_id = item.get("vdocipher_id", "")
        sec.duration_seconds = item.get("duration_seconds", 0)
        sec.quiz_data = item.get("quiz_data")
        sec.activity_type = item.get("activity_type", "")
        sec.activity_data = item.get("activity_data")
        sec.save()

    ChapterSection.objects.filter(chapter=chap_ensembles).exclude(order__in=used_orders).delete()

    # Math: Limites et continuité
    chap_limites, _ = Chapter.objects.get_or_create(
        subject=maths,
        title="Limites et continuité",
        defaults={"order": 2, "description": "Calcul de limites et théorèmes de continuité."}
    )

    limites_sections = [
        {
            "title": "1. Introduction aux limites",
            "section_type": "video",
            "vdocipher_id": "dummy_limites_vid",
            "order": 1,
            "duration_seconds": 450
        },
        {
            "title": "2. QCM — Limites usuelles",
            "section_type": "quiz",
            "order": 2,
            "quiz_data": {
                "questions": [
                    {
                        "text": "Quelle est la limite de 1/x quand x tend vers +∞ ?",
                        "options": [
                            {"text": "+∞", "is_correct": False},
                            {"text": "1", "is_correct": False},
                            {"text": "0", "is_correct": True},
                            {"text": "-∞", "is_correct": False}
                        ]
                    },
                    {
                        "text": "Limite de x² quand x tend vers -∞ :",
                        "options": [
                            {"text": "-∞", "is_correct": False},
                            {"text": "+∞", "is_correct": True},
                            {"text": "0", "is_correct": False},
                            {"text": "1", "is_correct": False}
                        ]
                    }
                ]
            }
        },
        {
            "title": "3. Activité — Propriétés des limites (texte à trous)",
            "section_type": "activity",
            "activity_type": "fill_in_blank",
            "activity_data": {
                "sentence": "Si lim f(x) = a et lim g(x) = b, alors lim (f(x) + g(x)) = {{blank}}",
                "answer": "a+b",
                "hint": "somme des limites (sans espaces)"
            },
            "order": 3
        },
        {
            "title": "4. Activité — Continuité (vrai/faux)",
            "section_type": "activity",
            "activity_type": "true_false",
            "activity_data": {
                "statement": "Une fonction polynomiale est continue sur ℝ.",
                "correct": True,
                "explanation": "Les fonctions polynomiales sont continues sur tout ℝ."
            },
            "order": 4
        },
        {
            "title": "5. QCM — Continuité et théorèmes",
            "section_type": "quiz",
            "order": 5,
            "quiz_data": {
                "questions": [
                    {
                        "text": "Une fonction est continue en a si :",
                        "options": [
                            {"text": "lim f(x) = f(a)", "is_correct": True},
                            {"text": "f(a) = 0", "is_correct": False},
                            {"text": "lim f(x) = 0", "is_correct": False},
                            {"text": "f est dérivable en a", "is_correct": False}
                        ]
                    },
                    {
                        "text": "Si f et g sont continues, alors f+g est :",
                        "options": [
                            {"text": "Continue", "is_correct": True},
                            {"text": "Discontinue", "is_correct": False},
                            {"text": "Non définie", "is_correct": False},
                            {"text": "Constante", "is_correct": False}
                        ]
                    }
                ]
            }
        },
        {
            "title": "6. Activité — Associer forme et limite",
            "section_type": "activity",
            "activity_type": "matching",
            "activity_data": {
                "question": "Associez chaque expression à sa limite quand x → 0",
                "pairs": [
                    {"id": "x", "left": "x", "right": "0"},
                    {"id": "sinx", "left": "sin(x)", "right": "0"},
                    {"id": "1x", "left": "1/x", "right": "∞ (diverge)"},
                    {"id": "x2", "left": "x²", "right": "0"}
                ]
            },
            "order": 6
        }
    ]

    existing_limites = {s.order: s for s in ChapterSection.objects.filter(chapter=chap_limites)}
    used_orders = set()
    for item in limites_sections:
        order = item["order"]
        used_orders.add(order)
        sec = existing_limites.get(order) or ChapterSection(chapter=chap_limites, order=order)
        sec.title = item["title"]
        sec.section_type = item["section_type"]
        sec.vdocipher_id = item.get("vdocipher_id", "")
        sec.duration_seconds = item.get("duration_seconds", 0)
        sec.quiz_data = item.get("quiz_data")
        sec.activity_type = item.get("activity_type", "")
        sec.activity_data = item.get("activity_data")
        sec.save()

    ChapterSection.objects.filter(chapter=chap_limites).exclude(order__in=used_orders).delete()

    print("Mathématiques seeded.")
    print("Content generation successful.")

if __name__ == "__main__":
    seed_content()
