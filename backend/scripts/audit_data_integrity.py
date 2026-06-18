from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.models  # noqa: F401
from app.config import Settings
from app.database import _build_async_url
from app.models.base import Base
from app.models.courses import Subject, Topic, TopicItem
from app.models.gamification import TopicItemProgress, XPTransaction
from app.models.users import User
from app.services.data_integrity import DataIntegrityFinding
from app.services.data_integrity import audit_data_integrity

TOPIC_ITEM_PROGRESS_TOPIC_ITEM_FK_NAMES = (
    "fk_topic_item_progress_topic_item_id_topic_items",
    "topic_item_progress_topic_item_id_fkey",
)


@dataclass(frozen=True)
class ExpectedFixtureFinding:
    check: str
    key: dict[str, object]
    count: int


@dataclass(frozen=True)
class IntegrityAuditFixture:
    duplicate_idempotency_key: str
    orphan_topic_item_id: int
    expected_findings: tuple[ExpectedFixtureFinding, ...]


def _serialize_findings(findings: list[DataIntegrityFinding]) -> list[dict]:
    return [
        {"check": finding.check, "key": finding.key, "count": finding.count}
        for finding in findings
    ]


async def run_audit(database_url: str) -> list[dict]:
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        async with session_factory() as db:
            findings = await audit_data_integrity(db)
            return _serialize_findings(findings)
    finally:
        await engine.dispose()


async def run_fixture_self_test(database_url: str) -> dict:
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        if engine.dialect.name == "sqlite":
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        async with session_factory() as db:
            try:
                fixture = await seed_integrity_audit_fixture(db)
                findings = await audit_data_integrity(db)
                serialized_findings = _serialize_findings(findings)
                missing = _missing_expected_findings(findings, fixture.expected_findings)
                return {
                    "ok": not missing,
                    "mode": "fixture_self_test",
                    "findings": serialized_findings,
                    "expected_findings": [
                        {
                            "check": expected.check,
                            "key": expected.key,
                            "count": expected.count,
                        }
                        for expected in fixture.expected_findings
                    ],
                    "missing_expected_findings": missing,
                }
            finally:
                await db.rollback()
    finally:
        await engine.dispose()


async def seed_integrity_audit_fixture(db: AsyncSession) -> IntegrityAuditFixture:
    await _relax_fixture_constraints(db)

    suffix = uuid4().hex
    duplicate_idempotency_key = f"integrity-audit-{suffix}"
    user_one = User(
        email=f"integrity-audit-{suffix}-one@example.invalid",
        role="student",
        is_active=True,
    )
    user_two = User(
        email=f"integrity-audit-{suffix}-two@example.invalid",
        role="student",
        is_active=True,
    )
    subject = Subject(title=f"Integrity audit fixture {suffix}", description="")
    db.add_all([user_one, user_two, subject])
    await db.flush()

    topic = Topic(
        subject_id=subject.id,
        slug=f"integrity-audit-{suffix}",
        title="Integrity audit fixture",
        description="",
    )
    db.add(topic)
    await db.flush()

    orphan_topic_item_id = int(
        await db.scalar(select(func.coalesce(func.max(TopicItem.id), 0) + 1_000_000))
    )
    await db.execute(
        XPTransaction.__table__.insert(),
        [
            {
                "user_id": user_one.id,
                "amount": 1,
                "reason": "audit_fixture",
                "description": "",
                "idempotency_key": duplicate_idempotency_key,
            },
            {
                "user_id": user_two.id,
                "amount": 1,
                "reason": "audit_fixture",
                "description": "",
                "idempotency_key": duplicate_idempotency_key,
            },
        ],
    )
    await db.execute(
        TopicItemProgress.__table__.insert().values(
            user_id=user_one.id,
            topic_id=topic.id,
            topic_item_id=orphan_topic_item_id,
            status="started",
            watched_seconds=0,
        )
    )
    return IntegrityAuditFixture(
        duplicate_idempotency_key=duplicate_idempotency_key,
        orphan_topic_item_id=orphan_topic_item_id,
        expected_findings=(
            ExpectedFixtureFinding(
                check="topic_item_progress_orphan_topic_item",
                key={"topic_item_id": orphan_topic_item_id},
                count=1,
            ),
        ),
    )


async def _relax_fixture_constraints(db: AsyncSession) -> None:
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "postgresql":
        for constraint_name in TOPIC_ITEM_PROGRESS_TOPIC_ITEM_FK_NAMES:
            await db.execute(
                text(
                    "ALTER TABLE topic_item_progress "
                    f"DROP CONSTRAINT IF EXISTS {constraint_name}"
                )
            )
    elif dialect_name == "sqlite":
        await db.execute(text("PRAGMA foreign_keys=OFF"))


def _missing_expected_findings(
    findings: list[DataIntegrityFinding],
    expected_findings: tuple[ExpectedFixtureFinding, ...],
) -> list[dict]:
    missing: list[dict] = []
    for expected in expected_findings:
        if any(
            finding.check == expected.check
            and finding.key == expected.key
            and finding.count == expected.count
            for finding in findings
        ):
            continue
        missing.append(
            {
                "check": expected.check,
                "key": expected.key,
                "count": expected.count,
            }
        )
    return missing


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit database data integrity invariants.")
    parser.add_argument(
        "--fixture-self-test",
        action="store_true",
        help="Seed rollback-only duplicate/orphan fixtures and require the audit to report them.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    database_url = os.environ.get("DATABASE_URL") or Settings().database_url
    if args.fixture_self_test:
        result = asyncio.run(run_fixture_self_test(database_url))
        print(json.dumps(result, default=str, indent=2))
        raise SystemExit(0 if result["ok"] else 1)

    findings = asyncio.run(run_audit(database_url))
    print(json.dumps({"ok": not findings, "findings": findings}, default=str, indent=2))
    raise SystemExit(1 if findings else 0)


if __name__ == "__main__":
    main()
