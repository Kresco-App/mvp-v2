import pytest

from seed_safety import (
    DESTRUCTIVE_SEED_CONFIRM_ENV,
    UnsafeSeedDatabaseError,
    destructive_seed_confirmation_value,
    is_local_seed_database_url,
    redact_database_url,
    require_destructive_seed_database_url,
    require_local_seed_database_url,
)


def test_seed_safety_allows_only_local_sqlite_urls():
    assert is_local_seed_database_url("sqlite+aiosqlite:///./db.sqlite3")
    assert is_local_seed_database_url("sqlite:///:memory:")
    assert is_local_seed_database_url("sqlite+pysqlite:////tmp/kresco.sqlite3")

    assert not is_local_seed_database_url("postgresql+asyncpg://user:pass@db.example.com/kresco")
    assert not is_local_seed_database_url("mysql+asyncmy://user:pass@db.example.com/kresco")
    assert not is_local_seed_database_url("")


def test_seed_safety_refuses_remote_database_urls_without_leaking_passwords():
    unsafe_url = "postgresql+asyncpg://kresco:secret-password@db.example.com/kresco"

    with pytest.raises(UnsafeSeedDatabaseError) as exc:
        require_local_seed_database_url(unsafe_url, "seed_local_full.py")

    message = str(exc.value)
    assert "<redacted>@db.example.com" in message
    assert "secret-password" not in message


def test_seed_safety_redacts_credentials_only_when_present():
    assert redact_database_url("postgresql+asyncpg://user:pass@db.example.com/kresco") == (
        "postgresql+asyncpg://<redacted>@db.example.com/kresco"
    )
    assert redact_database_url("sqlite+aiosqlite:///./db.sqlite3") == "sqlite+aiosqlite:///./db.sqlite3"


def test_destructive_seed_confirmation_value_uses_redacted_database_url():
    assert destructive_seed_confirmation_value(
        "seed_local_full.py",
        "sqlite+aiosqlite:///./db.sqlite3",
    ) == "seed_local_full.py:sqlite+aiosqlite:///./db.sqlite3"
    assert destructive_seed_confirmation_value(
        "seed_local_full.py",
        "postgresql+asyncpg://user:secret@db.example.com/kresco",
    ) == "seed_local_full.py:postgresql+asyncpg://<redacted>@db.example.com/kresco"


def test_destructive_seed_confirmation_requires_explicit_local_ack(monkeypatch):
    database_url = "sqlite+aiosqlite:///./db.sqlite3"

    with pytest.raises(UnsafeSeedDatabaseError) as exc:
        require_destructive_seed_database_url(database_url, "seed_local_full.py")

    message = str(exc.value)
    assert DESTRUCTIVE_SEED_CONFIRM_ENV in message
    assert "seed_local_full.py" in message

    monkeypatch.setenv(
        DESTRUCTIVE_SEED_CONFIRM_ENV,
        destructive_seed_confirmation_value("seed_local_full.py", database_url),
    )
    require_destructive_seed_database_url(database_url, "seed_local_full.py")


def test_destructive_seed_confirmation_allows_confirmed_tooling():
    require_destructive_seed_database_url(
        "sqlite+aiosqlite:///./db.sqlite3",
        "seed_local_full.py",
        confirmed=True,
    )
