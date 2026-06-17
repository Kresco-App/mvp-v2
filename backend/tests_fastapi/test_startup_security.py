import json
from types import SimpleNamespace
from pathlib import Path

import pytest
from fastapi.responses import ORJSONResponse
from starlette.requests import Request

from app import rate_limit
from app.config import Settings
from app.main import create_app


SECRET_PLACEHOLDERS = {
    "KRESCO_RELEASE_SHA": "0123456789abcdef0123456789abcdef01234567",
    "DATABASE_URL": "postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
    "DATABASE_CONNECTION_STRATEGY": "cloud_sql",
    "GCP_PROJECT_ID": "kresco-prod",
    "GCP_REGION": "europe-southwest1",
    "FIREBASE_PROJECT_ID": "kresco-prod",
    "FIREBASE_WEB_API_KEY": "firebase-web-api-key",
    "JWT_SECRET_KEY": "prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
    "VDOCIPHER_API_SECRET": "vdocipher-secret",
    "VDOCIPHER_API_BASE_URL": "https://video.example.com/api",
    "VDOCIPHER_LIVE_CREATE_URL": "https://video.example.com/live",
    "CMI_CLIENT_ID": "cmi-client",
    "CMI_STORE_KEY": "cmi-store-key",
    "CMI_PAYMENT_URL": "https://test.cmi.co.ma/payment",
    "CMI_OK_URL": "https://app.example.com/payment/cmi/ok",
    "CMI_FAIL_URL": "https://app.example.com/payment/cmi/fail",
    "CMI_CALLBACK_URL": "https://api.example.com/api/payments/cmi/callback",
    "RESEND_API_KEY": "resend-key",
    "KRESCO_RATE_LIMIT_STORAGE_URI": "redis://rate-limit.example.com:6379/0",
    "REALTIME_OUTBOX_SECRET": "test-realtime-outbox-secret-32-bytes",
    "FRONTEND_URL": "https://app.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
    "MEDIA_GCS_BUCKET": "kresco-media-production",
}
PRODUCTION_MEDIA_SETTINGS = {
    "gcp_project_id": "kresco-prod",
    "gcp_region": "europe-southwest1",
    "firebase_project_id": "kresco-prod",
    "firebase_web_api_key": "firebase-web-api-key",
    "database_connection_strategy": "cloud_sql",
    "media_storage_backend": "gcs",
    "media_gcs_bucket": "kresco-media-production",
    "media_gcs_signed_url_ttl_seconds": 300,
    "media_profile_quota_bytes": 10 * 1024 * 1024,
    "media_chat_conversation_quota_bytes": 50 * 1024 * 1024,
    "rate_limit_storage_uri": "redis://rate-limit.example.com:6379/0",
}


def test_local_settings_allow_development_defaults():
    settings = Settings()

    assert settings.media_gcs_signed_url_ttl_seconds == 3600
    assert settings.production_config_errors() == []


def test_settings_do_not_ship_public_jwt_secret_by_default():
    settings = Settings(_env_file=None)

    assert settings.jwt_secret_key == ""


def test_security_headers_are_applied_to_responses(app_client):
    response = app_client.get("/health")

    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-release-sha"] == app_client.app.state.release_sha


def test_create_app_applies_configured_rate_limit_storage(monkeypatch, test_settings):
    applied: list[str] = []
    monkeypatch.setattr("app.main.configure_rate_limit_storage", lambda uri: applied.append(uri))

    create_app(test_settings.model_copy(update={"rate_limit_storage_uri": "redis://rate-limit.example.com:6379/0"}))

    assert applied == ["redis://rate-limit.example.com:6379/0"]


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


def test_rate_limit_key_skips_invalid_forwarded_for_candidates_from_trusted_proxy(monkeypatch):
    monkeypatch.setenv(rate_limit.TRUSTED_PROXY_IPS_ENV, "10.0.0.0/8")

    trusted = _rate_limit_request("10.1.2.3", {"x-forwarded-for": "bad-value, 198.51.100.77, 10.1.2.3"})

    assert rate_limit.trusted_remote_address(trusted) == "198.51.100.77"


def test_global_rate_limit_values_are_env_configurable():
    assert rate_limit._rate_limit_values(" 10/minute,  100/hour ", "120/minute") == [
        "10/minute",
        "100/hour",
    ]
    assert rate_limit._rate_limit_values(" ", "120/minute") == ["120/minute"]


def test_blank_cors_origin_regex_is_disabled_not_wildcard():
    settings = Settings(cors_allow_origin_regex="")

    assert settings.cors_allow_origin_regex_value is None


def test_deployed_app_rejects_fallback_jwt_secret(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "kresco-backend-prod")
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret_key="fallback-secret-change-in-production",
    )

    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        create_app(settings)


def test_production_settings_reject_public_jwt_secret_placeholders():
    for jwt_secret_key in (
        "dev-jwt-secret-change-me-32-bytes-minimum",
        "test-secret-key-for-production-32-bytes-minimum",
        "placeholder-secret-for-production-32-bytes",
    ):
        settings = Settings(
            environment="production",
            jwt_secret_key=jwt_secret_key,
        )

        assert any("JWT_SECRET_KEY" in error for error in settings.production_config_errors())


def test_production_settings_reject_missing_integration_config():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="",
        vdocipher_api_base_url="",
        vdocipher_live_create_url="",
        cmi_client_id="",
        cmi_store_key="",
        cmi_payment_url="",
        cmi_ok_url="",
        cmi_fail_url="",
        cmi_callback_url="",
        resend_api_key="",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        frontend_url="https://app.example.com",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("VDOCIPHER_API_SECRET" in error for error in errors)
    assert any("VDOCIPHER_API_BASE_URL" in error for error in errors)
    assert any("CMI_CLIENT_ID" in error for error in errors)
    assert any("CMI_STORE_KEY" in error for error in errors)
    assert any("CMI_PAYMENT_URL" in error for error in errors)
    assert any("CMI_OK_URL" in error for error in errors)
    assert any("CMI_FAIL_URL" in error for error in errors)
    assert any("CMI_CALLBACK_URL" in error for error in errors)
    assert any("REALTIME_OUTBOX_SECRET" in error for error in errors)


def test_production_settings_require_shared_rate_limit_storage():
    settings = Settings(
        environment="production",
        release_sha="0123456789abcdef0123456789abcdef01234567",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **{
            **PRODUCTION_MEDIA_SETTINGS,
            "rate_limit_storage_uri": "memory://",
        },
    )

    errors = settings.production_config_errors()

    assert any("KRESCO_RATE_LIMIT_STORAGE_URI" in error for error in errors)


def test_production_settings_require_release_sha():
    settings = Settings(
        environment="production",
        release_sha="development",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
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
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        database_connection_strategy="cloud_sql",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
    )

    errors = settings.production_config_errors()

    assert any("MEDIA_STORAGE_BACKEND" in error for error in errors)
    assert any("MEDIA_GCS_BUCKET" in error for error in errors)


def test_production_settings_require_media_quota_and_lifecycle_config():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **{
                **PRODUCTION_MEDIA_SETTINGS,
                "media_profile_quota_bytes": 0,
                "media_chat_conversation_quota_bytes": 0,
                "media_gcs_signed_url_ttl_seconds": 0,
            },
        )

    errors = settings.production_config_errors()

    assert any("MEDIA_PROFILE_QUOTA_BYTES" in error for error in errors)
    assert any("MEDIA_CHAT_CONVERSATION_QUOTA_BYTES" in error for error in errors)
    assert any("MEDIA_GCS_SIGNED_URL_TTL_SECONDS" in error for error in errors)


def test_production_settings_require_verified_postgres_tls():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=require",
        pgsslrootcert="missing-ca.pem",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("sslmode=verify-full" in error for error in errors)
    assert any("PGSSLROOTCERT" in error for error in errors)


def test_production_settings_require_managed_postgres_connection_strategy():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
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


def test_production_settings_reject_invalid_cmi_launch_urls():
    settings = Settings(
        environment="production",
        release_sha="0123456789abcdef0123456789abcdef01234567",
        database_url="postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        cmi_client_id="cmi-client",
        cmi_store_key="cmi-store-key",
        cmi_payment_url="https://cmi.example.com/payment",
        cmi_ok_url="http://app.example.com/payment/cmi/ok",
        cmi_fail_url="https://127.0.0.1/payment/cmi/fail",
        cmi_callback_url="https://api.example.com/api/payments/cmi/callback",
        resend_api_key="resend-key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="https://app.example.com",
        cors_allow_origin_regex="",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert "CMI_PAYMENT_URL must use a CMI gateway host" in errors
    assert "CMI_OK_URL must be an HTTPS URL" in errors
    assert "CMI_FAIL_URL must be publicly reachable" in errors


def test_production_settings_reject_local_runtime_defaults():
    settings = Settings(
        environment="production",
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
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
        jwt_secret_key="prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        vdocipher_api_secret="vdocipher-secret",
        vdocipher_api_base_url="https://video.example.com/api",
        vdocipher_live_create_url="https://video.example.com/live",
        resend_api_key="resend-key",
        realtime_outbox_secret="test-realtime-outbox-secret-32-bytes",
        frontend_url="https://app.example.com",
        cors_allowed_origins="*",
        cors_allow_origin_regex=r"^https?://.*$",
        **PRODUCTION_MEDIA_SETTINGS,
    )

    errors = settings.production_config_errors()

    assert any("CORS_ALLOWED_ORIGINS" in error and "wildcard" in error for error in errors)
    assert any("CORS_ALLOW_ORIGIN_REGEX" in error and "tightly scoped" in error for error in errors)


def test_backend_ci_pytest_uses_postgres_service_when_configured():
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")
    conftest = (Path(__file__).resolve().parent / "conftest.py").read_text(encoding="utf-8")

    assert "KRESCO_TEST_DATABASE_URL: ${{ env.CI_POSTGRES_DATABASE_URL }}" in workflow
    assert 'os.environ.get("KRESCO_TEST_DATABASE_URL"' in conftest


def test_backend_deploy_workflow_passes_required_stage_render_inputs():
    workflow_path = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "deploy-backend.yml"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "environment: ${{ inputs.environment == 'production' && 'Production' || 'staging' }}" in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "GCP_WORKLOAD_IDENTITY_PROVIDER" in workflow
    assert "GCP_DEPLOY_SERVICE_ACCOUNT" in workflow
    assert "python scripts/check_production_launch_gate.py" in workflow
    assert "python scripts/check_secret_hygiene.py" in workflow
    assert "enforce_production_launch_gate" in workflow
    assert "inputs.enforce_production_launch_gate == true" in workflow
    assert "Dark production deploy only: this workflow does not route domains or user traffic." in workflow
    assert 'gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet' in workflow
    assert 'docker build --pull -t "$image" backend' in workflow
    assert 'docker push "$image"' in workflow
    assert 'gcloud run deploy "$BACKEND_SERVICE"' in workflow
    assert 'gcloud run jobs deploy "$MIGRATION_JOB"' in workflow
    assert 'gcloud run jobs execute "$MIGRATION_JOB"' in workflow
    assert '--set-cloudsql-instances "$cloud_sql_connection"' in workflow
    assert "--args scripts/run_alembic_from_settings.py" in workflow
    assert 'ready_url = base_url + "/ready"' in workflow
    assert "--activation-policy ALWAYS" in workflow
    assert "--activation-policy NEVER" in workflow
    assert "KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest" in workflow
    assert "--min-instances 0" in workflow
    assert "--max-instances 3" in workflow
    assert "lambda" not in workflow.lower()
    deploy_step = workflow[
        workflow.index("- name: Deploy backend service"):
        workflow.index("- name: Run migrations with stopped-db cleanup")
    ]
    assert "KRESCO_RELEASE_SHA=$SHORT_SHA" in deploy_step
    for secret_name in (
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "VDOCIPHER_API_SECRET",
        "VDOCIPHER_API_BASE_URL",
        "VDOCIPHER_LIVE_CREATE_URL",
        "CMI_CLIENT_ID",
        "CMI_STORE_KEY",
        "CMI_PAYMENT_URL",
        "CMI_OK_URL",
        "CMI_FAIL_URL",
        "CMI_CALLBACK_URL",
        "RESEND_API_KEY",
        "KRESCO_RATE_LIMIT_STORAGE_URI",
        "REALTIME_OUTBOX_SECRET",
        "MEDIA_GCS_BUCKET",
    ):
        assert f"{secret_name}=" not in deploy_step


def test_production_runbook_covers_release_recovery_and_incidents():
    runbook_path = Path(__file__).resolve().parents[2] / "docs" / "production-runbook.md"
    manual_ops_path = Path(__file__).resolve().parents[2] / "docs" / "manual-operations.md"

    runbook = runbook_path.read_text(encoding="utf-8")
    manual_ops = manual_ops_path.read_text(encoding="utf-8")

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

    assert "DATABASE_CONNECTION_STRATEGY=cloud_sql" in runbook
    assert "Kresco/Api" in runbook
    assert "ClientError" in runbook
    assert "/api/internal/diagnostics" in runbook
    assert "docs/production-runbook.md" in manual_ops
