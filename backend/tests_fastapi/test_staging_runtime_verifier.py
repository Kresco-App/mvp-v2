from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
VERIFIER_PATH = REPO_ROOT / "scripts" / "check_staging_runtime.py"


def _load_verifier_module():
    spec = importlib.util.spec_from_file_location("check_staging_runtime_for_tests", VERIFIER_PATH)
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
            "database": {"status": "ok", "strategy": "cloud_sql", "managed_postgres_declared": True},
            "migrations": {
                "status": "ok",
                "current_heads": ["0027_media_quota_counters"],
                "expected_heads": ["0027_media_quota_counters"],
            },
            "storage": {
                "status": "ok",
                "backend": "gcs",
                "bucket_configured": True,
                "prefix_configured": True,
                "signed_url_ttl_seconds": 300,
                "profile_quota_bytes": 10 * 1024 * 1024,
                "chat_conversation_quota_bytes": 50 * 1024 * 1024,
            },
            "realtime": {
                "status": "ok",
                "firestore_configured": True,
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


def test_staging_runtime_verifier_rejects_direct_database_and_local_media():
    verifier = _load_verifier_module()
    diagnostics = _diagnostics_payload()
    diagnostics["checks"]["database"] = {"status": "ok", "strategy": "direct", "managed_postgres_declared": False}
    diagnostics["checks"]["storage"]["backend"] = "local"
    diagnostics["checks"]["realtime"]["firestore_configured"] = False
    diagnostics["checks"]["realtime"]["outbox"]["dead"] = 2

    result = verifier.validate_runtime_payloads(_ready_payload(), diagnostics)

    assert result.passed is False
    assert "database.strategy must be alloydb or cloud_sql." in result.errors
    assert "database.managed_postgres_declared must be true." in result.errors
    assert "storage.backend must be gcs." in result.errors
    assert "realtime.firestore_configured must be true." in result.errors
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


def test_backend_deploy_workflow_runs_cloud_run_health_after_migrations():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")

    build_index = workflow.index("- name: Build backend image")
    deploy_index = workflow.index("- name: Deploy backend service")
    migration_index = workflow.index("- name: Run migrations with stopped-db cleanup")
    readiness_index = workflow.index('ready_url = base_url + "/ready"')
    verifier_index = workflow.index("- name: Verify backend release health")
    migration_block = workflow[migration_index:verifier_index]

    assert build_index < deploy_index < migration_index < readiness_index < verifier_index
    assert 'ready_url = base_url + "/ready"' in migration_block
    assert "--activation-policy NEVER" in migration_block
    assert "google-github-actions/auth@v2" in workflow
    assert 'docker build --pull -t "$image" backend' in workflow
    assert 'docker push "$image"' in workflow
    assert "gcloud run deploy \"$BACKEND_SERVICE\"" in workflow
    assert "gcloud run jobs deploy \"$MIGRATION_JOB\"" in workflow
    assert "gcloud run jobs execute \"$MIGRATION_JOB\"" in workflow
    assert "--set-cloudsql-instances \"$cloud_sql_connection\"" in workflow
    assert 'ready_url = base_url + "/ready"' in workflow
    assert "--activation-policy ALWAYS" in workflow
    assert "--activation-policy NEVER" in workflow
    assert "KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest" in workflow

def test_provider_diagnostics_workflow_uses_runtime_verifier():
    workflow = (REPO_ROOT / ".github" / "workflows" / "staging-provider-diagnostics.yml").read_text(encoding="utf-8")
    diagnostics_step = workflow[workflow.index("- name: Run staging provider diagnostics"):]

    assert "actions/checkout@v4" in workflow
    assert "CLOUD_SQL_INSTANCE: kresco-staging-postgres" in workflow
    assert "EVIDENCE_DIR: artifacts/staging-provider-diagnostics" in workflow
    assert "mkdir -p \"$EVIDENCE_DIR\"" in workflow
    assert "--activation-policy ALWAYS" in diagnostics_step
    assert "--activation-policy NEVER" in diagnostics_step
    assert "trap cleanup EXIT" in diagnostics_step
    assert "did not become RUNNABLE within 15 minutes" in diagnostics_step
    assert "gcloud secrets versions access latest --project \"$PROJECT_ID\" --secret kresco-runtime" in diagnostics_step
    assert ".REALTIME_OUTBOX_SECRET // .realtime_outbox_secret // empty" in diagnostics_step
    assert "--internal-secret \"$internal_secret\"" in diagnostics_step
    assert "KRESCO_INTERNAL_SECRET" not in workflow
    assert "secrets.REALTIME_OUTBOX_SECRET" not in workflow
    assert "python scripts/check_staging_runtime.py" in workflow
    assert "> \"$EVIDENCE_DIR/runtime-diagnostics.json\"" in diagnostics_step
    assert "cat \"$EVIDENCE_DIR/runtime-diagnostics.json\"" in diagnostics_step
    assert "uses: actions/upload-artifact@v4" in workflow
    assert "if: always()" in workflow
    assert "name: staging-provider-diagnostics" in workflow
    assert "--include-provider-reachability" not in workflow
    assert "--json" in workflow


def test_recover_staging_realtime_outbox_workflow_uses_runtime_secret_and_cloud_sql_cleanup():
    workflow = (REPO_ROOT / ".github" / "workflows" / "recover-staging-realtime-outbox.yml").read_text(encoding="utf-8")
    recovery_step = workflow[workflow.index("- name: Requeue and drain staging realtime outbox"):]

    assert "CLOUD_SQL_INSTANCE: kresco-staging-postgres" in workflow
    assert "--activation-policy ALWAYS" in recovery_step
    assert "--activation-policy NEVER" in recovery_step
    assert "trap cleanup EXIT" in recovery_step
    assert "did not become RUNNABLE within 15 minutes" in recovery_step
    assert "gcloud secrets versions access latest --project \"$PROJECT_ID\" --secret kresco-runtime" in recovery_step
    assert ".REALTIME_OUTBOX_SECRET // .realtime_outbox_secret // empty" in recovery_step
    assert 'os.environ["internal_secret"]' in recovery_step
    assert "KRESCO_INTERNAL_SECRET" not in workflow
    assert "secrets.REALTIME_OUTBOX_SECRET" not in workflow
    assert "/api/internal/realtime/requeue-failed-outbox" in workflow
    assert "/api/internal/realtime/process-outbox" in workflow


def test_frontend_deploy_workflow_smokes_deployed_url():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")

    assert "gcloud run deploy \"$FRONTEND_SERVICE\"" in workflow
    assert "Verify frontend surface" in workflow
    assert "urllib.request.urlopen" in workflow
    assert "npm run validate:production-env" in workflow
    assert "NEXT_PUBLIC_FIREBASE_API_KEY" in workflow
