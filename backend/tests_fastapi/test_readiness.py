from types import SimpleNamespace

from sqlalchemy import delete, text

from app.database import get_session_factory
from app.models.professor import RealtimeOutbox
from app.services import diagnostics
from app.services.diagnostics import expected_migration_heads


def test_health_remains_liveness_only(app_client):
    response = app_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": "2.0.0",
        "release_sha": app_client.app.state.release_sha,
    }


def test_ready_checks_database_and_configuration(app_client):
    response = app_client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["configuration"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert set(body["checks"]["config_services"].keys()) == {"database", "s3", "ably", "vdocipher", "smtp", "payment"}


def test_ready_reports_database_failure_without_exception_details(app_client):
    original_engine = app_client.app.state.db_engine
    app_client.app.state.db_engine = BrokenEngine()
    try:
        response = app_client.get("/ready")
    finally:
        app_client.app.state.db_engine = original_engine

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["errors"] == ["database"]
    assert body["checks"]["configuration"] == "ok"
    assert body["checks"]["database"] == "error"
    assert set(body["checks"]["config_services"].keys()) == {"database", "s3", "ably", "vdocipher", "smtp", "payment"}


def test_internal_diagnostics_requires_worker_secret(app_client, test_settings):
    old_secret = test_settings.realtime_outbox_secret
    test_settings.realtime_outbox_secret = "diagnostics-worker-secret-32-bytes"
    try:
        missing = app_client.get("/api/internal/diagnostics")
        wrong = app_client.get(
            "/api/internal/diagnostics",
            headers={"x-kresco-internal-secret": "wrong"},
        )
    finally:
        test_settings.realtime_outbox_secret = old_secret

    assert missing.status_code == 403
    assert wrong.status_code == 403


def test_internal_diagnostics_reports_ready_launch_gate(app_client, run_db, test_settings):
    old_values = _snapshot_diagnostics_settings(test_settings)
    run_db(_set_alembic_heads(expected_migration_heads()))
    run_db(_clear_outbox())
    _set_ready_diagnostics_settings(test_settings)
    try:
        response = app_client.get(
            "/api/internal/diagnostics",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        _restore_settings(test_settings, old_values)

    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "ready"
    assert body["errors"] == []
    assert body["checks"]["database"] == {
        "status": "ok",
        "strategy": "rds_proxy",
        "rds_proxy_declared": True,
    }
    assert body["checks"]["migrations"] == {
        "status": "ok",
        "current_heads": expected_migration_heads(),
        "expected_heads": expected_migration_heads(),
    }
    assert body["checks"]["storage"] == {
        "status": "ok",
        "backend": "s3",
        "bucket_configured": True,
        "region_configured": True,
        "prefix_configured": True,
        "presign_ttl_seconds": 300,
        "profile_quota_bytes": 10 * 1024 * 1024,
        "chat_conversation_quota_bytes": 50 * 1024 * 1024,
        "lifecycle_expiration_days": 365,
    }
    assert body["checks"]["realtime"] == {
        "status": "ok",
        "ably_key": "ok",
        "outbox_secret_configured": True,
        "outbox": {"status": "ok", "pending": 0, "retry": 0, "dead": 0},
    }
    assert body["checks"]["video"] == {
        "status": "ok",
        "api_secret_configured": True,
        "api_base_url_https": True,
        "live_create_url_https": True,
    }
    assert body["checks"]["email"] == {
        "status": "ok",
        "resend_api_key_configured": True,
    }
    assert body["checks"]["payment"] == {
        "status": "ok",
        "stripe_sk_configured": True,
        "stripe_product_id_configured": True,
        "stripe_webhook_secret_configured": True,
    }


def test_internal_diagnostics_can_check_stripe_provider_reachability(app_client, run_db, test_settings, monkeypatch):
    class FakeProducts:
        def retrieve(self, product_id):
            return SimpleNamespace(id=product_id, active=True)

    class FakeStripeClient:
        v1 = SimpleNamespace(products=FakeProducts())

    monkeypatch.setattr(diagnostics, "_stripe_client", lambda settings: FakeStripeClient())
    old_values = _snapshot_diagnostics_settings(test_settings)
    run_db(_set_alembic_heads(expected_migration_heads()))
    run_db(_clear_outbox())
    _set_ready_diagnostics_settings(test_settings)
    try:
        response = app_client.get(
            "/api/internal/diagnostics?include_provider_reachability=true",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        _restore_settings(test_settings, old_values)

    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "ready"
    assert body["checks"]["payment"]["provider_reachability"] == {
        "status": "ok",
        "product_id_matches": True,
        "product_active": True,
    }


def test_internal_diagnostics_reports_stripe_connection_failure_without_secret(
    app_client,
    run_db,
    test_settings,
    monkeypatch,
):
    class FakeProducts:
        def retrieve(self, product_id):
            raise diagnostics.stripe.APIConnectionError("network unavailable")

    class FakeStripeClient:
        v1 = SimpleNamespace(products=FakeProducts())

    monkeypatch.setattr(diagnostics, "_stripe_client", lambda settings: FakeStripeClient())
    old_values = _snapshot_diagnostics_settings(test_settings)
    run_db(_set_alembic_heads(expected_migration_heads()))
    run_db(_clear_outbox())
    _set_ready_diagnostics_settings(test_settings)
    configured_stripe_secret = test_settings.stripe_sk
    try:
        response = app_client.get(
            "/api/internal/diagnostics?include_provider_reachability=true",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        _restore_settings(test_settings, old_values)

    body = response.json()
    payment = body["checks"]["payment"]
    assert response.status_code == 200
    assert body["status"] == "not_ready"
    assert "payment" in body["errors"]
    assert payment["provider_reachability"] == {
        "status": "error",
        "detail": "api_connection_error",
        "error_type": "APIConnectionError",
    }
    assert configured_stripe_secret not in str(payment)


def test_internal_diagnostics_exposes_broken_launch_gate_state(app_client, run_db, test_settings):
    old_values = _snapshot_diagnostics_settings(test_settings)
    run_db(_set_alembic_heads(["0000"]))
    run_db(_clear_outbox())
    run_db(_add_dead_outbox_event())
    test_settings.realtime_outbox_secret = "diagnostics-worker-secret-32-bytes"
    test_settings.ably_api_key = "malformed"
    test_settings.media_storage_backend = "local"
    test_settings.media_s3_bucket = ""
    test_settings.media_s3_region = ""
    test_settings.vdocipher_api_secret = ""
    test_settings.vdocipher_api_base_url = "http://video.example.com/api"
    test_settings.vdocipher_live_create_url = ""
    test_settings.resend_api_key = ""
    try:
        response = app_client.get(
            "/api/internal/diagnostics",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        run_db(_clear_outbox())
        run_db(_set_alembic_heads(expected_migration_heads()))
        _restore_settings(test_settings, old_values)

    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "not_ready"
    assert {"migrations", "storage", "realtime", "video", "email"}.issubset(set(body["errors"]))
    assert body["checks"]["migrations"]["current_heads"] == ["0000"]
    assert body["checks"]["migrations"]["expected_heads"] == expected_migration_heads()
    assert body["checks"]["database"]["strategy"] == "direct"
    assert body["checks"]["database"]["rds_proxy_declared"] is False
    assert body["checks"]["storage"]["backend"] == "local"
    assert body["checks"]["realtime"]["ably_key"] == "malformed"
    assert body["checks"]["realtime"]["outbox"]["dead"] == 1
    assert body["checks"]["video"]["api_secret_configured"] is False
    assert body["checks"]["video"]["api_base_url_https"] is False
    assert body["checks"]["email"]["resend_api_key_configured"] is False


class BrokenEngine:
    def connect(self):
        return BrokenConnection()


class BrokenConnection:
    async def __aenter__(self):
        raise RuntimeError("sensitive connection detail")

    async def __aexit__(self, exc_type, exc, tb):
        return None


DIAGNOSTICS_SETTING_FIELDS = (
    "realtime_outbox_secret",
    "database_connection_strategy",
    "ably_api_key",
    "media_storage_backend",
    "media_s3_bucket",
    "media_s3_region",
    "media_s3_prefix",
    "media_s3_presign_ttl_seconds",
    "media_profile_quota_bytes",
    "media_chat_conversation_quota_bytes",
    "media_s3_lifecycle_expiration_days",
    "vdocipher_api_secret",
    "vdocipher_api_base_url",
    "vdocipher_live_create_url",
    "resend_api_key",
    "stripe_sk",
    "stripe_product_id",
    "stripe_webhook_secret",
)


def _snapshot_diagnostics_settings(settings):
    return {field: getattr(settings, field) for field in DIAGNOSTICS_SETTING_FIELDS}


def _restore_settings(settings, values):
    for field, value in values.items():
        setattr(settings, field, value)


def _set_ready_diagnostics_settings(settings):
    settings.realtime_outbox_secret = "diagnostics-worker-secret-32-bytes"
    settings.database_connection_strategy = "rds_proxy"
    settings.ably_api_key = "test.key:ably-test-secret"
    settings.media_storage_backend = "s3"
    settings.media_s3_bucket = "kresco-test-media"
    settings.media_s3_region = "eu-north-1"
    settings.media_s3_prefix = "media"
    settings.media_s3_presign_ttl_seconds = 300
    settings.media_profile_quota_bytes = 10 * 1024 * 1024
    settings.media_chat_conversation_quota_bytes = 50 * 1024 * 1024
    settings.media_s3_lifecycle_expiration_days = 365
    settings.vdocipher_api_secret = "vdocipher-secret"
    settings.vdocipher_api_base_url = "https://video.example.com/api"
    settings.vdocipher_live_create_url = "https://video.example.com/live"
    settings.resend_api_key = "re_test"
    settings.stripe_sk = "sk_test_staging"
    settings.stripe_product_id = "prod_test_staging"
    settings.stripe_webhook_secret = "whsec_test_staging"


async def _set_alembic_heads(heads: list[str]):
    session_factory = get_session_factory()
    async with session_factory() as db:
        await db.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(255) NOT NULL)"))
        await db.execute(text("DELETE FROM alembic_version"))
        for head in heads:
            await db.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"),
                {"version_num": head},
            )
        await db.commit()


async def _clear_outbox():
    session_factory = get_session_factory()
    async with session_factory() as db:
        await db.execute(delete(RealtimeOutbox))
        await db.commit()


async def _add_dead_outbox_event():
    session_factory = get_session_factory()
    async with session_factory() as db:
        db.add(RealtimeOutbox(
            channel="kresco:offering:1:notifications",
            event_name="diagnostic.test",
            payload_json={},
            status="dead",
            attempts=8,
            last_error="test dead-letter",
        ))
        await db.commit()
