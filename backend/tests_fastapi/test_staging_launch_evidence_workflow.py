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
    "cloud-sql.json",
    "artifact-registry.json",
    "media-runtime-config.json",
    "media-bucket.json",
    "media-bucket-error.json",
    "media-bucket-iam.json",
    "media-bucket-iam-error.json",
    "runtime-smoke.json",
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


def test_staging_launch_evidence_workflow_runs_gcp_collectors_fail_closed():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "\n  workflow_dispatch:" in workflow
    assert "environment: staging" in workflow
    assert "set -x" not in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "gcloud run services describe \"$BACKEND_SERVICE\"" in workflow
    assert "gcloud sql instances describe \"$CLOUD_SQL_INSTANCE\"" in workflow
    assert "gcloud artifacts repositories describe kresco-containers" in workflow
    assert "gcloud storage buckets describe \"gs://$media_bucket\"" in workflow
    assert "gcloud storage buckets get-iam-policy \"gs://$media_bucket\"" in workflow
    assert ".MEDIA_GCS_BUCKET // .media_gcs_bucket // empty" in workflow
    assert "urllib.request.urlopen" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "if: always()" in workflow
    assert "if-no-files-found: error" in workflow
    assert "staging launch evidence collection did not finish" in workflow
    assert "python scripts/check_staging_launch_evidence.py \"$EVIDENCE_DIR\"" in workflow
    assert workflow.count("continue-on-error: true") >= 5
    assert "check_s3_media_posture.py" not in workflow
    assert "check_staging_ops_posture.py" not in workflow

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
    assert 'uniform_access.get("enabled") is not True' in media_block
    assert 'publicAccessPrevention") != "enforced"' in media_block
    assert 'bucket.get("lifecycle", {}).get("rule")' in media_block
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
