from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "staging-live-chat-load-evidence.yml"


def test_staging_live_chat_load_workflow_collects_redacted_artifact():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "\n  workflow_dispatch:" in workflow
    assert "environment: staging" in workflow
    assert "set -x" not in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "gcloud run services describe \"$BACKEND_SERVICE\"" in workflow
    assert "--format='value(status.url)'" in workflow
    assert "python scripts/run_evidence_command.py" in workflow
    assert "--name staging-live-chat-load" in workflow
    assert "--output \"$EVIDENCE_DIR/live-chat-load.json\"" in workflow
    assert "--require-json" in workflow
    assert "python scripts/check_staging_live_chat_load.py" in workflow
    assert "--backend-url \"$backend_url\"" in workflow
    assert "--auth-token \"$staging_live_chat_auth_token\"" in workflow
    assert "--live-session-id \"$staging_live_session_id\"" in workflow
    assert "--conversation-id \"$staging_chat_conversation_id\"" in workflow
    assert "secrets.STAGING_LIVE_CHAT_AUTH_TOKEN" in workflow
    assert "vars.STAGING_LIVE_SESSION_ID" in workflow
    assert "vars.STAGING_CHAT_CONVERSATION_ID" in workflow
    assert "uses: actions/upload-artifact@v4" in workflow
    assert "if: always()" in workflow
    assert "name: staging-live-chat-load" in workflow
    assert "if-no-files-found: error" in workflow


def test_staging_live_chat_load_workflow_keeps_secret_out_of_job_env():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    job_env_block = workflow.split("\n    steps:", maxsplit=1)[0]

    assert "secrets.STAGING_LIVE_CHAT_AUTH_TOKEN" not in job_env_block
    assert "staging_live_chat_auth_token" not in job_env_block
