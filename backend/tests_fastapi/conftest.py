import asyncio
import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401
from app.config import BACKEND_DIR
from app.config import Settings
from app.database import get_session_factory, init_engine, reset_engine
from app.main import create_app
from app.models.base import Base
from app.rate_limit import limiter
from app.services.auth import create_token


@pytest.fixture(scope="session")
def test_settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    database_url = os.environ.get("KRESCO_TEST_DATABASE_URL", "").strip()
    if os.environ.get("CI") and not database_url:
        raise RuntimeError("KRESCO_TEST_DATABASE_URL is required for CI backend tests.")
    if not database_url:
        db_path: Path = tmp_path_factory.mktemp("db") / "test.sqlite3"
        database_url = f"sqlite+aiosqlite:///{db_path}"
    return Settings(
        database_url=database_url,
        jwt_secret_key="test-secret-key-for-ci-32-bytes-minimum",
        google_client_id="test-google-client-id",
        vdocipher_api_secret="",
        vdocipher_api_base_url="",
        vdocipher_live_create_url="",
        stripe_sk="",
        stripe_pk="",
        stripe_product_id="",
        stripe_webhook_secret="",
        frontend_url="http://localhost:3000",
        resend_api_key="",
        ably_api_key="",
        debug=True,
    )


def _is_postgres_url(database_url: str) -> bool:
    return database_url.startswith(("postgresql://", "postgresql+asyncpg://", "postgres://"))


def _run_alembic_upgrade(database_url: str, pgsslrootcert: str | None) -> None:
    previous_database_url = os.environ.get("DATABASE_URL")
    previous_pgsslrootcert = os.environ.get("PGSSLROOTCERT")
    os.environ["DATABASE_URL"] = database_url
    if pgsslrootcert is not None:
        os.environ["PGSSLROOTCERT"] = pgsslrootcert
    try:
        config = Config(str(BACKEND_DIR / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        command.upgrade(config, "head")
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url
        if previous_pgsslrootcert is None:
            os.environ.pop("PGSSLROOTCERT", None)
        else:
            os.environ["PGSSLROOTCERT"] = previous_pgsslrootcert


@pytest.fixture(scope="session")
def app_client(test_settings: Settings):
    asyncio.run(reset_engine())
    engine, _ = init_engine(
        test_settings.database_url,
        is_lambda=False,
        pgsslrootcert=test_settings.pgsslrootcert,
    )

    async def _init_schema():
        async with engine.begin() as conn:
            if not _is_postgres_url(test_settings.database_url):
                await conn.run_sync(Base.metadata.drop_all)
                await conn.run_sync(Base.metadata.create_all)
                return
            await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))

    asyncio.run(_init_schema())
    asyncio.run(reset_engine())
    if _is_postgres_url(test_settings.database_url):
        _run_alembic_upgrade(test_settings.database_url, test_settings.pgsslrootcert)
    app = create_app(test_settings)
    with TestClient(app) as client:
        yield client
    asyncio.run(reset_engine())


@pytest.fixture
def run_db():
    def _run(coro):
        return asyncio.run(coro)
    return _run


@pytest.fixture(autouse=True)
def reset_client_request_state(app_client: TestClient):
    app_client.cookies.clear()
    limiter.reset()


@pytest.fixture
def auth_token(test_settings: Settings, run_db):
    from app.models.users import User

    async def _create_user(email: str = "student@example.com", is_pro: bool = False):
        session_factory = get_session_factory()
        async with session_factory() as db:  # type: AsyncSession
            user = User(
                email=email,
                full_name="Student",
                is_email_verified=True,
                is_active=True,
                is_pro=is_pro,
                password="!",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            return create_token(user.id, test_settings), user.id

    return lambda email="student@example.com", is_pro=False: run_db(_create_user(email, is_pro))


@dataclass
class CapturedQueries:
    statements: list[str] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.statements)


@pytest.fixture
def query_counter(app_client: TestClient):
    engine = app_client.app.state.db_engine.sync_engine

    @contextmanager
    def _capture():
        captured = CapturedQueries()

        def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            del conn, cursor, parameters, context, executemany
            normalized = statement.strip().upper()
            if normalized.startswith((
                "PRAGMA ",
                "BEGIN",
                "COMMIT",
                "ROLLBACK",
                "SAVEPOINT",
                "RELEASE SAVEPOINT",
            )):
                return
            captured.statements.append(statement)

        event.listen(engine, "before_cursor_execute", _before_cursor_execute)
        try:
            yield captured
        finally:
            event.remove(engine, "before_cursor_execute", _before_cursor_execute)

    return _capture
