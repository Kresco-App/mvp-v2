import asyncio
import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401
from app.config import Settings
from app.database import get_session_factory, init_engine, reset_engine
from app.main import create_app
from app.models.base import Base
from app.rate_limit import limiter
from app.services.auth import create_token


@pytest.fixture(scope="session")
def test_settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    database_url = os.environ.get("KRESCO_TEST_DATABASE_URL", "").strip()
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
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_init_schema())
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
