from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
VERIFIER_PATH = REPO_ROOT / "scripts" / "check_staging_runtime.py"
RENDERER_PATH = REPO_ROOT / "backend" / "scripts" / "render_zappa_settings.py"
VALID_RENDER_ENV = {
    "KRESCO_RUNTIME_SECRET_ID": "arn:aws:secretsmanager:eu-west-3:123456789012:secret:kresco/staging/runtime",
    "KRESCO_RELEASE_SHA": "0123456789abcdef0123456789abcdef01234567",
    "FRONTEND_URL": "https://staging.kresco.ma",
    "CORS_ALLOWED_ORIGINS": "https://staging.kresco.ma",
    "ZAPPA_SUBNET_IDS": "subnet-11111111,subnet-22222222",
    "ZAPPA_SECURITY_GROUP_IDS": "sg-11111111",
}


def _load_verifier_module():
    spec = importlib.util.spec_from_file_location("check_staging_runtime_for_tests", VERIFIER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_renderer_module():
    spec = importlib.util.spec_from_file_location("render_zappa_settings_for_ops_tests", RENDERER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _ready_payload():
    return {"status": "ready", "version": "2.0.0", "checks": {"configuration": "ok", "database": "ok"}}


def _diagnostics_payload():
    return {
        "status": "ready",
        "version": "2.0.0",
        "errors": [],
        "checks": {
            "configuration": {
                "status": "ok",
                "environment": "staging",
                "production_like": True,
                "error_count": 0,
                "errors": [],
            },
            "database": {"status": "ok", "strategy": "rds_proxy", "rds_proxy_declared": True},
            "migrations": {
                "status": "ok",
                "current_heads": ["0027_media_quota_counters"],
                "expected_heads": ["0027_media_quota_counters"],
            },
            "storage": {
                "status": "ok",
                "backend": "s3",
                "bucket_configured": True,
                "region_configured": True,
                "prefix_configured": True,
                "presign_ttl_seconds": 300,
                "profile_quota_bytes": 10 * 1024 * 1024,
                "chat_conversation_quota_bytes": 50 * 1024 * 1024,
                "lifecycle_expiration_days": 365,
            },
            "realtime": {
                "status": "ok",
                "ably_key": "ok",
                "outbox_secret_configured": True,
                "outbox": {"status": "ok", "pending": 0, "retry": 0, "dead": 0},
            },
            "video": {
                "status": "ok",
                "api_secret_configured": True,
                "api_base_url_https": True,
                "live_create_url_https": True,
            },
            "email": {"status": "ok", "resend_api_key_configured": True},
            "payment": {
                "status": "ok",
                "cmi_client_id_configured": True,
                "cmi_store_key_configured": True,
                "cmi_payment_url_configured": True,
                "cmi_ok_url_configured": True,
                "cmi_fail_url_configured": True,
                "cmi_callback_url_configured": True,
            },
        },
    }


def _diagnostics_payload_with_payment_error():
    diagnostics = _diagnostics_payload()
    diagnostics["status"] = "not_ready"
    diagnostics["errors"] = ["payment"]
    diagnostics["checks"]["payment"] = {
        "status": "error",
        "cmi_client_id_configured": True,
        "cmi_store_key_configured": True,
        "cmi_payment_url_configured": False,
        "cmi_ok_url_configured": True,
        "cmi_fail_url_configured": True,
        "cmi_callback_url_configured": True,
    }
    return diagnostics


def _diagnostics_payload_with_payment_config_error():
    diagnostics = _diagnostics_payload_with_payment_error()
    diagnostics["errors"] = ["configuration", "payment"]
    diagnostics["checks"]["configuration"] = {
        "status": "error",
        "environment": "staging",
        "production_like": True,
        "error_count": 6,
        "errors": [
            "CMI_CLIENT_ID must be configured for the launch CMI checkout path.",
            "CMI_STORE_KEY must be configured for the launch CMI checkout path.",
            "CMI_PAYMENT_URL must be configured for the launch CMI checkout path.",
            "CMI_OK_URL must be configured for the launch CMI checkout path.",
            "CMI_FAIL_URL must be configured for the launch CMI checkout path.",
            "CMI_CALLBACK_URL must be configured for the launch CMI checkout path.",
        ],
    }
    diagnostics["checks"]["payment"] = {
        "status": "error",
        "cmi_client_id_configured": False,
        "cmi_store_key_configured": False,
        "cmi_payment_url_configured": False,
        "cmi_ok_url_configured": False,
        "cmi_fail_url_configured": False,
        "cmi_callback_url_configured": False,
    }
    return diagnostics


def test_staging_runtime_verifier_accepts_ready_runtime_payloads():
    verifier = _load_verifier_module()

    result = verifier.validate_runtime_payloads(
        _ready_payload(),
        _diagnostics_payload(),
        {"ok": True, "claimed": 0, "published": 0, "retry": 0, "dead": 0},
    )

    assert result.passed is True
    assert result.errors == ()


def test_staging_runtime_verifier_fails_payment_errors():
    verifier = _load_verifier_module()

    result = verifier.validate_runtime_payloads(
        _ready_payload(),
        _diagnostics_payload_with_payment_error(),
        {"ok": True, "claimed": 0, "published": 0, "retry": 0, "dead": 0},
    )

    assert result.passed is False
    assert "diagnostics.status must be ready (blocking errors: payment)." in result.errors
    assert "diagnostics.checks.payment.status must be ok." in result.errors
    assert "payment.cmi_payment_url_configured must be true." in result.errors
    assert result.payment_check == {
        "status": "error",
        "cmi_client_id_configured": True,
        "cmi_store_key_configured": True,
        "cmi_payment_url_configured": False,
        "cmi_ok_url_configured": True,
        "cmi_fail_url_configured": True,
        "cmi_callback_url_configured": True,
    }


def test_staging_runtime_verifier_fails_payment_configuration_errors():
    verifier = _load_verifier_module()

    result = verifier.validate_runtime_payloads(
        _ready_payload(),
        _diagnostics_payload_with_payment_config_error(),
        {"ok": True, "claimed": 0, "published": 0, "retry": 0, "dead": 0},
    )

    assert result.passed is False
    assert "diagnostics.checks.configuration.status must be ok for blocking configuration errors." in result.errors
    assert "payment.cmi_client_id_configured must be true." in result.errors
    assert "payment.cmi_callback_url_configured must be true." in result.errors
    assert result.payment_check == {
        "status": "error",
        "cmi_client_id_configured": False,
        "cmi_store_key_configured": False,
        "cmi_payment_url_configured": False,
        "cmi_ok_url_configured": False,
        "cmi_fail_url_configured": False,
        "cmi_callback_url_configured": False,
    }


def test_staging_runtime_verifier_still_fails_diagnostics_errors():
    verifier = _load_verifier_module()
    diagnostics = _diagnostics_payload()
    diagnostics["status"] = "not_ready"
    diagnostics["errors"] = ["email"]
    diagnostics["checks"]["email"] = {"status": "error", "resend_api_key_configured": False}

    result = verifier.validate_runtime_payloads(_ready_payload(), diagnostics)

    assert result.passed is False
    assert "diagnostics.status must be ready (blocking errors: email)." in result.errors
    assert "diagnostics.checks.email.status must be ok." in result.errors
    assert "email.resend_api_key_configured must be true." in result.errors


def test_staging_runtime_verifier_rejects_not_ready_without_named_errors():
    verifier = _load_verifier_module()
    diagnostics = _diagnostics_payload()
    diagnostics["status"] = "not_ready"
    diagnostics["errors"] = []

    result = verifier.validate_runtime_payloads(_ready_payload(), diagnostics)

    assert result.passed is False
    assert "diagnostics.status must be ready." in result.errors


def test_staging_runtime_verifier_still_fails_configuration_errors():
    verifier = _load_verifier_module()
    diagnostics = _diagnostics_payload()
    diagnostics["status"] = "not_ready"
    diagnostics["errors"] = ["configuration"]
    diagnostics["checks"]["configuration"] = {
        "status": "error",
        "environment": "staging",
        "production_like": True,
        "error_count": 1,
        "errors": ["DATABASE_URL must include sslmode=verify-full in production environments."],
    }

    result = verifier.validate_runtime_payloads(_ready_payload(), diagnostics)

    assert result.passed is False
    assert "diagnostics.status must be ready (blocking errors: configuration)." in result.errors
    assert "diagnostics.checks.configuration.status must be ok for blocking configuration errors." in result.errors
    assert (
        "configuration.errors contains blocking errors: "
        "DATABASE_URL must include sslmode=verify-full in production environments."
    ) in result.errors


def test_staging_runtime_verifier_rejects_cosmetic_rds_proxy_and_local_media():
    verifier = _load_verifier_module()
    diagnostics = _diagnostics_payload()
    diagnostics["checks"]["database"] = {"status": "ok", "strategy": "direct", "rds_proxy_declared": False}
    diagnostics["checks"]["storage"]["backend"] = "local"
    diagnostics["checks"]["realtime"]["outbox"]["dead"] = 2

    result = verifier.validate_runtime_payloads(_ready_payload(), diagnostics)

    assert result.passed is False
    assert "database.strategy must be rds_proxy." in result.errors
    assert "database.rds_proxy_declared must be true." in result.errors
    assert "storage.backend must be s3." in result.errors
    assert "realtime.outbox.dead must be zero." in result.errors


def test_staging_runtime_verifier_derives_internal_urls_from_ready_url():
    verifier = _load_verifier_module()

    assert verifier.derive_url(
        "https://api.example.com/production/ready",
        "/api/internal/diagnostics",
    ) == "https://api.example.com/production/api/internal/diagnostics"
    assert verifier.derive_url(
        "https://api.example.com/ready",
        "/api/internal/realtime/process-outbox?limit=1",
    ) == "https://api.example.com/api/internal/realtime/process-outbox?limit=1"
    assert verifier.derive_url(
        "https://api.example.com/staging/ready",
        "/api/internal/realtime/process-outbox?limit=1",
    ) == "https://api.example.com/staging/api/internal/realtime/process-outbox?limit=1"


def test_staging_runtime_retries_log_to_stderr_not_json_stdout(monkeypatch, capsys):
    verifier = _load_verifier_module()
    attempts = {"count": 0}

    def fake_fetch_json(url, *, timeout_seconds):
        del url, timeout_seconds
        attempts["count"] += 1
        if attempts["count"] == 1:
            return {"status": "warming"}
        return {"status": "ready"}

    monkeypatch.setattr(verifier, "fetch_json", fake_fetch_json)
    monkeypatch.setattr(verifier.time, "sleep", lambda delay: None)

    payload = verifier._fetch_with_retries("https://api.example.com/ready", timeout_seconds=1, retries=2, delay=1)
    captured = capsys.readouterr()

    assert payload == {"status": "ready"}
    assert captured.out == ""
    assert "Runtime readiness attempt 1/2 failed" in captured.err


def test_staging_runtime_http_error_payload_redacts_sensitive_values():
    verifier = _load_verifier_module()

    redacted = verifier._redact_payload({
        "token": "secret-token-value-123",
        "nested": {"detail": "eyJheaderpart00.payloadpart00.signaturepart00"},
    })

    assert redacted["token"] == "[redacted]"
    assert redacted["nested"]["detail"] == "[redacted]"


def test_backend_deploy_workflow_runs_runtime_verifier_after_scheduling():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")

    db_policy_index = workflow.index("- name: Validate target database URL policy")
    migration_index = workflow.index("- name: Run Alembic migrations on target database")
    vpc_index = workflow.index("- name: Resolve Lambda VPC config")
    render_index = workflow.index("- name: Render Zappa environment")
    deploy_index = workflow.index('zappa deploy "$ZAPPA_STAGE" || zappa update "$ZAPPA_STAGE"')
    schedule_index = workflow.index('zappa schedule "$ZAPPA_STAGE"')
    verifier_index = workflow.index('python scripts/check_staging_runtime.py "${{ vars.BACKEND_READY_URL }}"')
    s3_posture_index = workflow.index('python scripts/check_s3_media_posture.py "${MEDIA_S3_BUCKET:?MEDIA_S3_BUCKET is required.}"')

    assert db_policy_index < migration_index < vpc_index < render_index < deploy_index
    assert deploy_index < schedule_index
    assert schedule_index < verifier_index < s3_posture_index
    assert 'zappa invoke "$ZAPPA_STAGE" app.scheduled.run_alembic_migrations_event' not in workflow
    assert "DATABASE_URL: ${{ secrets.DATABASE_URL }}" in workflow
    assert "validate_database_url_policy" in workflow
    assert "python scripts/resolve_zappa_vpc_config.py" in workflow
    assert "KRESCO_TEST_DATABASE_URL: ${{ env.CI_POSTGRES_DATABASE_URL }}" in workflow
    assert "ZAPPA_SUBNET_IDS: ${{ steps.vpc_config.outputs.subnet_ids }}" in workflow
    assert "ZAPPA_SECURITY_GROUP_IDS: ${{ steps.vpc_config.outputs.security_group_ids }}" in workflow
    assert "KRESCO_INTERNAL_SECRET: ${{ secrets.REALTIME_OUTBOX_SECRET }}" in workflow
    assert "MEDIA_S3_BUCKET: ${{ vars.MEDIA_S3_BUCKET }}" in workflow
    assert "MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS: ${{ vars.MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS }}" in workflow
    assert "MEDIA_S3_ANONYMOUS_READ_KEY: ${{ vars.MEDIA_S3_ANONYMOUS_READ_KEY }}" in workflow
    assert "--include-provider-reachability" not in workflow


def test_provider_diagnostics_workflow_uses_runtime_verifier():
    workflow = (REPO_ROOT / ".github" / "workflows" / "staging-provider-diagnostics.yml").read_text(encoding="utf-8")

    assert "actions/checkout@v4" in workflow
    assert "python scripts/check_staging_runtime.py" in workflow
    assert "--include-provider-reachability" not in workflow
    assert "--json" in workflow


def test_frontend_deploy_workflow_smokes_deployed_url():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")

    assert "FRONTEND_DEPLOYMENT_URL" in workflow
    assert "Post-deploy frontend smoke" in workflow
    assert "urllib.request.urlopen" in workflow
    assert "Validate staging frontend environment" in workflow
    assert "VERCEL_ENV: preview" in workflow


def test_target_database_url_policy_rejects_non_rds_proxy_shapes():
    renderer = _load_renderer_module()

    invalid_urls = [
        "",
        "sqlite+aiosqlite:///./db.sqlite3",
        "postgresql+asyncpg://user:pass@localhost:5432/kresco?sslmode=verify-full",
        "postgresql+asyncpg://user:pass@127.0.0.1:5432/kresco?sslmode=verify-full",
        "postgresql+asyncpg://user:pass@db.example.com:5432/kresco?sslmode=require",
    ]

    for database_url in invalid_urls:
        try:
            renderer.validate_database_url_policy(database_url)
        except renderer.ZappaRenderError:
            continue
        raise AssertionError(f"DATABASE_URL policy accepted invalid URL: {database_url!r}")

    renderer.validate_database_url_policy(
        "postgresql+asyncpg://user:pass@kresco-staging-proxy.proxy-c123.eu-west-3.rds.amazonaws.com:5432/kresco"
        "?sslmode=verify-full"
    )


def test_render_zappa_settings_rejects_lambda_runtime_drift(tmp_path):
    renderer = _load_renderer_module()
    settings_path = REPO_ROOT / "backend" / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text(encoding="utf-8"))
    zappa_settings["staging"]["memory_size"] = 512
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")

    try:
        renderer.render_zappa_settings(zappa_path, VALID_RENDER_ENV, stage="staging")
    except renderer.ZappaRenderError as exc:
        assert "memory_size must be at least 1024" in str(exc)
        return
    raise AssertionError("render_zappa_settings accepted staging Lambda memory drift")


def test_render_zappa_settings_requires_realtime_outbox_schedule(tmp_path):
    renderer = _load_renderer_module()
    settings_path = REPO_ROOT / "backend" / "zappa_settings.json"
    zappa_settings = json.loads(settings_path.read_text(encoding="utf-8"))
    zappa_settings["staging"]["events"] = []
    zappa_path = tmp_path / "zappa_settings.json"
    zappa_path.write_text(json.dumps(zappa_settings), encoding="utf-8")

    try:
        renderer.render_zappa_settings(zappa_path, VALID_RENDER_ENV, stage="staging")
    except renderer.ZappaRenderError as exc:
        assert "events must include the realtime outbox EventBridge schedule" in str(exc)
        return
    raise AssertionError("render_zappa_settings accepted missing realtime outbox schedule")
