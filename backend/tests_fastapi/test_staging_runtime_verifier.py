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
                "stripe_sk_configured": True,
                "stripe_product_id_configured": True,
                "stripe_webhook_secret_configured": True,
            },
        },
    }


def test_staging_runtime_verifier_accepts_ready_runtime_payloads():
    verifier = _load_verifier_module()

    result = verifier.validate_runtime_payloads(
        _ready_payload(),
        _diagnostics_payload(),
        {"ok": True, "claimed": 0, "published": 0, "retry": 0, "dead": 0},
    )

    assert result.passed is True
    assert result.errors == ()


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
    ) == "https://api.example.com/api/internal/diagnostics"
    assert verifier.derive_url(
        "https://api.example.com/ready",
        "/api/internal/realtime/process-outbox?limit=1",
    ) == "https://api.example.com/api/internal/realtime/process-outbox?limit=1"


def test_backend_deploy_workflow_runs_runtime_verifier_after_scheduling():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")

    vpc_index = workflow.index("- name: Resolve Lambda VPC config")
    render_index = workflow.index("- name: Render Zappa environment")
    deploy_index = workflow.index('zappa deploy "$ZAPPA_STAGE" || zappa update "$ZAPPA_STAGE"')
    migration_index = workflow.index('zappa invoke "$ZAPPA_STAGE" app.scheduled.run_alembic_migrations_event')
    schedule_index = workflow.index('zappa schedule "$ZAPPA_STAGE"')
    verifier_index = workflow.index('python scripts/check_staging_runtime.py "${{ vars.BACKEND_READY_URL }}"')

    assert vpc_index < render_index < deploy_index
    assert deploy_index < migration_index < schedule_index
    assert schedule_index < verifier_index
    assert "python scripts/resolve_zappa_vpc_config.py" in workflow
    assert "ZAPPA_SUBNET_IDS: ${{ steps.vpc_config.outputs.subnet_ids }}" in workflow
    assert "ZAPPA_SECURITY_GROUP_IDS: ${{ steps.vpc_config.outputs.security_group_ids }}" in workflow
    assert "KRESCO_INTERNAL_SECRET: ${{ secrets.REALTIME_OUTBOX_SECRET }}" in workflow
