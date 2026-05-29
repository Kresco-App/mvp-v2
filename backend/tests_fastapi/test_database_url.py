import ssl

import certifi
import pytest
from sqlalchemy.engine import make_url

from app.database import _build_async_url


def test_postgres_sslmode_require_uses_asyncpg_ssl_mode():
    async_url, connect_args = _build_async_url(
        "postgresql://user:pass@db.example.com:5432/kresco?sslmode=require&application_name=kresco"
    )

    assert async_url == "postgresql+asyncpg://user:pass@db.example.com:5432/kresco?application_name=kresco"
    assert connect_args == {"ssl": True}


def test_postgres_sslmode_verify_full_uses_ca_backed_context():
    async_url, connect_args = _build_async_url(
        f"postgres://user:pass@db.example.com/kresco?sslmode=verify-full&sslrootcert={certifi.where()}"
    )

    assert async_url == "postgresql+asyncpg://user:pass@db.example.com/kresco"
    assert isinstance(connect_args["ssl"], ssl.SSLContext)
    assert connect_args["ssl"].check_hostname is True
    assert connect_args["ssl"].verify_mode == ssl.CERT_REQUIRED


def test_postgres_sslmode_verify_ca_disables_hostname_check_but_verifies_ca():
    async_url, connect_args = _build_async_url(
        "postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-ca",
        pgsslrootcert=certifi.where(),
    )

    assert async_url == "postgresql+asyncpg://user:pass@db.example.com/kresco"
    assert isinstance(connect_args["ssl"], ssl.SSLContext)
    assert connect_args["ssl"].check_hostname is False
    assert connect_args["ssl"].verify_mode == ssl.CERT_REQUIRED


def test_postgres_url_quotes_raw_reserved_password_characters():
    async_url, connect_args = _build_async_url(
        "postgresql+asyncpg://kresco_admin:abc@n!cMm*dxqIQfB*67GB@proxy.example.com:5432/kresco?sslmode=require"
    )

    parsed = make_url(async_url)
    assert parsed.username == "kresco_admin"
    assert parsed.password == "abc@n!cMm*dxqIQfB*67GB"
    assert parsed.host == "proxy.example.com"
    assert parsed.port == 5432
    assert parsed.database == "kresco"
    assert connect_args == {"ssl": True}


def test_postgres_url_preserves_existing_percent_encoded_credentials():
    async_url, _ = _build_async_url(
        "postgresql+asyncpg://user:p%40ss%3Aword@db.example.com:5432/kresco?sslmode=require"
    )

    parsed = make_url(async_url)
    assert parsed.password == "p@ss:word"
    assert parsed.port == 5432


def test_postgres_sslmode_rejects_unknown_value():
    with pytest.raises(ValueError, match="Unsupported PostgreSQL sslmode"):
        _build_async_url("postgresql://user:pass@db.example.com/kresco?sslmode=trust-me")
