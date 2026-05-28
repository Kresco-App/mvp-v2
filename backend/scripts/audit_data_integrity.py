from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.models  # noqa: F401
from app.config import Settings
from app.database import _build_async_url
from app.services.data_integrity import audit_data_integrity


async def run_audit(database_url: str) -> list[dict]:
    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        async with session_factory() as db:
            findings = await audit_data_integrity(db)
            return [
                {"check": finding.check, "key": finding.key, "count": finding.count}
                for finding in findings
            ]
    finally:
        await engine.dispose()


def main() -> None:
    database_url = os.environ.get("DATABASE_URL") or Settings().database_url
    findings = asyncio.run(run_audit(database_url))
    print(json.dumps({"ok": not findings, "findings": findings}, default=str, indent=2))
    raise SystemExit(1 if findings else 0)


if __name__ == "__main__":
    main()
