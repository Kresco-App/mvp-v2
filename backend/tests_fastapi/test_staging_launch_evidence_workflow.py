from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "staging-launch-evidence.yml"
EXPECTED_ARTIFACTS = (
    "backend-cloud-run.json",
    "frontend-cloud-run.json",
    "cloud-sql.json",
    "artifact-registry.json",
    "runtime-smoke.json",
)


def _step_block(workflow: str, step_name: str) -> str:
    start = workflow.index(f"- name: {step_name}")
    end = workflow.find("\n      - name:", start + 1)
    return workflow[start:] if end == -1 else workflow[start:end]


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
    assert "urllib.request.urlopen" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "if-no-files-found: error" in workflow
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
