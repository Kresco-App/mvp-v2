from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

VIDEO_ID = "dQw4w9WgXcQ"

EXAM_SPECS: dict[str, list[tuple[int, str, list[str]]]] = {
    "Mathematiques": [
        (2024, "Rattrapage", ["Nombres complexes", "Analyse", "Probabilites", "Arithmetique"]),
        (2023, "Session normale", ["Fonctions", "Suites", "Geometrie", "Denombrement"]),
    ],
    "Physique-Chimie": [
        (2024, "Rattrapage", ["Ondes", "Mecanique", "Electricite", "Chimie"]),
        (2023, "Session normale", ["Diffraction", "Mouvement", "Circuit RC", "Dosage"]),
    ],
    "SVT": [
        (2024, "Session normale", ["Genetique", "Immunite", "Enzymes"]),
        (2023, "Rattrapage", ["Respiration cellulaire", "Geologie", "Heredite"]),
    ],
    "Philosophie": [
        (2024, "Rattrapage", ["Dissertation guidee", "Analyse de texte"]),
        (2023, "Session normale", ["La liberte", "Verite et opinion"]),
    ],
    "Anglais": [
        (2024, "Rattrapage", ["Reading comprehension", "Writing task"]),
        (2023, "Session normale", ["Grammar and vocabulary", "Essay writing"]),
    ],
}

CURRENT_YEAR_EXTRAS: dict[str, list[str]] = {
    "Mathematiques": ["Nombres complexes", "Analyse", "Probabilites"],
    "Physique-Chimie": ["Mecanique", "Electricite", "Chimie"],
    "SVT": ["Immunite", "Enzymes"],
    "Philosophie": ["Analyse de texte"],
    "Anglais": ["Writing task"],
}

STATEMENTS = {
    "Nombres complexes": "Determiner la forme algebrique du nombre complexe puis interpreter le resultat dans le plan.",
    "Analyse": "Etudier les variations de la fonction proposee et dresser son tableau de variations.",
    "Probabilites": "Calculer la probabilite demandee puis justifier le modele utilise.",
    "Arithmetique": "Resoudre la congruence proposee et conclure sur les entiers possibles.",
    "Fonctions": "Etudier le domaine, les limites et la monotonie de la fonction.",
    "Suites": "Montrer la recurrence puis determiner la limite de la suite.",
    "Geometrie": "Exploiter les relations vectorielles pour determiner la position demandee.",
    "Denombrement": "Compter les cas favorables et comparer avec le nombre total de cas.",
    "Ondes": "Exploiter une figure de diffraction pour determiner une longueur d onde.",
    "Mecanique": "Appliquer la deuxieme loi de Newton au systeme etudie.",
    "Electricite": "Etudier la charge du condensateur dans un circuit RC.",
    "Chimie": "Exploiter le tableau d avancement et determiner la concentration inconnue.",
    "Diffraction": "Relier l ecart angulaire aux caracteristiques de la fente.",
    "Mouvement": "Determiner les equations horaires et la nature du mouvement.",
    "Circuit RC": "Identifier la constante de temps puis interpreter la courbe.",
    "Dosage": "Utiliser l equivalence pour trouver la quantite de matiere initiale.",
    "Genetique": "Analyser un arbre genealogique et discuter le mode de transmission.",
    "Immunite": "Identifier les acteurs de la reponse immunitaire et leur role.",
    "Enzymes": "Exploiter les resultats experimentaux pour decrire l activite enzymatique.",
    "Respiration cellulaire": "Relier les mesures a la production d energie cellulaire.",
    "Geologie": "Interpreter une coupe geologique et dater les evenements.",
    "Heredite": "Determiner les genotypes possibles a partir du croisement.",
    "Dissertation guidee": "Construire une introduction, une problematique et un plan argumente.",
    "Analyse de texte": "Extraire la these du texte et discuter ses arguments.",
    "La liberte": "Problematiser la notion de liberte a partir du sujet propose.",
    "Verite et opinion": "Comparer verite, croyance et opinion dans une argumentation courte.",
    "Reading comprehension": "Read the text, identify the main idea, and answer with evidence.",
    "Writing task": "Write a coherent paragraph using the required connectors.",
    "Grammar and vocabulary": "Choose the correct tense and justify the vocabulary choices.",
    "Essay writing": "Write a short essay with an introduction, arguments, and conclusion.",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed repeatable local Exam Bank demo examples.")
    parser.add_argument(
        "--database",
        action="append",
        type=Path,
        default=[],
        help="SQLite database path. Can be passed more than once.",
    )
    args = parser.parse_args()
    databases = args.database or [Path("backend/db.sqlite3")]

    for database in databases:
        seed_database(database)


def seed_database(database: Path) -> None:
    if not database.exists():
        raise FileNotFoundError(database)

    with sqlite3.connect(database) as connection:
        cursor = connection.cursor()
        subjects = dict(cursor.execute("select title, id from subjects").fetchall())
        for subject_title, exams in EXAM_SPECS.items():
            subject_id = subjects.get(subject_title)
            if not subject_id:
                continue
            topic_ids = [
                row[0]
                for row in cursor.execute(
                    "select id from topics where subject_id = ? and status = ? order by id",
                    (subject_id, "published"),
                ).fetchall()
            ]
            for year, session, problem_titles in exams:
                exam_id = upsert_exam(cursor, subject_id, subject_title, year, session)
                for order, title in enumerate(problem_titles, start=1):
                    topic_id = topic_ids[(order - 1) % len(topic_ids)] if topic_ids else None
                    problem_id = upsert_problem(cursor, exam_id, topic_id, order, title)
                    upsert_part(cursor, problem_id, topic_id, 1, "Part A", title)
                    upsert_part(cursor, problem_id, topic_id, 2, "Part B", f"{title} extension")
            enrich_current_exam(cursor, subject_id, topic_ids, CURRENT_YEAR_EXTRAS.get(subject_title, []))
        connection.commit()

    print(f"Seeded Exam Bank examples in {database}")


def enrich_current_exam(
    cursor: sqlite3.Cursor,
    subject_id: int,
    topic_ids: list[int],
    extra_titles: list[str],
) -> None:
    exam_id = scalar(
        cursor,
        "select id from exams where subject_id = ? and year = ? and session like ? order by id limit 1",
        (subject_id, 2025, "Session normale%"),
    )
    if exam_id is None:
        return

    existing = cursor.execute(
        'select id, topic_id, title from exam_problems where exam_id = ? order by "order", id',
        (exam_id,),
    ).fetchall()
    for problem_id, topic_id, title in existing:
        upsert_part(cursor, int(problem_id), topic_id, 1, "Part A", title)
        upsert_part(cursor, int(problem_id), topic_id, 2, "Part B", f"{title} extension")

    for offset, title in enumerate(extra_titles, start=2):
        topic_id = topic_ids[(offset - 1) % len(topic_ids)] if topic_ids else None
        problem_id = upsert_problem(cursor, int(exam_id), topic_id, offset, title)
        upsert_part(cursor, problem_id, topic_id, 1, "Part A", title)
        upsert_part(cursor, problem_id, topic_id, 2, "Part B", f"{title} extension")


def upsert_exam(cursor: sqlite3.Cursor, subject_id: int, subject_title: str, year: int, session: str) -> int:
    exam_id = scalar(
        cursor,
        "select id from exams where subject_id = ? and year = ? and session = ?",
        (subject_id, year, session),
    )
    title = f"Bac {year} - {subject_title}"
    if exam_id is None:
        cursor.execute(
            "insert into exams (subject_id, title, year, session, statement_url, status, required_tier, required_feature_key, is_free_preview) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (subject_id, title, year, session, "", "published", "", "", 1),
        )
        return int(cursor.lastrowid)

    cursor.execute(
        "update exams set title = ?, statement_url = ?, status = ?, required_tier = ?, required_feature_key = ?, is_free_preview = ? where id = ?",
        (title, "", "published", "", "", 1, exam_id),
    )
    return int(exam_id)


def upsert_problem(cursor: sqlite3.Cursor, exam_id: int, topic_id: int | None, order: int, title: str) -> int:
    problem_id = scalar(cursor, 'select id from exam_problems where exam_id = ? and "order" = ?', (exam_id, order))
    resource_id = upsert_resource(cursor, topic_id, title)
    statement = STATEMENTS.get(title, f"Traiter le probleme {title} et justifier chaque etape.")
    solution = (
        f"Correction structuree pour {title}: identifier les donnees, appliquer la methode du cours, "
        "puis verifier la coherence du resultat."
    )
    concept_slugs = json.dumps([slugify(title), "bac"])
    values = (
        topic_id,
        resource_id,
        title,
        statement,
        solution,
        "",
        order,
        "bac",
        "published",
        "",
        "",
        1,
        concept_slugs,
    )
    if problem_id is None:
        cursor.execute(
            'insert into exam_problems (exam_id, topic_id, video_resource_id, title, statement, written_solution, written_solution_url, "order", difficulty, status, required_tier, required_feature_key, is_free_preview, concept_slugs) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (exam_id, *values),
        )
        return int(cursor.lastrowid)

    cursor.execute(
        'update exam_problems set topic_id = ?, video_resource_id = ?, title = ?, statement = ?, written_solution = ?, written_solution_url = ?, "order" = ?, difficulty = ?, status = ?, required_tier = ?, required_feature_key = ?, is_free_preview = ?, concept_slugs = ? where id = ?',
        (*values, problem_id),
    )
    return int(problem_id)


def upsert_resource(cursor: sqlite3.Cursor, topic_id: int | None, title: str) -> int:
    resource_title = f"Demo correction video - {title}"
    resource_id = scalar(
        cursor,
        "select id from resources where title = ? and provider = ? and provider_resource_id = ?",
        (resource_title, "youtube", VIDEO_ID),
    )
    metadata = json.dumps({"source": "exam_bank_demo"})
    if resource_id is None:
        cursor.execute(
            "insert into resources (topic_id, title, resource_type, provider, provider_resource_id, url, summary, metadata_json, status, is_free_preview, required_tier, required_feature_key) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (topic_id, resource_title, "video", "youtube", VIDEO_ID, "", f"Correction video for {title}.", metadata, "published", 1, "", ""),
        )
        return int(cursor.lastrowid)

    cursor.execute(
        "update resources set topic_id = ?, resource_type = ?, status = ?, is_free_preview = ?, summary = ?, metadata_json = ? where id = ?",
        (topic_id, "video", "published", 1, f"Correction video for {title}.", metadata, resource_id),
    )
    return int(resource_id)


def upsert_part(
    cursor: sqlite3.Cursor,
    problem_id: int,
    topic_id: int | None,
    order: int,
    label: str,
    title: str,
) -> None:
    part_id = scalar(
        cursor,
        'select id from exam_problem_parts where exam_problem_id = ? and "order" = ?',
        (problem_id, order),
    )
    statement = f"{label}. Work through the {title.lower()} step before watching the correction."
    solution = f"{label}. Isolate the key formula, substitute cleanly, and check the final condition."
    values = (
        topic_id,
        None,
        label,
        title,
        statement,
        solution,
        "",
        "",
        order,
        "bac",
        json.dumps([slugify(title)]),
        json.dumps({"source": "exam_bank_demo"}),
        "published",
        "",
        "",
        1,
    )
    if part_id is None:
        cursor.execute(
            'insert into exam_problem_parts (exam_problem_id, topic_id, video_resource_id, part_label, title, statement_body, written_solution_body, written_solution_url, correction_video_url, "order", difficulty, concept_slugs, metadata_json, status, required_tier, required_feature_key, is_free_preview) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (problem_id, *values),
        )
        return

    cursor.execute(
        'update exam_problem_parts set topic_id = ?, video_resource_id = ?, part_label = ?, title = ?, statement_body = ?, written_solution_body = ?, written_solution_url = ?, correction_video_url = ?, "order" = ?, difficulty = ?, concept_slugs = ?, metadata_json = ?, status = ?, required_tier = ?, required_feature_key = ?, is_free_preview = ? where id = ?',
        (*values, part_id),
    )


def scalar(cursor: sqlite3.Cursor, query: str, params: tuple[object, ...]) -> int | None:
    row = cursor.execute(query, params).fetchone()
    return int(row[0]) if row else None


def slugify(value: str) -> str:
    return value.lower().replace(" ", "-").replace("'", "")


if __name__ == "__main__":
    main()
