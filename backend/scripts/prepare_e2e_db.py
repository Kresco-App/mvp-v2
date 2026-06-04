from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.models  # noqa: F401
from app.database import _build_async_url
from scripts.e2e_seed import seed_e2e_database

DEFAULT_E2E_DATABASE_URL = "sqlite+aiosqlite:///./e2e.sqlite3"


def _sqlite_file_path(database_url: str) -> Path | None:
    prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    for prefix in prefixes:
        if not database_url.startswith(prefix):
            continue
        raw_path = database_url.removeprefix(prefix)
        if raw_path in {":memory:", ""}:
            return None
        return Path(raw_path).resolve()
    return None


def _is_postgres_url(database_url: str) -> bool:
    return database_url.startswith(("postgresql://", "postgresql+asyncpg://", "postgres://"))


def _run_alembic_upgrade(database_url: str) -> None:
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        command.upgrade(config, "head")
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url


async def prepare_e2e_db(database_url: str) -> None:
    sqlite_path = _sqlite_file_path(database_url)
    if sqlite_path is not None:
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        for candidate in (sqlite_path, Path(f"{sqlite_path}-wal"), Path(f"{sqlite_path}-shm")):
            if candidate.exists():
                candidate.unlink()

    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)

    if _is_postgres_url(database_url):
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))

    await engine.dispose()
    _run_alembic_upgrade(database_url)

    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as db:
        await seed_e2e_database(db, destructive_confirmed=True)

    await engine.dispose()


def main() -> None:
    database_url = os.environ.get("KRESCO_E2E_DATABASE_URL") or os.environ.get("DATABASE_URL") or DEFAULT_E2E_DATABASE_URL
    if os.environ.get("CI") and not os.environ.get("KRESCO_E2E_DATABASE_URL"):
        raise SystemExit("KRESCO_E2E_DATABASE_URL is required for CI integration tests.")
    asyncio.run(prepare_e2e_db(database_url))
    print(f"E2E database prepared: {database_url}")


if __name__ == "__main__":
    main()
