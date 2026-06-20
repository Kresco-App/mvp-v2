from __future__ import annotations

import argparse
import json
import sqlite3
import unicodedata
from pathlib import Path


TOPICS_BY_SUBJECT: dict[str, list[str]] = {
    "Mathématiques": [
        "Analyse et fonctions",
        "Suites numériques",
        "Probabilités",
        "Géométrie dans l'espace",
        "Nombres complexes",
    ],
    "Physique-Chimie": [
        "Mécanique",
        "Électricité",
        "Ondes et signaux",
        "Transformations chimiques",
        "Thermodynamique",
    ],
    "Sciences de la Vie et de la Terre": [
        "Génétique",
        "Immunologie",
        "Géologie",
        "Écologie",
        "Physiologie humaine",
    ],
    "Langue Française": [
        "Compréhension de texte",
        "Grammaire",
        "Argumentation",
        "Production écrite",
        "Figures de style",
    ],
    "Histoire-Géographie": [
        "Le monde contemporain",
        "Relations internationales",
        "Développement durable",
        "Territoires et mondialisation",
        "Méthodologie cartographique",
    ],
    "Philosophie": [
        "La liberté",
        "La vérité",
        "La conscience",
        "L'État et la justice",
        "Le bonheur",
    ],
}

# Demo databases from different branches use both accented/full labels and
# compact legacy labels. Keep the generated content consistent across them.
TOPICS_BY_SUBJECT["Mathematiques"] = TOPICS_BY_SUBJECT["Mathématiques"]
TOPICS_BY_SUBJECT["SVT"] = TOPICS_BY_SUBJECT["Sciences de la Vie et de la Terre"]
TOPICS_BY_SUBJECT["Anglais"] = [
    "Reading comprehension",
    "Grammar and vocabulary",
    "Written expression",
    "Oral communication",
    "Culture and society",
]
TOPICS_BY_SUBJECT["Mathematics"] = [
    "Functions and analysis",
    "Sequences",
    "Probability",
    "Spatial geometry",
    "Complex numbers",
]

DIFFICULTIES = ("easy", "medium", "hard", "bac")
SESSIONS = ("Session normale", "Rattrapage")
YEARS = range(2021, 2026)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return "-".join("".join(char if char.isalnum() else " " for char in ascii_value.lower()).split())


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed substantial, repeatable local Exercise and Exam Bank content.")
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "db.sqlite3",
        help="Path to a local SQLite database (defaults to backend/db.sqlite3).",
    )
    args = parser.parse_args()
    seed_database(args.database.resolve())


def seed_database(database: Path) -> None:
    if not database.exists() or not database.is_file():
        raise FileNotFoundError(database)
    if database.suffix not in {".db", ".sqlite", ".sqlite3"}:
        raise ValueError(f"Refusing to seed a non-SQLite path: {database}")

    with sqlite3.connect(database) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        subjects = connection.execute("SELECT id, title FROM subjects ORDER BY id").fetchall()
        if not subjects:
            raise RuntimeError("No subjects exist. Run the base application seed before this script.")

        for subject_id, subject_title in subjects:
            topic_titles = TOPICS_BY_SUBJECT.get(subject_title)
            if not topic_titles:
                continue
            topics = [
                upsert_topic(connection, int(subject_id), subject_title, title, order)
                for order, title in enumerate(topic_titles, start=1)
            ]
            seed_exercises(connection, int(subject_id), subject_title, topics)
            seed_exams(connection, int(subject_id), subject_title, topics)

        connection.commit()

    counts = database_counts(database)
    print(
        "Seed complete: "
        f"{counts['topics']} topics, {counts['exercises']} exercises, "
        f"{counts['exams']} exams, {counts['exam_problems']} problems, "
        f"{counts['exam_problem_parts']} problem parts in {database}"
    )


def upsert_topic(
    connection: sqlite3.Connection,
    subject_id: int,
    subject_title: str,
    title: str,
    order: int,
) -> tuple[int, str]:
    slug = f"mock-{slugify(subject_title)}-{slugify(title)}"
    row = connection.execute("SELECT id FROM topics WHERE slug = ?", (slug,)).fetchone()
    values = (
        subject_id,
        title,
        f"Parcours d'entraînement en {title.lower()} avec exercices progressifs et sujets type Bac.",
        order,
        1 if order == 1 else 0,
    )
    if row is None:
        cursor = connection.execute(
            """
            INSERT INTO topics (
                subject_id, slug, title, description, status, "order", progress_weight_main,
                required_tier, required_feature_key, is_free_preview
            ) VALUES (?, ?, ?, ?, 'published', ?, 75, '', '', ?)
            """,
            (subject_id, slug, title, values[2], order, values[4]),
        )
        return int(cursor.lastrowid), title

    topic_id = int(row[0])
    connection.execute(
        """
        UPDATE topics
        SET subject_id = ?, title = ?, description = ?, status = 'published', "order" = ?,
            required_tier = '', required_feature_key = '', is_free_preview = ?
        WHERE id = ?
        """,
        (*values, topic_id),
    )
    return topic_id, title


def seed_exercises(
    connection: sqlite3.Connection,
    subject_id: int,
    subject_title: str,
    topics: list[tuple[int, str]],
) -> None:
    for topic_id, topic_title in topics:
        for sequence in range(1, 13):
            difficulty = DIFFICULTIES[(sequence - 1) % len(DIFFICULTIES)]
            slug = f"mock-exercise-{subject_id}-{topic_id}-{sequence:02d}"
            title = f"{topic_title} — exercice {sequence:02d}"
            summary = f"Entraînement {difficulty} sur {topic_title.lower()} en {subject_title}."
            statement = (
                f"Exercice {sequence}. Mobilisez les notions essentielles de {topic_title.lower()}, "
                "présentez votre raisonnement étape par étape et justifiez chaque résultat."
            )
            solution = (
                f"Correction guidée {sequence}: identifier les données utiles, choisir la propriété adaptée "
                f"à {topic_title.lower()}, effectuer les calculs puis vérifier la cohérence de la conclusion."
            )
            concepts = json.dumps([slugify(topic_title), difficulty, "mock-content"])
            metadata = json.dumps({"source": "mock_learning_content", "sequence": sequence})
            is_free_preview = 1 if sequence <= 2 else 0
            estimated_minutes = 5 + sequence * 2
            row = connection.execute("SELECT id FROM exercises WHERE slug = ?", (slug,)).fetchone()
            values = (
                subject_id,
                topic_id,
                title,
                summary,
                statement,
                solution,
                difficulty,
                estimated_minutes,
                sequence,
                concepts,
                metadata,
                is_free_preview,
            )
            if row is None:
                connection.execute(
                    """
                    INSERT INTO exercises (
                        subject_id, topic_id, title, slug, summary, statement_body, solution_body,
                        solution_video_url, difficulty, estimated_minutes, "order", source_type,
                        concept_slugs, metadata_json, status, required_tier, required_feature_key,
                        is_free_preview
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 'mock_learning_content', ?, ?,
                              'published', '', '', ?)
                    """,
                    (subject_id, topic_id, title, slug, *values[3:]),
                )
                continue

            connection.execute(
                """
                UPDATE exercises
                SET subject_id = ?, topic_id = ?, title = ?, summary = ?, statement_body = ?,
                    solution_body = ?, solution_video_url = '', difficulty = ?, estimated_minutes = ?,
                    "order" = ?, source_type = 'mock_learning_content', concept_slugs = ?,
                    metadata_json = ?, status = 'published', required_tier = '',
                    required_feature_key = '', is_free_preview = ?
                WHERE id = ?
                """,
                (*values, int(row[0])),
            )


def seed_exams(
    connection: sqlite3.Connection,
    subject_id: int,
    subject_title: str,
    topics: list[tuple[int, str]],
) -> None:
    for year in YEARS:
        for session in SESSIONS:
            exam_id = upsert_exam(connection, subject_id, subject_title, year, session)
            for problem_order in range(1, 5):
                topic_id, topic_title = topics[(problem_order + year) % len(topics)]
                problem_id = upsert_problem(
                    connection,
                    exam_id,
                    topic_id,
                    topic_title,
                    problem_order,
                    year,
                    session,
                )
                for part_order, label in enumerate(("Partie A", "Partie B"), start=1):
                    upsert_problem_part(
                        connection,
                        problem_id,
                        topic_id,
                        topic_title,
                        part_order,
                        label,
                    )


def upsert_exam(
    connection: sqlite3.Connection,
    subject_id: int,
    subject_title: str,
    year: int,
    session: str,
) -> int:
    title = f"Bac {year} — {subject_title} — {session}"
    row = connection.execute(
        "SELECT id FROM exams WHERE subject_id = ? AND year = ? AND session = ? ORDER BY id LIMIT 1",
        (subject_id, year, session),
    ).fetchone()
    if row is None:
        cursor = connection.execute(
            """
            INSERT INTO exams (
                subject_id, title, year, session, statement_url, status,
                required_tier, required_feature_key, is_free_preview
            ) VALUES (?, ?, ?, ?, '', 'published', '', '', ?)
            """,
            (subject_id, title, year, session, 1 if year == 2025 else 0),
        )
        return int(cursor.lastrowid)

    exam_id = int(row[0])
    connection.execute(
        """
        UPDATE exams
        SET title = ?, statement_url = '', status = 'published', required_tier = '',
            required_feature_key = '', is_free_preview = ?
        WHERE id = ?
        """,
        (title, 1 if year == 2025 else 0, exam_id),
    )
    return exam_id


def upsert_problem(
    connection: sqlite3.Connection,
    exam_id: int,
    topic_id: int,
    topic_title: str,
    order: int,
    year: int,
    session: str,
) -> int:
    row = connection.execute(
        'SELECT id FROM exam_problems WHERE exam_id = ? AND "order" = ? ORDER BY id LIMIT 1',
        (exam_id, order),
    ).fetchone()
    title = f"Problème {order} — {topic_title}"
    statement = (
        f"Sujet Bac {year} ({session}), problème {order}. Résoudre la situation portant sur "
        f"{topic_title.lower()} et détailler les étapes du raisonnement."
    )
    solution = (
        f"Correction du problème {order}: rappeler les résultats du cours de {topic_title.lower()}, "
        "les appliquer dans l'ordre, puis contrôler l'unité et la validité du résultat final."
    )
    concepts = json.dumps([slugify(topic_title), "bac", str(year)])
    values = (topic_id, title, statement, solution, order, concepts)
    if row is None:
        cursor = connection.execute(
            """
            INSERT INTO exam_problems (
                exam_id, topic_id, video_resource_id, title, statement, written_solution,
                written_solution_url, "order", difficulty, status, concept_slugs,
                required_tier, required_feature_key, is_free_preview
            ) VALUES (?, ?, NULL, ?, ?, ?, '', ?, 'bac', 'published', ?, '', '', ?)
            """,
            (exam_id, *values, 1 if order == 1 else 0),
        )
        return int(cursor.lastrowid)

    problem_id = int(row[0])
    connection.execute(
        """
        UPDATE exam_problems
        SET topic_id = ?, video_resource_id = NULL, title = ?, statement = ?,
            written_solution = ?, written_solution_url = '', "order" = ?, difficulty = 'bac',
            status = 'published', concept_slugs = ?, required_tier = '',
            required_feature_key = '', is_free_preview = ?
        WHERE id = ?
        """,
        (*values, 1 if order == 1 else 0, problem_id),
    )
    return problem_id


def upsert_problem_part(
    connection: sqlite3.Connection,
    problem_id: int,
    topic_id: int,
    topic_title: str,
    order: int,
    label: str,
) -> None:
    row = connection.execute(
        'SELECT id FROM exam_problem_parts WHERE exam_problem_id = ? AND "order" = ? ORDER BY id LIMIT 1',
        (problem_id, order),
    ).fetchone()
    title = f"{label} — {topic_title}"
    statement = f"{label}. Analyser les données puis traiter cette étape de {topic_title.lower()}."
    solution = f"{label}. Appliquer la méthode du cours, expliciter les calculs et formuler une conclusion."
    concepts = json.dumps([slugify(topic_title), f"part-{order}"])
    metadata = json.dumps({"source": "mock_learning_content", "part": order})
    values = (topic_id, label, title, statement, solution, order, concepts, metadata, 1 if order == 1 else 0)
    if row is None:
        connection.execute(
            """
            INSERT INTO exam_problem_parts (
                exam_problem_id, topic_id, video_resource_id, part_label, title, statement_body,
                written_solution_body, written_solution_url, correction_video_url, "order",
                difficulty, concept_slugs, metadata_json, status, required_tier,
                required_feature_key, is_free_preview
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, '', '', ?, 'bac', ?, ?, 'published', '', '', ?)
            """,
            (problem_id, *values),
        )
        return

    connection.execute(
        """
        UPDATE exam_problem_parts
        SET topic_id = ?, video_resource_id = NULL, part_label = ?, title = ?,
            statement_body = ?, written_solution_body = ?, written_solution_url = '',
            correction_video_url = '', "order" = ?, difficulty = 'bac', concept_slugs = ?,
            metadata_json = ?, status = 'published', required_tier = '',
            required_feature_key = '', is_free_preview = ?
        WHERE id = ?
        """,
        (*values, int(row[0])),
    )


def database_counts(database: Path) -> dict[str, int]:
    tables = ("topics", "exercises", "exams", "exam_problems", "exam_problem_parts")
    with sqlite3.connect(database) as connection:
        return {table: int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]) for table in tables}


if __name__ == "__main__":
    main()
