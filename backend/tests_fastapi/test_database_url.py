import pytest

from app.database import _build_async_url


def test_postgres_sslmode_require_uses_asyncpg_ssl_mode():
    async_url, connect_args = _build_async_url(
        "postgresql://user:pass@db.example.com:5432/kresco?sslmode=require&application_name=kresco"
    )

    assert async_url == "postgresql+asyncpg://user:pass@db.example.com:5432/kresco?application_name=kresco"
    assert connect_args == {"ssl": "require"}


def test_postgres_sslmode_verify_full_uses_asyncpg_ssl_mode():
    async_url, connect_args = _build_async_url(
        "postgres://user:pass@db.example.com/kresco?sslmode=verify-full"
    )

    assert async_url == "postgresql+asyncpg://user:pass@db.example.com/kresco"
    assert connect_args == {"ssl": "verify-full"}


def test_postgres_sslmode_rejects_unknown_value():
    with pytest.raises(ValueError, match="Unsupported PostgreSQL sslmode"):
        _build_async_url("postgresql://user:pass@db.example.com/kresco?sslmode=trust-me")
