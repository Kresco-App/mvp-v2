import json
import sys
from types import SimpleNamespace

from app.config import GCP_RUNTIME_SECRET_NAME_ENV, Settings, get_settings


def _production_settings(**overrides):
    values = {
        "environment": "production",
        "release_sha": "0123456789abcdef",
        "database_url": "postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
        "database_connection_strategy": "alloydb",
        "pgsslrootcert": "certifi",
        "jwt_secret_key": "prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
        "gcp_project_id": "kresco-staging",
        "gcp_region": "europe-southwest1",
        "firebase_project_id": "kresco-staging",
        "firebase_web_api_key": "firebase-web-api-key",
        "vdocipher_api_secret": "vdocipher-secret",
        "vdocipher_api_base_url": "https://video.example.com/api",
        "vdocipher_live_create_url": "https://video.example.com/live",
        "cmi_client_id": "cmi-client",
        "cmi_store_key": "cmi-store-key",
        "cmi_payment_url": "https://test.cmi.co.ma/payment",
        "cmi_ok_url": "https://app.example.com/payment/cmi/ok",
        "cmi_fail_url": "https://app.example.com/payment/cmi/fail",
        "cmi_callback_url": "https://api.example.com/api/payments/cmi/callback",
        "resend_api_key": "resend-key",
        "rate_limit_storage_uri": "redis://rate-limit.example.com:6379/0",
        "realtime_outbox_secret": "test-realtime-outbox-secret-32-bytes",
        "frontend_url": "https://app.example.com",
        "cors_allowed_origins": "https://app.example.com",
        "cors_allow_origin_regex": "",
        "media_storage_backend": "gcs",
        "media_gcs_bucket": "kresco-private-media",
        "media_gcs_prefix": "production",
        "media_gcs_signed_url_ttl_seconds": 300,
    }
    values.update(overrides)
    return Settings(**values)


def test_gcp_production_settings_accept_alloydb_and_gcs():
    settings = _production_settings()

    assert settings.production_config_errors() == []


def test_gcp_production_settings_reject_aws_runtime_shape():
    settings = _production_settings(
        database_connection_strategy="rds_proxy",
        media_storage_backend="s3",
        media_gcs_bucket="",
    )

    errors = settings.production_config_errors()

    assert "DATABASE_CONNECTION_STRATEGY must be alloydb or cloud_sql in production environments." in errors
    assert "MEDIA_STORAGE_BACKEND must be set to gcs in production environments." in errors
    assert "MEDIA_GCS_BUCKET must be configured for production environments." in errors


def test_gcp_runtime_secret_overrides_are_loaded_from_secret_manager(monkeypatch):
    secret_name = "projects/kresco-staging/secrets/kresco-runtime/versions/latest"

    class FakeSecretPayload:
        data = json.dumps(
            {
                "KRESCO_ENV": "staging",
                "GCP_PROJECT_ID": "kresco-staging",
                "GCP_REGION": "europe-southwest1",
                "FIREBASE_PROJECT_ID": "kresco-staging",
                "FIREBASE_WEB_API_KEY": "firebase-web-api-key",
                "DATABASE_CONNECTION_STRATEGY": "alloydb",
                "MEDIA_STORAGE_BACKEND": "gcs",
                "MEDIA_GCS_BUCKET": "kresco-private-media",
            }
        ).encode("utf-8")

    class FakeSecretResponse:
        payload = FakeSecretPayload()

    class FakeSecretManagerClient:
        def __init__(self):
            self.calls = []

        def access_secret_version(self, request):
            self.calls.append(request)
            return FakeSecretResponse()

    fake_client = FakeSecretManagerClient()
    fake_secretmanager = SimpleNamespace(SecretManagerServiceClient=lambda: fake_client)
    monkeypatch.setitem(sys.modules, "google.cloud.secretmanager", fake_secretmanager)
    monkeypatch.setitem(sys.modules, "google.cloud", SimpleNamespace(secretmanager=fake_secretmanager))
    monkeypatch.setenv(GCP_RUNTIME_SECRET_NAME_ENV, secret_name)
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.environment == "staging"
    assert settings.gcp_project_id == "kresco-staging"
    assert settings.database_connection_strategy == "alloydb"
    assert settings.media_storage_backend == "gcs"
    assert settings.media_gcs_bucket == "kresco-private-media"
    assert fake_client.calls == [{"name": secret_name}]
    get_settings.cache_clear()
