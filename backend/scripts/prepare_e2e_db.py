from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.models  # noqa: F401
from app.database import _build_async_url
from app.models.base import Base
from seed_local_full import seed_full_local

DEFAULT_E2E_DATABASE_URL = "sqlite+aiosqlite:///./e2e.sqlite3"


async def prepare_e2e_db(database_url: str) -> None:
    if database_url.startswith("sqlite") and "///./" in database_url:
        Path(database_url.rsplit("///./", 1)[1]).parent.mkdir(parents=True, exist_ok=True)

    async_url, connect_args = _build_async_url(database_url)
    engine = create_async_engine(async_url, poolclass=NullPool, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as db:
        await seed_full_local(db, destructive_confirmed=True)

    await engine.dispose()


def main() -> None:
    database_url = os.environ.get("KRESCO_E2E_DATABASE_URL") or os.environ.get("DATABASE_URL") or DEFAULT_E2E_DATABASE_URL
    asyncio.run(prepare_e2e_db(database_url))
    print(f"E2E database prepared: {database_url}")


if __name__ == "__main__":
    main()
