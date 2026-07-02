from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "promote-production-backend.yml"


def test_backend_promotion_workflow_copies_verified_digest_before_deploy():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "name: Promote Backend Image to Production" in workflow
    assert "\n  workflow_dispatch:" in workflow
    assert "\n  push:" not in workflow
    assert "group: production-backend-${{ github.repository }}" in workflow
    assert "environment: Production" in workflow
    assert "release_sha:" in workflow
    assert "staging_backend_image_digest:" in workflow
    assert "confirm_production_dark_deploy:" in workflow
    assert "enforce_production_launch_gate:" in workflow
    assert "Production backend promotion requires confirm_production_dark_deploy=true." in workflow
    assert "staging_backend_image_digest must be a sha256 digest" in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
    assert "actions/setup-go@v5" in workflow
    assert "go install github.com/google/go-containerregistry/cmd/crane@latest" in workflow
    assert "crane copy \"$source_ref\" \"$target_tag\"" in workflow
    assert "target_digest=\"$(crane digest \"$target_tag\")\"" in workflow
    assert "Copied backend digest mismatch" in workflow
    assert "production_backend_image=\"$target_repo@$target_digest\"" in workflow


def test_backend_promotion_reuses_backend_deploy_without_rebuilding():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "uses: ./.github/workflows/deploy-backend.yml" in workflow
    assert "environment: production" in workflow
    assert "run_migrations: ${{ inputs.run_migrations }}" in workflow
    assert "backend_image: ${{ needs.copy-backend-image.outputs.production_backend_image }}" in workflow
    assert "release_sha: ${{ inputs.release_sha }}" in workflow
    assert "confirm_production_dark_deploy: ${{ inputs.confirm_production_dark_deploy }}" in workflow
    assert "enforce_production_launch_gate: ${{ inputs.enforce_production_launch_gate }}" in workflow
    assert "secrets: inherit" in workflow
