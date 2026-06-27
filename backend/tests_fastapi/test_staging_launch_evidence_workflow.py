from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "staging-launch-evidence.yml"
EVIDENCE_VERIFIER_PATH = REPO_ROOT / "scripts" / "check_staging_launch_evidence.py"
EXPECTED_ARTIFACTS = (
    "backend-cloud-run.json",
    "frontend-cloud-run.json",
    "firebase-hosting-rewrites.json",
    "firebase-hosting-domains.json",
    "firebase-hosting-dns-records.json",
    "firebase-hosting-public-dns.status.json",
    "firebase-hosting-public-dns.json",
    "firebase-hosting-public-dns.stderr.txt",
    "cloud-sql.json",
    "artifact-registry.json",
    "media-runtime-config.json",
    "media-bucket.json",
    "media-bucket-error.json",
    "media-bucket-iam.json",
    "media-bucket-iam-error.json",
    "runtime-smoke.json",
    "subdomain-routing.status.json",
    "subdomain-routing.txt",
    "subdomain-routing.stderr.txt",
    "public-api-health.status.json",
    "public-api-health.json",
    "public-api-health.stderr.txt",
    "public-auth-readiness.json",
    "evidence-manifest.json",
)


def _load_evidence_verifier_module():
    spec = importlib.util.spec_from_file_location("check_staging_launch_evidence_for_tests", EVIDENCE_VERIFIER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _step_block(workflow: str, step_name: str) -> str:
    start = workflow.index(f"- name: {step_name}")
    end = workflow.find("\n      - name:", start + 1)
    return workflow[start:] if end == -1 else workflow[start:end]


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def _write_complete_evidence(evidence_dir: Path) -> None:
    cloud_run = {
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "autoscaling.knative.dev/minScale": "0",
                        "autoscaling.knative.dev/maxScale": "3",
                    },
                },
            },
        },
        "status": {"conditions": [{"type": "Ready", "status": "True"}]},
    }
    for name in ("backend", "frontend"):
        _write_json(evidence_dir / f"{name}-cloud-run.json", cloud_run)
    _write_json(
        evidence_dir / "firebase-hosting-rewrites.json",
        {
            "passed": True,
            "checks": [
                {"target": "staging-frontend", "passed": True, "errors": []},
                {"target": "staging-api", "passed": True, "errors": []},
            ],
        },
    )
    _write_json(
        evidence_dir / "firebase-hosting-domains.json",
        {
            "environment": "staging",
            "project_id": "kresco-staging",
            "passed": True,
            "entries": [
                {
                    "target": "staging-frontend",
                    "site": "kresco-staging",
                    "scope": "frontend",
                    "domains": [
                        "staging.kresco.ma",
                        "www.staging.kresco.ma",
                        "app.staging.kresco.ma",
                        "admin.staging.kresco.ma",
                        "prof.staging.kresco.ma",
                        "staff.staging.kresco.ma",
                    ],
                    "passed": True,
                    "errors": [],
                    "live_checked": True,
                    "live_domains": [
                        "staging.kresco.ma",
                        "www.staging.kresco.ma",
                        "app.staging.kresco.ma",
                        "admin.staging.kresco.ma",
                        "prof.staging.kresco.ma",
                        "staff.staging.kresco.ma",
                    ],
                },
                {
                    "target": "staging-api",
                    "site": "kresco-staging-api",
                    "scope": "api",
                    "domains": ["api.staging.kresco.ma"],
                    "passed": True,
                    "errors": [],
                    "live_checked": True,
                    "live_domains": ["api.staging.kresco.ma"],
                },
            ],
        },
    )
    _write_json(
        evidence_dir / "firebase-hosting-dns-records.json",
        {
            "environment": "staging",
            "project_id": "kresco-staging",
            "passed": True,
            "domains": [
                {"target": "staging-frontend", "site": "kresco-staging", "domain": "staging.kresco.ma", "passed": True, "records": [], "errors": []},
                {"target": "staging-frontend", "site": "kresco-staging", "domain": "www.staging.kresco.ma", "passed": True, "records": [], "errors": []},
                {"target": "staging-frontend", "site": "kresco-staging", "domain": "app.staging.kresco.ma", "passed": True, "records": [], "errors": []},
                {"target": "staging-frontend", "site": "kresco-staging", "domain": "admin.staging.kresco.ma", "passed": True, "records": [], "errors": []},
                {"target": "staging-frontend", "site": "kresco-staging", "domain": "prof.staging.kresco.ma", "passed": True, "records": [], "errors": []},
                {"target": "staging-frontend", "site": "kresco-staging", "domain": "staff.staging.kresco.ma", "passed": True, "records": [], "errors": []},
                {"target": "staging-api", "site": "kresco-staging-api", "domain": "api.staging.kresco.ma", "passed": True, "records": [], "errors": []},
            ],
        },
    )
    _write_json(evidence_dir / "firebase-hosting-public-dns.status.json", {"exit_code": 0})
    (evidence_dir / "firebase-hosting-public-dns.stderr.txt").write_text("", encoding="utf-8")
    _write_json(
        evidence_dir / "firebase-hosting-public-dns.json",
        {
            "environment": "staging",
            "passed": True,
            "records": [
                {"domain": "staging.kresco.ma", "record_type": "CNAME", "expected": "kresco-staging.web.app", "actual": ["kresco-staging.web.app"], "passed": True, "errors": []},
                {"domain": "api.staging.kresco.ma", "record_type": "CNAME", "expected": "kresco-staging-api.web.app", "actual": ["kresco-staging-api.web.app"], "passed": True, "errors": []},
            ],
        },
    )
    _write_json(
        evidence_dir / "cloud-sql.json",
        {
            "state": "STOPPED",
            "settings": {
                "activationPolicy": "NEVER",
                "availabilityType": "ZONAL",
                "dataDiskSizeGb": "20",
            },
        },
    )
    _write_json(
        evidence_dir / "artifact-registry.json",
        {"cleanupPolicies": {"delete-old-images": {}, "keep-latest-10": {}}},
    )
    _write_json(evidence_dir / "media-runtime-config.json", {"bucket_configured": True, "prefix_configured": True})
    _write_json(
        evidence_dir / "media-bucket.json",
        {
            "iamConfiguration": {
                "publicAccessPrevention": "enforced",
                "uniformBucketLevelAccess": {"enabled": True},
            },
            "lifecycle": {"rule": [{"action": {"type": "Delete"}, "condition": {"age": 30}}]},
        },
    )
    _write_json(
        evidence_dir / "media-bucket-iam.json",
        {"bindings": [{"role": "roles/storage.objectViewer", "members": ["serviceAccount:backend@example.com"]}]},
    )
    _write_json(
        evidence_dir / "runtime-smoke.json",
        {
            "backend_health_url": "https://backend.example.com/health",
            "backend_release_sha": "abc1234",
            "frontend_url": "https://frontend.example.com",
            "frontend_status": 200,
        },
    )
    _write_json(evidence_dir / "subdomain-routing.status.json", {"exit_code": 0})
    (evidence_dir / "subdomain-routing.txt").write_text(
        "Subdomain routing smoke passed for https://staging.kresco.ma.\n",
        encoding="utf-8",
    )
    (evidence_dir / "subdomain-routing.stderr.txt").write_text("", encoding="utf-8")
    _write_json(evidence_dir / "public-api-health.status.json", {"exit_code": 0})
    (evidence_dir / "public-api-health.stderr.txt").write_text("", encoding="utf-8")
    _write_json(
        evidence_dir / "public-api-health.json",
        {
            "passed": True,
            "errors": [],
            "api_url": "https://api.staging.kresco.ma",
            "ready_url": "https://api.staging.kresco.ma/ready",
            "health_url": "https://api.staging.kresco.ma/health",
            "ready_status": "ready",
            "ready_status_code": 200,
            "health_status_code": 200,
            "expected_sha": "abc1234",
            "release_sha": "abc1234",
        },
    )
    _write_json(
        evidence_dir / "public-auth-readiness.json",
        {
            "passed": True,
            "errors": [],
            "expected_domains": [
                "staging.kresco.ma",
                "www.staging.kresco.ma",
                "app.staging.kresco.ma",
                "admin.staging.kresco.ma",
                "prof.staging.kresco.ma",
                "staff.staging.kresco.ma",
            ],
            "expected_origins": [
                "https://staging.kresco.ma",
                "https://www.staging.kresco.ma",
                "https://app.staging.kresco.ma",
                "https://admin.staging.kresco.ma",
                "https://prof.staging.kresco.ma",
                "https://staff.staging.kresco.ma",
            ],
        },
    )


def _write_complete_gcloud_storage_evidence(evidence_dir: Path) -> None:
    _write_complete_evidence(evidence_dir)
    _write_json(
        evidence_dir / "media-bucket.json",
        {
            "name": "kresco-staging-private-media",
            "public_access_prevention": "enforced",
            "uniform_bucket_level_access": True,
            "lifecycle_config": {
                "rule": [
                    {
                        "action": {"type": "Delete"},
                        "condition": {"age": 30, "matchesPrefix": ["staging/"]},
                    }
                ]
            },
        },
    )


def test_staging_launch_evidence_workflow_runs_gcp_collectors_fail_closed():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "\n  workflow_dispatch:" in workflow
    assert "environment: staging" in workflow
    assert "set -x" not in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "install_components: beta" not in workflow
    assert "gcloud run services describe \"$BACKEND_SERVICE\"" in workflow
    assert "python scripts/check_firebase_hosting_rewrites.py" in workflow
    assert "python scripts/check_firebase_hosting_domains.py" in workflow
    assert "python scripts/export_firebase_hosting_dns_records.py" in workflow
    assert "python scripts/check_firebase_hosting_public_dns.py" in workflow
    assert "firebase-hosting-rewrites.json" in workflow
    assert "firebase-hosting-domains.json" in workflow
    assert "firebase-hosting-dns-records.json" in workflow
    assert "firebase-hosting-public-dns.json" in workflow
    assert "gcloud sql instances describe \"$CLOUD_SQL_INSTANCE\"" in workflow
    assert "gcloud artifacts repositories describe kresco-containers" in workflow
    assert "gcloud storage buckets describe \"gs://$media_bucket\"" in workflow
    assert "gcloud storage buckets get-iam-policy \"gs://$media_bucket\"" in workflow
    assert ".MEDIA_GCS_BUCKET // .media_gcs_bucket // empty" in workflow
    assert "normalize_secret_value()" in workflow
    assert "urllib.request.urlopen" in workflow
    assert "python scripts/check_subdomain_routing.py" in workflow
    assert "subdomain-routing.status.json" in workflow
    assert "--apex-url \"$STAGING_FRONTEND_APEX_URL\"" in workflow
    assert "--hsts-policy no-include-subdomains" in workflow
    assert "Collect public API release evidence" in workflow
    assert "STAGING_PUBLIC_API_URL: https://api.staging.kresco.ma" in workflow
    assert "public-api-health.json" in workflow
    assert "public-api-health.status.json" in workflow
    assert 'ready_status, ready = fetch_json(result["ready_url"])' in workflow
    assert 'health_status, health = fetch_json(result["health_url"])' in workflow
    assert "public API release_sha was" in workflow
    assert "python scripts/check_public_auth_readiness.py" in workflow
    assert "public-auth-readiness.json" in workflow
    assert "STAGING_FRONTEND_APEX_URL: https://staging.kresco.ma" in workflow
    assert "STAGING_API_HOST: api.staging.kresco.ma" in workflow
    assert "--runtime-secret-name kresco-runtime" in workflow
    public_auth_block = _step_block(workflow, "Collect public auth readiness")
    assert "--ensure-authorized-domains" not in public_auth_block
    assert "--require-email-password" in workflow
    assert "--require-google-provider" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "if: always()" in workflow
    assert "if-no-files-found: error" in workflow
    assert "staging launch evidence collection did not finish" in workflow
    assert "python scripts/check_staging_launch_evidence.py \"$EVIDENCE_DIR\"" in workflow
    assert workflow.count("continue-on-error: true") >= 5

    for artifact in EXPECTED_ARTIFACTS:
        assert artifact in workflow


def test_staging_launch_evidence_workflow_uses_gcp_environment_scope():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    for variable_name in (
        "PROJECT_ID: kresco-staging",
        "REGION: europe-southwest1",
        "BACKEND_SERVICE: kresco-backend-staging",
        "FRONTEND_SERVICE: kresco-frontend-staging",
        "CLOUD_SQL_INSTANCE: kresco-staging-postgres",
    ):
        assert variable_name in workflow

    job_env_block = workflow.split("\n    steps:", maxsplit=1)[0]
    assert "${{ secrets." not in job_env_block


def test_staging_launch_evidence_checks_cost_controls():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    cloud_sql_block = _step_block(workflow, "Collect Cloud SQL cost posture")
    assert 'doc.get("state") != "STOPPED"' in cloud_sql_block
    assert 'settings.get("activationPolicy") != "NEVER"' in cloud_sql_block
    assert 'settings.get("availabilityType") != "ZONAL"' in cloud_sql_block
    assert "20GB floor" in cloud_sql_block

    artifact_block = _step_block(workflow, "Collect Artifact Registry cleanup posture")
    assert "delete-old-images" in artifact_block
    assert "keep-latest-10" in artifact_block


def test_staging_launch_evidence_checks_firebase_hosting_rewrites():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    hosting_block = _step_block(workflow, "Collect Firebase Hosting rewrites")
    domain_block = _step_block(workflow, "Collect Firebase Hosting domain contract")

    assert "python scripts/check_firebase_hosting_rewrites.py" in hosting_block
    assert "--environment staging" in hosting_block
    assert "--json > \"$EVIDENCE_DIR/firebase-hosting-rewrites.json\"" in hosting_block
    assert "python scripts/check_firebase_hosting_domains.py" in domain_block
    assert "--environment staging" in domain_block
    assert "--live" in domain_block
    assert "--json > \"$EVIDENCE_DIR/firebase-hosting-domains.json\"" in domain_block

    dns_block = _step_block(workflow, "Collect Firebase Hosting DNS record plan")
    assert "python scripts/export_firebase_hosting_dns_records.py" in dns_block
    assert "--environment staging" in dns_block
    assert "--json > \"$EVIDENCE_DIR/firebase-hosting-dns-records.json\"" in dns_block

    public_dns_block = _step_block(workflow, "Collect public DNS record evidence")
    assert "python scripts/check_firebase_hosting_public_dns.py" in public_dns_block
    assert "--environment staging" in public_dns_block
    assert "firebase-hosting-public-dns.status.json" in public_dns_block


def test_staging_launch_evidence_checks_private_media_bucket_posture():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    media_block = _step_block(workflow, "Collect private media bucket posture")

    assert "gcloud secrets versions access latest" in media_block
    assert "MEDIA_GCS_BUCKET is missing from kresco-runtime" in media_block
    assert "media-runtime-config.json" in media_block
    assert "media-bucket.json" in media_block
    assert "media-bucket-error.json" in media_block
    assert "media-bucket-iam.json" in media_block
    assert "media-bucket-iam-error.json" in media_block
    assert "unable_to_describe_media_bucket" in media_block
    assert "unable_to_read_media_bucket_iam" in media_block
    assert "storage.buckets.get" in media_block
    assert "storage.buckets.getIamPolicy" in media_block
    assert "uniform_bucket_level_access" in media_block
    assert "public_access_prevention" in media_block
    assert "lifecycle_config" in media_block
    assert "uniformBucketLevelAccess" in media_block
    assert "publicAccessPrevention" in media_block
    assert "MEDIA_GCS_PREFIX must be configured" in media_block
    assert "allUsers" in media_block
    assert "allAuthenticatedUsers" in media_block


def test_staging_launch_evidence_verifier_accepts_complete_artifacts(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)

    result = verifier.evaluate_evidence(tmp_path)
    manifest_path = verifier.write_manifest(tmp_path, result)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert result.passed is True
    assert result.errors == ()
    assert manifest["passed"] is True
    assert all(check["passed"] for check in manifest["checks"].values())


def test_staging_launch_evidence_verifier_accepts_gcloud_storage_bucket_schema(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_gcloud_storage_evidence(tmp_path)

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is True
    assert result.errors == ()


def test_staging_launch_evidence_verifier_reports_media_permission_artifact(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    (tmp_path / "media-bucket.json").unlink()
    (tmp_path / "media-bucket-iam.json").unlink()
    _write_json(
        tmp_path / "media-bucket-error.json",
        {
            "passed": False,
            "error": "unable_to_describe_media_bucket",
            "required_permission": "storage.buckets.get",
            "detail": "Permission denied.",
        },
    )

    exit_code = verifier.main([str(tmp_path)])
    manifest = json.loads((tmp_path / "evidence-manifest.json").read_text(encoding="utf-8"))

    assert exit_code == 1
    assert manifest["passed"] is False
    assert manifest["checks"]["media_bucket"]["passed"] is False
    assert any("required_permission=storage.buckets.get" in error for error in manifest["errors"])


def test_staging_launch_evidence_verifier_reports_public_auth_failure(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    _write_json(
        tmp_path / "public-auth-readiness.json",
        {
            "passed": False,
            "errors": ["Firebase Auth authorizedDomains is missing: admin.staging.kresco.ma."],
            "expected_domains": ["staging.kresco.ma"],
        },
    )

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("Public auth readiness failed" in error for error in result.errors)
    assert any("did not check admin.staging.kresco.ma" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_public_routing_failure(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    _write_json(tmp_path / "subdomain-routing.status.json", {"exit_code": 1})
    (tmp_path / "subdomain-routing.stderr.txt").write_text(
        "error: app unauthenticated root returned HTTP 200; expected a redirect.",
        encoding="utf-8",
    )

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("Public subdomain routing smoke must pass" in error for error in result.errors)
    assert any("app unauthenticated root returned HTTP 200" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_public_api_release_mismatch(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    _write_json(
        tmp_path / "public-api-health.json",
        {
            "passed": False,
            "errors": ["public API release_sha was 'oldsha', expected 'abc1234'."],
            "api_url": "https://api.staging.kresco.ma",
            "ready_status": "ready",
            "expected_sha": "abc1234",
            "release_sha": "oldsha",
        },
    )
    _write_json(tmp_path / "public-api-health.status.json", {"exit_code": 1})
    (tmp_path / "public-api-health.stderr.txt").write_text(
        "error: public API release_sha was 'oldsha', expected 'abc1234'.",
        encoding="utf-8",
    )

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("Public API health smoke must pass" in error for error in result.errors)
    assert any("Public API health failed" in error for error in result.errors)
    assert any("release_sha must match expected_sha" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_firebase_hosting_failure(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    _write_json(
        tmp_path / "firebase-hosting-rewrites.json",
        {
            "passed": False,
            "checks": [
                {
                    "target": "staging-frontend",
                    "passed": False,
                    "errors": ["missing Firebase Hosting rewrite /api/** -> kresco-backend-staging."],
                },
            ],
        },
    )

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("Firebase Hosting rewrites must pass" in error for error in result.errors)
    assert any("did not check staging-api" in error for error in result.errors)
    assert any("missing Firebase Hosting rewrite /api/**" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_missing_hosting_domain(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    domains = json.loads((tmp_path / "firebase-hosting-domains.json").read_text(encoding="utf-8"))
    domains["entries"][0]["domains"].remove("admin.staging.kresco.ma")
    _write_json(tmp_path / "firebase-hosting-domains.json", domains)

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("did not include admin.staging.kresco.ma" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_missing_live_hosting_domain(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    domains = json.loads((tmp_path / "firebase-hosting-domains.json").read_text(encoding="utf-8"))
    domains["entries"][0]["live_domains"].remove("admin.staging.kresco.ma")
    _write_json(tmp_path / "firebase-hosting-domains.json", domains)

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("live domains did not include admin.staging.kresco.ma" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_missing_dns_record_plan_domain(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    dns_plan = json.loads((tmp_path / "firebase-hosting-dns-records.json").read_text(encoding="utf-8"))
    dns_plan["domains"] = [domain for domain in dns_plan["domains"] if domain["domain"] != "api.staging.kresco.ma"]
    _write_json(tmp_path / "firebase-hosting-dns-records.json", dns_plan)

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("DNS record export did not include api.staging.kresco.ma" in error for error in result.errors)


def test_staging_launch_evidence_verifier_reports_public_dns_failure(tmp_path):
    verifier = _load_evidence_verifier_module()
    _write_complete_evidence(tmp_path)
    _write_json(
        tmp_path / "firebase-hosting-public-dns.json",
        {
            "environment": "staging",
            "passed": False,
            "records": [
                {
                    "domain": "api.staging.kresco.ma",
                    "record_type": "CNAME",
                    "expected": "kresco-staging-api.web.app",
                    "actual": [],
                    "passed": False,
                    "errors": ["DNS query status was 3; expected 0."],
                },
            ],
        },
    )
    _write_json(tmp_path / "firebase-hosting-public-dns.status.json", {"exit_code": 1})

    result = verifier.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert any("Firebase Hosting public DNS check must pass" in error for error in result.errors)
    assert any("Public DNS failed for api.staging.kresco.ma CNAME" in error for error in result.errors)
