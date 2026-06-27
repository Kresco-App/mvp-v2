from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "production-public-domain-evidence.yml"


def _workflow() -> str:
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def test_production_public_domain_evidence_is_manual_and_confirmed():
    workflow = _workflow()

    assert "name: Production Public Domain Evidence" in workflow
    assert "\n  workflow_dispatch:" in workflow
    assert "\n  push:" not in workflow
    assert "environment: Production" in workflow
    assert "confirm_production_public_domain_check" in workflow
    assert "Production public-domain evidence requires confirm_production_public_domain_check=true." in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "install_components: beta" not in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "if: always()" in workflow


def test_production_public_domain_evidence_targets_expected_hosts_and_services():
    workflow = _workflow()

    assert "PROJECT_ID: kresco-prod" in workflow
    assert "FRONTEND_SERVICE: kresco-frontend-prod" in workflow
    assert "BACKEND_SERVICE: kresco-backend-prod" in workflow
    assert "PRODUCTION_FRONTEND_APEX_URL: https://kresco.ma" in workflow
    assert "PRODUCTION_API_HOST: api.kresco.ma" in workflow
    assert "PRODUCTION_PUBLIC_API_URL: https://api.kresco.ma" in workflow
    assert "--environment production" in workflow
    assert "--api-host \"$PRODUCTION_API_HOST\"" in workflow


def test_production_public_domain_evidence_collects_auth_routing_api_and_hsts_proof():
    workflow = _workflow()

    assert "python scripts/check_firebase_hosting_rewrites.py" in workflow
    assert "python scripts/check_firebase_hosting_domains.py" in workflow
    assert "--live" in workflow
    assert "python scripts/export_firebase_hosting_dns_records.py" in workflow
    assert "python scripts/check_firebase_hosting_public_dns.py" in workflow
    assert "python scripts/check_public_auth_readiness.py" in workflow
    assert "python scripts/check_subdomain_routing.py" in workflow
    assert "Collect public API release evidence" in workflow
    assert 'ready_status, ready = fetch_json(result["ready_url"])' in workflow
    assert 'health_status, health = fetch_json(result["health_url"])' in workflow
    assert "public API release_sha was" in workflow
    assert "normalize_secret_value()" in workflow
    assert "--require-email-password" in workflow
    assert "--require-google-provider" in workflow
    assert "--expected-sha \"${{ inputs.expected_sha }}\"" in workflow
    assert "--hsts-policy \"${{ inputs.hsts_policy }}\"" in workflow
    assert "firebase-hosting-rewrites.status.json" in workflow
    assert "firebase-hosting-domains.status.json" in workflow
    assert "firebase-hosting-dns-records.status.json" in workflow
    assert "firebase-hosting-public-dns.status.json" in workflow
    assert "public-auth-readiness.status.json" in workflow
    assert "subdomain-routing.status.json" in workflow
    assert "public-api-health.status.json" in workflow
    assert "public-api-health.json" in workflow
    assert "evidence-manifest.json" in workflow
    assert "firebase-hosting-rewrites.json must report passed=true." in workflow
    assert "firebase-hosting-domains.json must report passed=true." in workflow
    assert "firebase-hosting-dns-records.json must report passed=true." in workflow
    assert "firebase-hosting-public-dns.json must report passed=true." in workflow
    assert "firebase-hosting-domains.json did not include" in workflow
    assert "firebase-hosting-domains.json did not live-check" in workflow
    assert "firebase-hosting-domains.json did not find live custom domain" in workflow
    assert "admin.kresco.ma" in workflow
    assert "staff.kresco.ma" in workflow
    assert "api.kresco.ma" in workflow
    assert "public-auth-readiness.json must report passed=true." in workflow
    assert "public-api-health.json must report passed=true." in workflow
    assert "public-api-health.json must prove the expected backend release SHA." in workflow
    assert "public-api-health.json must prove /ready status=ready." in workflow


def test_production_public_domain_evidence_does_not_mutate_external_state():
    workflow = _workflow()

    assert "--ensure" not in workflow
    assert "check_cloud_run_domain_mappings.py" not in workflow
    assert "--ensure-authorized-domains" not in workflow
    assert "gcloud run deploy" not in workflow
    assert "gcloud sql instances patch" not in workflow
