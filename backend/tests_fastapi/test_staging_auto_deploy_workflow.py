from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_staging_auto_deploy_runs_ci_deploy_and_smoke_in_order():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-staging.yml").read_text(encoding="utf-8")

    assert "name: Deploy Staging" in workflow
    assert "\n  push:" in workflow
    assert "group: staging-cloud-sql-${{ github.repository }}" in workflow
    assert "cancel-in-progress: false" in workflow
    assert "      - master" in workflow
    assert "uses: ./.github/workflows/ci-backend.yml" in workflow
    assert "uses: ./.github/workflows/ci-frontend.yml" in workflow
    assert "uses: ./.github/workflows/deploy-backend.yml" in workflow
    assert "uses: ./.github/workflows/deploy-frontend.yml" in workflow
    assert "environment: staging" in workflow
    assert "confirm_production_dark_deploy: false" in workflow
    assert "enforce_production_launch_gate: false" in workflow
    assert "CLOUD_SQL_INSTANCE: kresco-staging-postgres" in workflow
    assert "--activation-policy ALWAYS" in workflow
    assert "--activation-policy NEVER" in workflow
    assert "trap cleanup EXIT" in workflow
    assert "python scripts/check_staging_deployment.py" in workflow
    assert "STAGING_AUTH_SMOKE_EMAIL" in workflow
    assert "STAGING_AUTH_SMOKE_PASSWORD" in workflow

    backend_ci = workflow.index("backend-ci:")
    frontend_ci = workflow.index("frontend-ci:")
    deploy_backend = workflow.index("deploy-backend:")
    deploy_frontend = workflow.index("deploy-frontend:")
    staging_smoke = workflow.index("staging-smoke:")
    assert backend_ci < deploy_backend < deploy_frontend < staging_smoke
    assert frontend_ci < deploy_backend


def test_reusable_deploy_workflows_export_release_outputs():
    backend = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")
    frontend = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")

    for workflow in (backend, frontend):
        assert "\n  workflow_call:" in workflow
        assert "image_digest" in workflow
        assert "latestReadyRevisionName" in workflow
        assert "short_sha" in workflow

    assert "backend_revision" in backend
    assert "backend_image_digest" in backend
    assert "frontend_revision" in frontend
    assert "frontend_image_digest" in frontend
