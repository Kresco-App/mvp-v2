from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "deploy-firebase-hosting.yml"


def test_firebase_hosting_workflow_is_manual_and_reusable():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "name: Deploy Firebase Hosting Edge" in workflow
    assert "\n  workflow_call:" in workflow
    assert "\n  workflow_dispatch:" in workflow
    assert "ensure_custom_domains:" in workflow
    assert "environment: ${{ inputs.environment == 'production' && 'Production' || 'staging' }}" in workflow
    assert "Production Firebase Hosting deploys require confirm_production_hosting_deploy=true." in workflow
    assert "google-github-actions/auth@v2" in workflow
    assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
    assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow


def test_firebase_hosting_workflow_targets_expected_projects_and_rewrites():
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "PROJECT_ID=kresco-staging" in workflow
    assert "FRONTEND_SITE=kresco-staging" in workflow
    assert "API_SITE=kresco-staging-api" in workflow
    assert "HOSTING_TARGETS=hosting:staging-frontend,hosting:staging-api" in workflow
    assert "PROJECT_ID=kresco-prod" in workflow
    assert "FRONTEND_SITE=kresco-prod" in workflow
    assert "API_SITE=kresco-prod-api" in workflow
    assert "HOSTING_TARGETS=hosting:production-frontend,hosting:production-api" in workflow
    assert "python scripts/check_firebase_hosting_rewrites.py --environment" in workflow
    assert "python scripts/check_firebase_hosting_domains.py --environment" in workflow
    assert "python scripts/ensure_firebase_hosting_sites.py --environment" in workflow
    assert "python scripts/ensure_firebase_hosting_domains.py --environment" in workflow
    assert "--ensure --json" in workflow
    assert "if: ${{ inputs.ensure_custom_domains }}" in workflow
    assert "firebase-tools@$FIREBASE_TOOLS_VERSION" in workflow
    assert "hosting:sites:create" not in workflow
    assert 'deploy \\' in workflow
    assert '--only "$HOSTING_TARGETS"' in workflow
    assert '--project "$PROJECT_ID"' in workflow
