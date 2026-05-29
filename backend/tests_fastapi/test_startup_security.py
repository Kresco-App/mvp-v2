import json
import sys
from types import SimpleNamespace
from pathlib import Path

import pytest
from fastapi.responses import ORJSONResponse
from starlette.requests import Request

from app import rate_limit
from app.config import RUNTIME_SECRET_ID_ENV, Settings, get_settings
from app.main import create_app
from scripts.render_zappa_settings import (
    PLACEHOLDER,
    ZappaRenderError,
    _settings_kwargs_from_environment,
    render_zappa_settings,
)


SECRET_PLACEHOLDERS = {
    "KRESCO_RELEASE_SHA": "0123456789abcdef0123456789abcdef01234567",
    "DATABASE_URL": "postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
    "DATABASE_CONNECTION_STRATEGY": "rds_proxy",
    "JWT_SECRET_KEY": "test-secret-key-for-production-32-bytes-minimum",
    "GOOGLE_CLIENT_ID": "google-client",
    "VDOCIPHER_API_SECRET": "vdocipher-secret",
    "VDOCIPHER_API_BASE_URL": "https://video.example.com/api",
    "VDOCIPHER_LIVE_CREATE_URL": "https://video.example.com/live",
    "STRIPE_PK": "stripe-public",
    "STRIPE_SK": "stripe-secret",
    "STRIPE_PRODUCT_ID": "stripe-product",
    "STRIPE_WEBHOOK_SECRET": "stripe-webhook",
    "RESEND_API_KEY": "resend-key",
    "ABLY_API_KEY": "ably:key",
    "REALTIME_OUTBOX_SECRET": "test-realtime-outbox-secret-32-bytes",
    "FRONTEND_URL": "https://app.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
    "MEDIA_S3_BUCKET": "kresco-media-production",
}
RUNTIME_SECRET_ARN = "arn:aws:secretsmanager:eu-north-1:123456789012:secret:kresco-production-AbCdEf"
DEPLOY_RENDER_ENV = {
    RUNTIME_SECRET_ID_ENV: RUNTIME_SECRET_ARN,
    "KRESCO_RELEASE_SHA": "0123456789abcdef0123456789abcdef01234567",
    "FRONTEND_URL": "https://app.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
    "ZAPPA_SUBNET_IDS": "subnet-11111111,subnet-22222222",
    "ZAPPA_SECURITY_GROUP_IDS": "sg-11111111",
}


PRODUCTION_MEDIA_SETTINGS = {
    "database_connection_strategy": "rds_proxy",
    "media_storage_backend": "s3",
    "media_s3_bucket": "kresco-media-production",
    "media_s3_region": "eu-north-1",
    "media_s3_presign_ttl_seconds": 300,
    "media_profile_quota_bytes": 10 * 1024 * 1024,
    "media_chat_conversation_quota_bytes": 50 * 1024 * 1024,
    "media_s3_lifecycle_expiration_days": 365,
}


def test_local_settings_allow_development_defaults():
    settings = Settings()

    assert settings.production_config_errors() == []


def test_settings_do_not_ship_public_jwt_secret_by_default():
    settings = Settings(_env_file=None)

    assert settings.jwt_secret_key == ""


def test_get_settings_loads_runtime_secret_from_secrets_manager(monkeypatch):
    calls: list[tuple[str, str | None, str]] = []

    class FakeSecretsManagerClient:
        def get_secret_value(self, SecretId):
            calls.append(("get_secret_value", None, SecretId))
            return {
                "SecretString": json.dumps(
                    {
                        **SECRET_PLACEHOLDERS,
                        "KRESCO_ENV": "production",
                        "DATABASE_POOL_SIZE": "12",
                        "DATABASE_MAX_OVERFLOW": "6",
                        "DATABASE_POOL_TIMEOUT": "9",
                        "PGSSLROOTCERT": "certs/rds-global-bundle.pem",
                        "CORS_ALLOW_ORIGIN_REGEX": "",
                        "MEDIA_STORAGE_BACKEND": "s3",
                        "MEDIA_S3_REGION": "eu-north-1",
                        "MEDIA_S3_PREFIX": "production",
                        "MEDIA_S3_PRESIGN_TTL_SECONDS": "300",
                        "MEDIA_PROFILE_QUOTA_BYTES": "10485760",
                        "MEDIA_CHAT_CONVERSATION_QUOTA_BYTES": "52428800",
                        "MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS": "365",
                    }
                )
            }

    def fake_client(service_name, region_name=None):
        calls.append(("client", region_name, service_name))
        return FakeSecretsManagerClient()

    get_settings.cache_clear()
    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=fake_client))
    monkeypatch.setenv(RUNTIME_SECRET_ID_ENV, RUNTIME_SECRET_ARN)
    monkeypatch.setenv("AWS_REGION", "eu-north-1")

    settings = get_settings()

    assert settings.database_url == SECRET_PLACEHOLDERS["DATABASE_URL"]
    assert settings.database_pool_size == 12
    assert settings.database_max_overflow == 6
    assert settings.database_pool_timeout == 9
    assert settings.jwt_secret_key == SECRET_PLACEHOLDERS["JWT_SECRET_KEY"]
    assert settings.media_s3_bucket == SECRET_PLACEHOLDERS["MEDIA_S3_BUCKET"]
    assert settings.production_config_errors() == []
    assert calls == [
        ("client", "eu-north-1", "secretsmanager"),
        ("get_secret_value", None, RUNTIME_SECRET_ARN),
    ]
    get_settings.cache_clear()


def test_security_headers_are_applied_to_responses(app_client):
    response = app_client.get("/health")

    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-release-sha"] == app_client.app.state.release_sha


def test_health_and_ready_expose_release_correlation(app_client):
    health = app_client.get("/health")
    ready = app_client.get("/ready")

    assert health.json()["release_sha"] == app_client.app.state.release_sha
    assert ready.json()["release_sha"] == app_client.app.state.release_sha


def test_app_uses_orjson_for_default_response_serialization(app_client):
    assert app_client.app.router.default_response_class is ORJSONResponse


def test_global_rate_limit_applies_to_undecorated_routes(app_client):
    response = None
    for _ in range(121):
        response = app_client.get("/health")

    assert response is not None
    assert response.status_code == 429
    assert response.headers["x-content-type-options"] == "nosniff"


def _rate_limit_request(client_host: str, headers: dict[str, str] | None = None) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/health",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": (client_host, 12345),
        "headers": [
            (key.lower().encode("latin1"), value.encode("latin1"))
            for key, value in (headers or {}).items()
        ],
    })


def test_rate_limit_key_ignores_spoofed_forwarded_for_without_trusted_proxy(monkeypatch):
    monkeypatch.delenv(rate_limit.TRUSTED_PROXY_IPS_ENV, raising=False)

    request = _rate_limit_request("203.0.113.10", {"x-forwarded-for": "198.51.100.77"})

    assert rate_limit.trusted_remote_address(request) == "203.0.113.10"
    assert rate_limit.limiter._key_func is rate_limit.trusted_remote_address


def test_rate_limit_key_trusts_forwarded_for_only_from_configured_proxy(monkeypatch):
    monkeypatch.setenv(rate_limit.TRUSTED_PROXY_IPS_ENV, "10.0.0.0/8")

    trusted = _rate_limit_request("10.1.2.3", {"x-forwarded-for": "198.51.100.77, 10.1.2.3"})
    untrusted = _rate_limit_request("203.0.113.10", {"x-forwarded-for": "198.51.100.77"})

    assert rate_limit.trusted_remote_address(trusted) == "198.51.100.77"
    assert rate_limit.trusted_remote_address(untrusted) == "203.0.113.10"


def test_deployed_app_rejects_fallback_jwt_secret(monkeypatch):
    monkeypatch.setenv("LAMBDA_TASK_ROOT", "/var/task")
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret_key="fallback-secret-change-in-production",
    )

    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        create_app(settings)


def test_production_settings_reject_missing_integration_config():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
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
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        frontend_url="https://app.example.com",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("GOOGLE_CLIENT_ID" in error for error in errors)
    assert any("VDOCIPHER_API_SECRET" in error for error in errors)
    assert any("VDOCIPHER_API_BASE_URL" in error for error in errors)
    assert any("STRIPE_SK" in error for error in errors)
    assert any("ABLY_API_KEY" in error for error in errors)
    assert any("REALTIME_OUTBOX_SECRET" in error for error in errors)


def test_production_settings_require_release_sha():
    settings = Settings(
        environment="production",
        release_sha="development",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("KRESCO_RELEASE_SHA" in error for error in errors)


def test_production_settings_require_private_media_storage_config():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        database_connection_strategy="rds_proxy",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        media_s3_region="",
    )

    errors = settings.production_config_errors()

    assert any("MEDIA_STORAGE_BACKEND" in error for error in errors)
    assert any("MEDIA_S3_BUCKET" in error for error in errors)
    assert any("MEDIA_S3_REGION" in error or "AWS_REGION" in error for error in errors)
    assert not any("MEDIA_S3_PUBLIC_BASE_URL" in error for error in errors)


def test_production_settings_require_media_quota_and_lifecycle_config():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **{
            **PRODUCTION_MEDIA_SETTINGS,
            "media_profile_quota_bytes": 0,
            "media_chat_conversation_quota_bytes": 0,
            "media_s3_lifecycle_expiration_days": 0,
        },
    )

    errors = settings.production_config_errors()

    assert any("MEDIA_PROFILE_QUOTA_BYTES" in error for error in errors)
    assert any("MEDIA_CHAT_CONVERSATION_QUOTA_BYTES" in error for error in errors)
    assert any("MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS" in error for error in errors)


def test_production_settings_require_verified_postgres_tls():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=require",
        pgsslrootcert="missing-rds-ca.pem",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("sslmode=verify-full" in error for error in errors)
    assert any("PGSSLROOTCERT" in error for error in errors)


def test_production_settings_require_rds_proxy_connection_strategy():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="test-secret-key-for-production-32-bytes-minimum",
        google_client_id="google-client",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        stripe_sk="stripe-secret",
        stripe_product_id="stripe-product",
        stripe_webhook_secret="stripe-webhook",
        resend_api_key="resend-key",
        ably_api_key="ably:key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **{
            **PRODUCTION_MEDIA_SETTINGS,
            "database_connection_strategy": "direct",
        },
    )

    errors = settings.production_config_errors()

    assert any("DATABASE_CONNECTION_STRATEGY" in error for error in errors)


def test_production_settings_do_not_require_stripe_publishable_key_for_hosted_checkout():
    settings = Settings(
        environment="production",
        release_sha="0123456789abcdef0123456789abcdef01234567",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
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
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **PRODUCTION_MEDIA_SETTINGS,
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
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="http://localhost:3000",
        cors_allowed_origins="http://localhost:3000",
        cors_allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1):\d+$",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("DATABASE_URL" in error for error in errors)
    assert any("FRONTEND_URL" in error for error in errors)
    assert any("CORS_ALLOWED_ORIGINS" in error for error in errors)
    assert any("CORS_ALLOW_ORIGIN_REGEX" in error for error in errors)


def test_production_settings_reject_permissive_cors_policy():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
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
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="*",
        cors_allow_origin_regex=r"^https?://.*$",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("CORS_ALLOWED_ORIGINS" in error and "wildcard" in error for error in errors)
    assert any("CORS_ALLOW_ORIGIN_REGEX" in error and "tightly scoped" in error for error in errors)


def test_zappa_environments_match_startup_validation(monkeypatch):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())

    required_env_names = {
        "KRESCO_ENV",
        "KRESCO_RELEASE_SHA",
        RUNTIME_SECRET_ID_ENV,
        "DATABASE_CONNECTION_STRATEGY",
        "PGSSLROOTCERT",
        "FRONTEND_URL",
        "CORS_ALLOWED_ORIGINS",
        "CORS_ALLOW_ORIGIN_REGEX",
        "MEDIA_STORAGE_BACKEND",
        "MEDIA_S3_REGION",
        "MEDIA_S3_PREFIX",
        "MEDIA_S3_PRESIGN_TTL_SECONDS",
        "MEDIA_PROFILE_QUOTA_BYTES",
        "MEDIA_CHAT_CONVERSATION_QUOTA_BYTES",
        "MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS",
    }
    for stage in ("production", "staging"):
        stage_config = zappa_settings[stage]
        env = dict(zappa_settings[stage]["environment_variables"])
        missing = required_env_names - set(env)
        assert missing == set()

        assert stage_config["events"] == [
            {
                "function": "app.scheduled.process_realtime_outbox_event",
                "expression": "rate(1 minute)",
            }
        ]
        assert stage_config["memory_size"] >= 1024
        assert stage_config["timeout_seconds"] >= 45
        assert stage_config["keep_warm"] is True

        assert "localhost" not in env["CORS_ALLOWED_ORIGINS"]
        assert "127.0.0.1" not in env["CORS_ALLOWED_ORIGINS"]
        assert "ngrok" not in env["CORS_ALLOWED_ORIGINS"]
        assert "vercel.app" not in env["CORS_ALLOWED_ORIGINS"]
        assert "vercel.app" not in env["FRONTEND_URL"]
        assert env["CORS_ALLOWED_ORIGINS"] == PLACEHOLDER
        assert env["FRONTEND_URL"] == PLACEHOLDER
        assert env["KRESCO_RELEASE_SHA"] == PLACEHOLDER
        assert env[RUNTIME_SECRET_ID_ENV] == PLACEHOLDER
        for secret_backed_key in (
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
            "REALTIME_OUTBOX_SECRET",
            "MEDIA_S3_BUCKET",
        ):
            assert secret_backed_key not in env
        assert env["DATABASE_CONNECTION_STRATEGY"] == "rds_proxy"
        assert env["MEDIA_S3_PREFIX"] == stage
        assert stage_config["extra_permissions"] == [
            {
                "Effect": "Allow",
                "Action": ["secretsmanager:GetSecretValue"],
                "Resource": PLACEHOLDER,
            }
        ]

        resolved_env = {
            key: DEPLOY_RENDER_ENV.get(key, value)
            if value == PLACEHOLDER else value
            for key, value in env.items()
        }

        settings = Settings(**_settings_kwargs_from_environment({**resolved_env, **SECRET_PLACEHOLDERS}))

        assert settings.production_config_errors() == []


def test_backend_ci_pytest_uses_postgres_service_when_configured():
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")
    conftest = (Path(__file__).resolve().parent / "conftest.py").read_text(encoding="utf-8")

    assert "KRESCO_TEST_DATABASE_URL: ${{ env.CI_POSTGRES_DATABASE_URL }}" in workflow
    assert 'os.environ.get("KRESCO_TEST_DATABASE_URL"' in conftest


def test_render_zappa_settings_substitutes_placeholders_and_validates(tmp_path):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")

    runtime_env = DEPLOY_RENDER_ENV
    result = render_zappa_settings(zappa_path, runtime_env)
    rendered_doc = json.loads(zappa_path.read_text(encoding="utf-8"))
    rendered = rendered_doc["production"]["environment_variables"]

    assert PLACEHOLDER not in rendered.values()
    assert "DATABASE_URL" not in rendered
    assert "JWT_SECRET_KEY" not in rendered
    assert rendered[RUNTIME_SECRET_ID_ENV] == RUNTIME_SECRET_ARN
    assert rendered["KRESCO_RELEASE_SHA"] == DEPLOY_RENDER_ENV["KRESCO_RELEASE_SHA"]
    assert rendered["DATABASE_CONNECTION_STRATEGY"] == "rds_proxy"
    assert rendered["PGSSLROOTCERT"] == "certs/rds-global-bundle.pem"
    assert rendered["FRONTEND_URL"] == "https://app.example.com"
    assert rendered["CORS_ALLOWED_ORIGINS"] == "https://app.example.com"
    assert rendered["MEDIA_STORAGE_BACKEND"] == "s3"
    assert rendered["MEDIA_S3_PRESIGN_TTL_SECONDS"] == "300"
    assert rendered["MEDIA_PROFILE_QUOTA_BYTES"] == "10485760"
    assert rendered["MEDIA_CHAT_CONVERSATION_QUOTA_BYTES"] == "52428800"
    assert rendered["MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS"] == "365"
    assert rendered["STRIPE_PK"] == ""
    assert rendered_doc["production"]["extra_permissions"][0]["Resource"] == RUNTIME_SECRET_ARN
    assert rendered_doc["production"]["vpc_config"] == {
        "SubnetIds": ["subnet-11111111", "subnet-22222222"],
        "SecurityGroupIds": ["sg-11111111"],
    }
    assert rendered_doc["production"]["touch"] is False
    assert result.stage == "production"
    assert RUNTIME_SECRET_ID_ENV in result.replaced_keys
    assert "KRESCO_RELEASE_SHA" in result.replaced_keys
    assert "FRONTEND_URL" in result.replaced_keys
    assert "CORS_ALLOWED_ORIGINS" in result.replaced_keys
    assert "STRIPE_PK" not in result.replaced_keys
    assert result.overridden_keys == ()


def test_render_zappa_settings_supports_staging_stage(tmp_path):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")

    runtime_env = DEPLOY_RENDER_ENV

    result = render_zappa_settings(zappa_path, runtime_env, stage="staging")
    rendered_doc = json.loads(zappa_path.read_text(encoding="utf-8"))
    rendered = rendered_doc["staging"]["environment_variables"]

    assert result.stage == "staging"
    assert PLACEHOLDER not in rendered.values()
    assert rendered["KRESCO_ENV"] == "staging"
    assert rendered["KRESCO_RELEASE_SHA"] == DEPLOY_RENDER_ENV["KRESCO_RELEASE_SHA"]
    assert rendered[RUNTIME_SECRET_ID_ENV] == RUNTIME_SECRET_ARN
    assert rendered["FRONTEND_URL"] == SECRET_PLACEHOLDERS["FRONTEND_URL"]
    assert rendered["CORS_ALLOWED_ORIGINS"] == SECRET_PLACEHOLDERS["CORS_ALLOWED_ORIGINS"]
    assert rendered["MEDIA_S3_PREFIX"] == "staging"
    assert rendered_doc["staging"]["extra_permissions"][0]["Resource"] == RUNTIME_SECRET_ARN
    assert rendered_doc["staging"]["vpc_config"] == {
        "SubnetIds": ["subnet-11111111", "subnet-22222222"],
        "SecurityGroupIds": ["sg-11111111"],
    }
    assert rendered_doc["staging"]["touch"] is False
    assert rendered_doc["production"]["environment_variables"]["KRESCO_RELEASE_SHA"] == PLACEHOLDER
    assert rendered_doc["production"]["environment_variables"][RUNTIME_SECRET_ID_ENV] == PLACEHOLDER


def test_render_zappa_settings_requires_placeholder_values_without_leaking_secrets(tmp_path):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")
    runtime_env = {
        "FRONTEND_URL": "https://app.example.com",
        "CORS_ALLOWED_ORIGINS": "https://app.example.com",
    }

    with pytest.raises(ZappaRenderError) as exc_info:
        render_zappa_settings(zappa_path, runtime_env)

    message = str(exc_info.value)
    assert RUNTIME_SECRET_ID_ENV in message
    assert SECRET_PLACEHOLDERS["DATABASE_URL"] not in message
    assert SECRET_PLACEHOLDERS["GOOGLE_CLIENT_ID"] not in message


def test_render_zappa_settings_validates_template_without_host_env_leakage(tmp_path, monkeypatch):
    settings_path = Path(__file__).resolve().parents[1] / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text())
    zappa_settings["production"]["environment_variables"].pop("KRESCO_ENV")
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")
    runtime_env = DEPLOY_RENDER_ENV
    monkeypatch.setenv("KRESCO_ENV", "production")

    with pytest.raises(ZappaRenderError) as exc_info:
        render_zappa_settings(zappa_path, runtime_env)

    assert "KRESCO_ENV" in str(exc_info.value)


def test_backend_deploy_workflow_passes_required_stage_render_inputs():
    workflow_path = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "deploy-backend.yml"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "environment: ${{ inputs.stage }}" in workflow
    assert "ZAPPA_STAGE: ${{ inputs.stage }}" in workflow
    assert "python scripts/check_production_launch_gate.py" in workflow
    assert 'python scripts/render_zappa_settings.py zappa_settings.json "$ZAPPA_STAGE"' in workflow
    assert 'zappa deploy "$ZAPPA_STAGE" || zappa update "$ZAPPA_STAGE"' in workflow
    assert 'zappa schedule "$ZAPPA_STAGE"' in workflow
    assert "DATABASE_CONNECTION_STRATEGY: rds_proxy" in workflow
    assert 'DATABASE_URL="${{ secrets.DATABASE_URL }}"' not in workflow
    render_step = workflow[
        workflow.index("- name: Render Zappa environment"):
        workflow.index("- name: Deploy to Lambda")
    ]
    assert f"{RUNTIME_SECRET_ID_ENV}: ${{{{ vars.{RUNTIME_SECRET_ID_ENV} }}}}" in render_step
    assert "KRESCO_RELEASE_SHA: ${{ github.sha }}" in render_step
    for secret_name in (
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
        "REALTIME_OUTBOX_SECRET",
        "MEDIA_S3_BUCKET",
    ):
        assert f"{secret_name}: ${{{{ secrets.{secret_name} }}}}" not in render_step

    for var_name in ("FRONTEND_URL", "CORS_ALLOWED_ORIGINS", "CORS_ALLOW_ORIGIN_REGEX"):
        assert f"{var_name}: ${{{{ vars.{var_name} }}}}" in workflow


def test_production_runbook_covers_release_recovery_and_incidents():
    runbook_path = Path(__file__).resolve().parents[2] / "docs" / "production-runbook.md"
    manual_ops_path = Path(__file__).resolve().parents[2] / "docs" / "manual-operations.md"
    aws_deploy_path = Path(__file__).resolve().parents[2] / "docs" / "aws-deployment.md"

    runbook = runbook_path.read_text(encoding="utf-8")
    manual_ops = manual_ops_path.read_text(encoding="utf-8")
    aws_deploy = aws_deploy_path.read_text(encoding="utf-8")

    for heading in (
        "## Release Preflight",
        "## Deploy",
        "## Monitoring",
        "## Rollback",
        "## Migration Rollback",
        "## Backup And Restore",
        "## Incident Response",
    ):
        assert heading in runbook

    assert "DATABASE_CONNECTION_STRATEGY=rds_proxy" in runbook
    assert "Kresco/Api" in runbook
    assert "CLOUDWATCH_ALARM_NAMES" in runbook
    assert "ClientError" in runbook
    assert "/api/internal/diagnostics" in runbook
    assert "RDS Proxy" in runbook
    assert "docs/production-runbook.md" in manual_ops
    assert "docs/production-runbook.md" in aws_deploy
