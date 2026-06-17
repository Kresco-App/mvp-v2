from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "staging-realtime-fanout-evidence.yml"


def test_staging_realtime_fanout_workflow_collects_firestore_delivery_artifact():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "\n  workflow_dispatch:" in workflow
    assert "environment: staging" in workflow
    assert "set -x" not in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "actions/setup-python@v5" in workflow
    assert "google-cloud-firestore==2.27.0" in workflow
    assert "gcloud secrets versions access latest" in workflow
    assert "--secret kresco-runtime" in workflow
    assert ".FIREBASE_PROJECT_ID // .firebase_project_id // empty" in workflow
    assert ".FIRESTORE_DATABASE // .firestore_database // \"(default)\"" in workflow
    assert "python scripts/run_evidence_command.py" in workflow
    assert "--name staging-realtime-fanout" in workflow
    assert "--output \"$EVIDENCE_DIR/firestore-delivery.json\"" in workflow
    assert "--require-json" in workflow
    assert "python scripts/check_firestore_realtime_delivery.py" in workflow
    assert "--project-id \"$firebase_project_id\"" in workflow
    assert "--database \"$firestore_database\"" in workflow
    assert "uses: actions/upload-artifact@v4" in workflow
    assert "if: always()" in workflow
    assert "name: staging-realtime-fanout" in workflow
    assert "if-no-files-found: error" in workflow


def test_staging_realtime_fanout_workflow_keeps_secrets_out_of_job_env():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    job_env_block = workflow.split("\n    steps:", maxsplit=1)[0]

    assert "secrets." not in job_env_block
    assert "firebase_project_id" not in job_env_block
    assert "firestore_database" not in job_env_block
