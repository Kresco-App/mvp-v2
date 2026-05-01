import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401
from app.config import Settings
from app.database import get_session_factory, init_engine
from app.main import create_app
from app.models.base import Base
from app.services.auth import create_token


@pytest.fixture(scope="session")
def test_settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    db_path: Path = tmp_path_factory.mktemp("db") / "test.sqlite3"
    return Settings(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        jwt_secret_key="test-secret",
        google_client_id="test-google-client-id",
        stripe_webhook_secret="",
        resend_api_key="",
        debug=True,
    )


@pytest.fixture(scope="session")
def app_client(test_settings: Settings):
    engine, _ = init_engine(test_settings.database_url, is_lambda=False)

    async def _init_schema():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_init_schema())
    app = create_app(test_settings)
    with TestClient(app) as client:
        yield client


@pytest.fixture
def run_db():
    def _run(coro):
        return asyncio.run(coro)
    return _run


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
