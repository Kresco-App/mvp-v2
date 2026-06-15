from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "staging-launch-evidence.yml"
EXPECTED_ARTIFACTS = (
    "secret-rotation-checklist.json",
    "staging-runtime.json",
    "s3-media-posture.json",
    "staging-ops-posture.json",
    "realtime-outbox.json",
    "realtime-fanout-50.json",
    "topic-latency.json",
)


def _step_block(workflow: str, step_name: str) -> str:
    start = workflow.index(f"- name: {step_name}")
    end = workflow.find("\n      - name:", start + 1)
    return workflow[start:] if end == -1 else workflow[start:end]


def test_staging_launch_evidence_workflow_runs_all_fail_closed_collectors():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "\n  workflow_dispatch:" in workflow
    assert "environment: staging" in workflow
    assert "set -x" not in workflow
    assert "aws-actions/configure-aws-credentials@v4" in workflow
    assert "aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}" in workflow
    assert "aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}" in workflow
    assert "python scripts/run_evidence_command.py" in workflow
    assert "python scripts/check_secret_hygiene.py --require-rotation-checklist" in workflow
    assert 'python scripts/check_staging_runtime.py "${BACKEND_READY_URL:-}" --include-provider-reachability --json' in workflow
    assert 'python scripts/check_s3_media_posture.py "${MEDIA_S3_BUCKET:-}"' in workflow
    assert "python scripts/check_staging_ops_posture.py --json" in workflow
    assert "python scripts/check_staging_realtime_fanout.py \"$backend_url\" \\" in workflow
    assert "--mode outbox" in workflow
    assert "--mode fanout-50" in workflow
    assert "--name realtime-fanout-50" in workflow
    assert "--output \"$EVIDENCE_DIR/realtime-fanout-50.json\"" in workflow
    assert "--expected-students \"$expected_students\"" in workflow
    assert "--require-provider-delivery" in workflow
    assert "python scripts/check_staging_topic_latency.py" in workflow
    assert "Validate staging launch evidence bundle" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "if-no-files-found: error" in workflow
    assert "${MEDIA_S3_BUCKET:?MEDIA_S3_BUCKET is required.}" not in workflow

    for artifact in EXPECTED_ARTIFACTS:
        assert f'$EVIDENCE_DIR/{artifact}' in workflow
        assert artifact in _step_block(workflow, "Validate staging launch evidence bundle")

    aws_credentials_index = workflow.index("aws-actions/configure-aws-credentials@v4")
    s3_posture_index = workflow.index("python scripts/check_s3_media_posture.py")
    ops_posture_index = workflow.index("python scripts/check_staging_ops_posture.py")
    assert aws_credentials_index < s3_posture_index < ops_posture_index


def test_staging_launch_evidence_workflow_uses_environment_scoped_inputs():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    for variable_name in (
        "BACKEND_READY_URL",
        "STAGING_BACKEND_URL",
        "MEDIA_S3_BUCKET",
        "MEDIA_S3_PREFIX",
        "STAGING_RDS_PROXY_NAME",
        "STAGING_LAMBDA_FUNCTION_NAME",
        "STAGING_KEEP_WARM_RULE_NAME",
        "STAGING_WORKER_SCHEDULE_RULE_NAME",
        "STAGING_LIVE_SESSION_ID",
        "STAGING_TOPIC_ID",
        "STAGING_TOPIC_SEARCH_QUERY",
    ):
        assert f"{variable_name}: ${{{{ vars.{variable_name} }}}}" in workflow

    for secret_name in (
        "REALTIME_OUTBOX_SECRET",
        "STAGING_PROFESSOR_TOKEN",
        "STAGING_STUDENT_TOKENS",
        "STAGING_AUTH_TOKEN",
        "ABLY_API_KEY",
        "STAGING_OPS_DRILL_EVIDENCE_JSON",
    ):
        assert f"${{{{ secrets.{secret_name} }}}}" in workflow


def test_staging_launch_evidence_json_collectors_require_valid_json():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    for step_name in (
        "Collect staging runtime diagnostics",
        "Collect S3 media posture evidence",
        "Collect staging ops posture evidence",
        "Collect realtime outbox evidence",
        "Collect realtime fanout provider evidence",
        "Collect topic latency evidence",
    ):
        block = _step_block(workflow, step_name)
        assert "--json" in block
        assert "--require-json" in block


def test_staging_launch_evidence_secrets_are_step_scoped():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    job_env_block = workflow.split("\n    steps:", maxsplit=1)[0]

    assert "${{ secrets." not in job_env_block
    assert "KRESCO_INTERNAL_SECRET: ${{ secrets.REALTIME_OUTBOX_SECRET }}" in _step_block(
        workflow, "Collect staging runtime diagnostics"
    )
    assert "KRESCO_INTERNAL_SECRET: ${{ secrets.REALTIME_OUTBOX_SECRET }}" in _step_block(
        workflow, "Collect realtime outbox evidence"
    )

    fanout_block = _step_block(workflow, "Collect realtime fanout provider evidence")
    assert "KRESCO_INTERNAL_SECRET: ${{ secrets.REALTIME_OUTBOX_SECRET }}" in fanout_block
    assert "STAGING_PROFESSOR_TOKEN: ${{ secrets.STAGING_PROFESSOR_TOKEN }}" in fanout_block
    assert "STAGING_STUDENT_TOKENS: ${{ secrets.STAGING_STUDENT_TOKENS }}" in fanout_block
    assert "ABLY_API_KEY: ${{ secrets.ABLY_API_KEY }}" in fanout_block

    assert "STAGING_AUTH_TOKEN: ${{ secrets.STAGING_AUTH_TOKEN }}" in _step_block(
        workflow, "Collect topic latency evidence"
    )
    assert "STAGING_OPS_DRILL_EVIDENCE_JSON: ${{ secrets.STAGING_OPS_DRILL_EVIDENCE_JSON }}" in _step_block(
        workflow, "Collect staging ops posture evidence"
    )
