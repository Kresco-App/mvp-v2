import json
from pathlib import Path

import pytest

from app.config import Settings
from app.main import create_app
from scripts.render_zappa_settings import PLACEHOLDER, ZappaRenderError, render_zappa_settings


SECRET_PLACEHOLDERS = {
    "DATABASE_URL": "postgresql+asyncpg://user:pass@db.example.com/kresco",
    "JWT_SECRET_KEY": "test-secret-key-for-production-32-bytes-minimum",
    "GOOGLE_CLIENT_ID": "google-client",
    "VDOCIPHER_API_SECRET": "vdocipher-secret",
    "VDOCIPHER_API_BASE_URL": "https://video.example.com/api",
    "VDOCIPHER_LIVE_CREATE_URL": "https://video.example.com/live",
    "STRIPE_PK": "stripe-public",
    "STRIPE_SK": "stripe-secret",
    "STRIPE_PRODUCT_ID": "stripe-product",
    "STRIPE_WEBHOOK_SECRET": "stripe-webhook",
    "ADMIN_PASSWORD": "test-admin-password",
    "RESEND_API_KEY": "resend-key",
    "ABLY_API_KEY": "ably:key",
}


def test_local_settings_allow_development_defaults():
    settings = Settings(admin_password="test-admin-password")

    assert settings.production_config_errors() == []


def test_security_headers_are_applied_to_responses(app_client):
    response = app_client.get("/health")

    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_global_rate_limit_applies_to_undecorated_routes(app_client):
    response = None
    for _ in range(121):
        response = app_client.get("/health")

    assert response is not None
    assert response.status_code == 429
    assert response.headers["x-content-type-options"] == "nosniff"


def test_deployed_app_rejects_fallback_jwt_secret(monkeypatch):
    monkeypatch.setenv("LAMBDA_TASK_ROOT", "/var/task")
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret_key="fallback-secret-change-in-production",
        admin_password="test-admin-password",
    )

    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        create_app(settings)


def test_production_settings_reject_missing_integration_config():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="",
        vdocipher_api_secret="",
        vdocipher_api_base_url="",
        vdocipher_live_create_url="",
        stripe_sk="",
        stripe_pk="",
        stripe_product_id="",
        stripe_webhook_secret="",
        resend_api_key="",
        ably_api_key="",
        admin_password="test-admin-password",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        frontend_url="https://app.example.com",
    )

    errors = settings.production_config_errors()

    assert any("GOOGLE_CLIENT_ID" in error for error in errors)
    assert any("VDOCIPHER_API_SECRET" in error for error in errors)
    assert any("VDOCIPHER_API_BASE_URL" in error for error in errors)
    assert any("STRIPE_SK" in error for error in errors)
    assert any("ABLY_API_KEY" in error for error in errors)


def test_production_settings_do_not_require_stripe_publishable_key_for_hosted_checkout():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_pk="",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        admin_password="test-admin-password",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
    )

    assert settings.production_config_errors() == []


def test_production_settings_reject_local_runtime_defaults():
    settings = Settings(
        environment="production",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_pk="stripe-public",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        admin_password="test-admin-password",
        frontend_url="http://localhost:3000",
        cors_allowed_origins="http://localhost:3000",
        cors_allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1):\d+$",
    )

    errors = settings.production_config_errors()

    assert any("DATABASE_URL" in error for error in errors)
    assert any("FRONTEND_URL" in error for error in errors)
    assert any("CORS_ALLOWED_ORIGINS" in error for error in errors)
    assert any("CORS_ALLOW_ORIGIN_REGEX" in error for error in errors)


def test_production_settings_reject_permissive_cors_policy():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_pk="stripe-public",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        admin_password="test-admin-password",
        frontend_url="https://app.example.com",
        cors_allowed_origins="*",
        cors_allow_origin_regex=r"^https?://.*$",
    )

    errors = settings.production_config_errors()

    assert any("CORS_ALLOWED_ORIGINS" in error and "wildcard" in error for error in errors)
    assert any("CORS_ALLOW_ORIGIN_REGEX" in error and "tightly scoped" in error for error in errors)


def test_zappa_production_environment_matches_startup_validation(monkeypatch):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    env = dict(zappa_settings["production"]["environment_variables"])

    required_env_names = {
        "KRESCO_ENV",
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "GOOGLE_CLIENT_ID",
        "VDOCIPHER_API_SECRET",
        "VDOCIPHER_API_BASE_URL",
        "VDOCIPHER_LIVE_CREATE_URL",
        "STRIPE_SK",
        "STRIPE_PRODUCT_ID",
        "STRIPE_WEBHOOK_SECRET",
        "RESEND_API_KEY",
        "ABLY_API_KEY",
        "FRONTEND_URL",
        "CORS_ALLOWED_ORIGINS",
        "CORS_ALLOW_ORIGIN_REGEX",
        "ADMIN_PASSWORD",
    }
    missing = required_env_names - set(env)
    assert missing == set()

    assert "localhost" not in env["CORS_ALLOWED_ORIGINS"]
    assert "127.0.0.1" not in env["CORS_ALLOWED_ORIGINS"]
    assert "ngrok" not in env["CORS_ALLOWED_ORIGINS"]

    resolved_env = {
        key: SECRET_PLACEHOLDERS.get(key, value)
        if value == "__SET_IN_AWS_SECRETS__" else value
        for key, value in env.items()
    }
    for key, value in resolved_env.items():
        monkeypatch.setenv(key, value)

    settings = Settings()

    assert settings.production_config_errors() == []


def test_render_zappa_settings_substitutes_placeholders_and_validates(tmp_path):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")

    runtime_env = {
        key: value
        for key, value in SECRET_PLACEHOLDERS.items()
        if key != "STRIPE_PK"
    }
    runtime_env["FRONTEND_URL"] = "https://app.example.com"
    runtime_env["CORS_ALLOWED_ORIGINS"] = "https://app.example.com"

    result = render_zappa_settings(zappa_path, runtime_env)
    rendered = json.loads(zappa_path.read_text(encoding="utf-8"))["production"]["environment_variables"]

    assert PLACEHOLDER not in rendered.values()
    assert rendered["DATABASE_URL"] == SECRET_PLACEHOLDERS["DATABASE_URL"]
    assert rendered["JWT_SECRET_KEY"] == SECRET_PLACEHOLDERS["JWT_SECRET_KEY"]
    assert rendered["FRONTEND_URL"] == "https://app.example.com"
    assert rendered["CORS_ALLOWED_ORIGINS"] == "https://app.example.com"
    assert rendered["STRIPE_PK"] == ""
    assert "DATABASE_URL" in result.replaced_keys
    assert "JWT_SECRET_KEY" in result.replaced_keys
    assert "STRIPE_PK" not in result.replaced_keys
    assert result.overridden_keys == ("CORS_ALLOWED_ORIGINS", "FRONTEND_URL")


def test_render_zappa_settings_requires_placeholder_values_without_leaking_secrets(tmp_path):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")
    runtime_env = {
        key: value
        for key, value in SECRET_PLACEHOLDERS.items()
        if key not in {"JWT_SECRET_KEY", "STRIPE_PK"}
    }

    with pytest.raises(ZappaRenderError) as exc_info:
        render_zappa_settings(zappa_path, runtime_env)

    message = str(exc_info.value)
    assert "JWT_SECRET_KEY" in message
    assert SECRET_PLACEHOLDERS["DATABASE_URL"] not in message
    assert SECRET_PLACEHOLDERS["GOOGLE_CLIENT_ID"] not in message


def test_render_zappa_settings_validates_template_without_host_env_leakage(tmp_path, monkeypatch):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_settings["production"]["environment_variables"].pop("KRESCO_ENV")
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")
    runtime_env = {
        key: value
        for key, value in SECRET_PLACEHOLDERS.items()
        if key != "STRIPE_PK"
    }
    monkeypatch.setenv("KRESCO_ENV", "production")

    with pytest.raises(ZappaRenderError) as exc_info:
        render_zappa_settings(zappa_path, runtime_env)

    assert "KRESCO_ENV" in str(exc_info.value)
