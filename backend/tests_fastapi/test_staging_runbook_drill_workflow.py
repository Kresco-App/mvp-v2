from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "staging-runbook-drill-evidence.yml"


def _step_block(workflow: str, step_name: str) -> str:
    start = workflow.index(f"- name: {step_name}")
    end = workflow.find("\n      - name:", start + 1)
    return workflow[start:] if end == -1 else workflow[start:end]


def test_staging_runbook_drill_workflow_collects_gcp_evidence():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "\n  workflow_dispatch:" in workflow
    assert "environment: staging" in workflow
    assert "set -x" not in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "PROJECT_ID: kresco-staging" in workflow
    assert "BACKEND_SERVICE: kresco-backend-staging" in workflow
    assert "FRONTEND_SERVICE: kresco-frontend-staging" in workflow
    assert "CLOUD_SQL_INSTANCE: kresco-staging-postgres" in workflow
    assert "gcloud run services describe \"$BACKEND_SERVICE\"" in workflow
    assert "gcloud run revisions list" in workflow
    assert "gcloud sql backups list" in workflow
    assert "python scripts/check_staging_runtime.py" in workflow
    assert "--skip-outbox-drain" in workflow
    assert "python scripts/check_staging_runbook_drill_evidence.py \"$EVIDENCE_DIR\"" in workflow
    assert "uses: actions/upload-artifact@v4" in workflow
    assert "name: staging-runbook-drill" in workflow


def test_staging_runbook_drill_workflow_keeps_runtime_secret_out_of_job_env():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    job_env_block = workflow.split("\n    steps:", maxsplit=1)[0]
    diagnostics_step = _step_block(workflow, "Collect runtime diagnostics")

    assert "${{ secrets." not in job_env_block
    assert "secrets." not in diagnostics_step
    assert "gcloud secrets versions access latest --project \"$PROJECT_ID\" --secret kresco-runtime" in diagnostics_step
    assert ".REALTIME_OUTBOX_SECRET // .realtime_outbox_secret // empty" in diagnostics_step


def test_staging_runbook_drill_workflow_records_fail_closed_signoff_inputs():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    signoff_step = _step_block(workflow, "Record runbook drill sign-off")

    assert "restore_drill_artifact_url: ${{ inputs.restore_drill_artifact_url }}" in signoff_step
    assert "confirm_no_user_traffic: ${{ inputs.confirm_no_user_traffic }}" in signoff_step
    assert "STAGING_DARK_CONFIRMED" in signoff_step
    assert "docs/production-runbook.md" in signoff_step
    assert "docs/manual-operations.md" in signoff_step
