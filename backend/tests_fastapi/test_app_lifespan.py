from dataclasses import dataclass

from fastapi.testclient import TestClient
import pytest

from app.config import Settings
import app.database as database_module
import app.main as main_module


@dataclass
class _RecordedAdmin:
    app: object
    engine: object

    def __init__(self, app, engine, **kwargs):
        self.app = app
        self.engine = engine
        self.kwargs = kwargs


def test_app_lifespan_initializes_and_disposes_database_engine(monkeypatch):
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret_key="test-secret-key-for-ci-32-bytes-minimum",
        google_client_id="test-google-client-id",
        debug=True,
    )

    calls: list[tuple[str, object]] = []
    fake_engine = object()

    def fake_init_engine(database_url, pgsslrootcert=None, **engine_kwargs):
        calls.append(("init", (database_url, pgsslrootcert, engine_kwargs)))
        return fake_engine, object()

    async def fake_reset_engine():
        calls.append(("reset", None))

    monkeypatch.setattr(main_module, "init_engine", fake_init_engine)
    monkeypatch.setattr(main_module, "reset_engine", fake_reset_engine)
    monkeypatch.setattr(main_module, "Admin", _RecordedAdmin)
    monkeypatch.setattr(main_module, "register_admin_views", lambda admin: calls.append(("register", admin.engine)))

    app = main_module.create_app(settings)
    assert app.state.db_engine is None

    with TestClient(app) as client:
        assert client.app.state.db_engine is fake_engine
        assert calls[0] == ("init", (
            settings.database_url,
            settings.pgsslrootcert,
            {
                "pool_size": settings.database_pool_size,
                "max_overflow": settings.database_max_overflow,
                "pool_timeout": settings.database_pool_timeout,
            },
        ))
        assert calls[1] == ("register", fake_engine)

    assert app.state.db_engine is None
    assert calls[-1] == ("reset", None)


def test_database_engine_cache_tracks_direct_pool_configuration(monkeypatch):
    saved_engine = database_module._engine
    saved_session_factory = database_module._session_factory
    saved_cache_key = database_module._engine_cache_key
    database_module._engine = None
    database_module._session_factory = None
    database_module._engine_cache_key = None
    created: list[dict] = []

    class FakeEngine:
        async def dispose(self):
            pass

    def fake_create_async_engine(url, **kwargs):
        created.append({"url": url, **kwargs})
        return FakeEngine()

    monkeypatch.setattr(database_module, "create_async_engine", fake_create_async_engine)

    try:
        database_module.init_engine(
            "postgresql://user:pass@db.example.com/kresco",
            pool_size=3,
            max_overflow=4,
            pool_timeout=5,
        )

        assert created[0]["url"] == "postgresql+asyncpg://user:pass@db.example.com/kresco"
        assert created[0]["pool_size"] == 3
        assert created[0]["max_overflow"] == 4
        assert created[0]["pool_timeout"] == 5

        with pytest.raises(RuntimeError, match="pool_size=3"):
            database_module.init_engine(
                "postgresql://user:pass@db.example.com/kresco",
                pool_size=6,
                max_overflow=4,
                pool_timeout=5,
            )
    finally:
        database_module._engine = saved_engine
        database_module._session_factory = saved_session_factory
        database_module._engine_cache_key = saved_cache_key


def test_database_engine_uses_null_pool_for_configured_test_postgres(monkeypatch):
    saved_engine = database_module._engine
    saved_session_factory = database_module._session_factory
    saved_cache_key = database_module._engine_cache_key
    database_module._engine = None
    database_module._session_factory = None
    database_module._engine_cache_key = None
    created: list[dict] = []
    database_url = "postgresql://user:pass@localhost:5432/kresco_ci"

    class FakeEngine:
        async def dispose(self):
            pass

    def fake_create_async_engine(url, **kwargs):
        created.append({"url": url, **kwargs})
        return FakeEngine()

    monkeypatch.setenv("KRESCO_TEST_DATABASE_URL", database_url)
    monkeypatch.setattr(database_module, "create_async_engine", fake_create_async_engine)

    try:
        database_module.init_engine(database_url, pool_size=3, max_overflow=4, pool_timeout=5)

        assert created[0]["poolclass"] is database_module.NullPool
        assert "pool_size" not in created[0]
        assert "max_overflow" not in created[0]
        assert "pool_timeout" not in created[0]

        database_module.init_engine(database_url, pool_size=6, max_overflow=7, pool_timeout=8)
    finally:
        database_module._engine = saved_engine
        database_module._session_factory = saved_session_factory
        database_module._engine_cache_key = saved_cache_key
