from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


THREAD_SPECS = [
    {
        "author": "vip@example.com",
        "rating": 5,
        "body": "This mock comment shows the rated discussion state for {item_title}. The explanation is clear and easy to review before the quiz.",
        "replies": [
            {
                "author": "professor@example.com",
                "body": "Good note. Rewatch the key step, then compare it with the written solution before moving on.",
            },
            {
                "author": "platinum@example.com",
                "body": "I added the same step to my notes and it made the next exercise faster.",
            },
        ],
    },
    {
        "author": "student@example.com",
        "rating": 4,
        "body": "Can someone confirm the main condition we need to check before using this method?",
        "replies": [
            {
                "author": "professor@example.com",
                "body": "Check the domain first, then verify that the transformation keeps the same values near the target point.",
            },
        ],
    },
    {
        "author": "basic@example.com",
        "rating": 3,
        "body": "The examples help, but I still need one more practice question to feel confident.",
        "replies": [],
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed local comments tabs with ratings and replies.")
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "db.sqlite3",
        help="Path to a local SQLite database (defaults to backend/db.sqlite3).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of published topic items to seed.",
    )
    args = parser.parse_args()
    seed_database(args.database.resolve(), limit=max(args.limit, 1))


def seed_database(database: Path, *, limit: int = 5) -> None:
    if not database.exists() or not database.is_file():
        raise FileNotFoundError(database)
    if database.suffix not in {".db", ".sqlite", ".sqlite3"}:
        raise ValueError(f"Refusing to seed a non-SQLite path: {database}")

    with sqlite3.connect(database) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        require_rating_column(connection)
        users = load_required_users(connection)
        items = load_target_items(connection, limit=limit)
        if not items:
            raise RuntimeError("No published topic items exist. Run the base seed before seeding comments.")

        for item in items:
            ensure_comments_tab(connection, int(item["id"]))
            seed_item_comments(connection, int(item["id"]), str(item["title"]), users)

        connection.commit()

    counts = database_counts(database)
    print(
        "Seeded comments: "
        f"{counts['comments']} visible comments, "
        f"{counts['replies']} visible replies, "
        f"{counts['comment_tabs']} comments tabs in {database}"
    )


def require_rating_column(connection: sqlite3.Connection) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(comments)").fetchall()}
    if "rating" not in columns:
        raise RuntimeError("comments.rating is missing. Run Alembic migrations before seeding mock comments.")


def load_required_users(connection: sqlite3.Connection) -> dict[str, int]:
    required = {
        spec["author"]
        for spec in THREAD_SPECS
    } | {
        reply["author"]
        for spec in THREAD_SPECS
        for reply in spec["replies"]
    }
    placeholders = ", ".join("?" for _ in required)
    rows = connection.execute(
        f"SELECT id, email FROM users WHERE email IN ({placeholders})",
        tuple(sorted(required)),
    ).fetchall()
    users = {str(row["email"]): int(row["id"]) for row in rows}
    missing = sorted(required - users.keys())
    if missing:
        raise RuntimeError(f"Missing demo users: {', '.join(missing)}. Run the base demo seed first.")
    return users


def load_target_items(connection: sqlite3.Connection, *, limit: int) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT ti.id, ti.title
        FROM topic_items ti
        JOIN topics t ON t.id = ti.topic_id
        WHERE ti.status = 'published'
          AND t.status = 'published'
        ORDER BY t."order", ti."order", ti.id
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def ensure_comments_tab(connection: sqlite3.Connection, topic_item_id: int) -> None:
    existing = connection.execute(
        """
        SELECT id
        FROM tab_contents
        WHERE topic_item_id = ?
          AND tab_type IN ('comments', 'discussion')
        ORDER BY id
        LIMIT 1
        """,
        (topic_item_id,),
    ).fetchone()
    content = "Mock discussion data with ratings and replies."
    config = json.dumps({"source": "seed_mock_comments", "features": ["ratings", "replies"]})
    if existing:
        connection.execute(
            """
            UPDATE tab_contents
            SET label = 'Comments',
                tab_type = 'comments',
                content = ?,
                config_json = ?,
                status = 'published',
                required_tier = '',
                required_feature_key = ''
            WHERE id = ?
            """,
            (content, config, int(existing["id"])),
        )
        return

    next_order = connection.execute(
        'SELECT COALESCE(MAX("order"), 0) + 1 FROM tab_contents WHERE topic_item_id = ?',
        (topic_item_id,),
    ).fetchone()[0]
    connection.execute(
        """
        INSERT INTO tab_contents (
            topic_item_id, resource_id, label, tab_type, content, config_json,
            renderer_key, "order", status, required_tier, required_feature_key, concept_slugs
        ) VALUES (?, NULL, 'Comments', 'comments', ?, ?, '', ?, 'published', '', '', ?)
        """,
        (topic_item_id, content, config, int(next_order), "[]"),
    )


def seed_item_comments(
    connection: sqlite3.Connection,
    topic_item_id: int,
    item_title: str,
    users: dict[str, int],
) -> None:
    timestamp = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=1)
    for index, spec in enumerate(THREAD_SPECS):
        parent = upsert_comment(
            connection,
            topic_item_id=topic_item_id,
            user_id=users[spec["author"]],
            body=spec["body"].format(item_title=item_title),
            rating=spec["rating"],
            parent_id=None,
            created_at=timestamp + timedelta(minutes=index * 12),
        )
        for reply_index, reply in enumerate(spec["replies"], start=1):
            upsert_comment(
                connection,
                topic_item_id=topic_item_id,
                user_id=users[reply["author"]],
                body=reply["body"].format(item_title=item_title),
                rating=None,
                parent_id=parent,
                created_at=timestamp + timedelta(minutes=index * 12 + reply_index * 3),
            )


def upsert_comment(
    connection: sqlite3.Connection,
    *,
    topic_item_id: int,
    user_id: int,
    body: str,
    rating: int | None,
    parent_id: int | None,
    created_at: datetime,
) -> int:
    if parent_id is None:
        existing = connection.execute(
            """
            SELECT id
            FROM comments
            WHERE topic_item_id = ?
              AND user_id = ?
              AND parent_id IS NULL
              AND body = ?
            LIMIT 1
            """,
            (topic_item_id, user_id, body),
        ).fetchone()
    else:
        existing = connection.execute(
            """
            SELECT id
            FROM comments
            WHERE topic_item_id = ?
              AND user_id = ?
              AND parent_id = ?
              AND body = ?
            LIMIT 1
            """,
            (topic_item_id, user_id, parent_id, body),
        ).fetchone()

    created_value = created_at.isoformat()
    if existing:
        comment_id = int(existing["id"])
        connection.execute(
            """
            UPDATE comments
            SET exercise_id = NULL,
                status = 'visible',
                rating = ?,
                parent_id = ?,
                moderated_by_user_id = NULL,
                moderated_at = NULL,
                moderation_reason = '',
                created_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (rating, parent_id, created_value, created_value, comment_id),
        )
        return comment_id

    cursor = connection.execute(
        """
        INSERT INTO comments (
            user_id, topic_item_id, exercise_id, body, parent_id, status, rating,
            moderated_by_user_id, moderated_at, moderation_reason, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, 'visible', ?, NULL, NULL, '', ?, ?)
        """,
        (user_id, topic_item_id, body, parent_id, rating, created_value, created_value),
    )
    return int(cursor.lastrowid)


def database_counts(database: Path) -> dict[str, int]:
    with sqlite3.connect(database) as connection:
        comments = int(
            connection.execute("SELECT COUNT(*) FROM comments WHERE status = 'visible'").fetchone()[0]
        )
        replies = int(
            connection.execute(
                "SELECT COUNT(*) FROM comments WHERE status = 'visible' AND parent_id IS NOT NULL"
            ).fetchone()[0]
        )
        comment_tabs = int(
            connection.execute(
                "SELECT COUNT(*) FROM tab_contents WHERE status = 'published' AND tab_type IN ('comments', 'discussion')"
            ).fetchone()[0]
        )
    return {"comments": comments, "replies": replies, "comment_tabs": comment_tabs}


if __name__ == "__main__":
    main()
