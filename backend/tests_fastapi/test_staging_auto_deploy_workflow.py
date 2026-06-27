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
    assert "uses: ./.github/workflows/deploy-firebase-hosting.yml" in workflow
    assert "environment: staging" in workflow
    assert "confirm_production_dark_deploy: false" in workflow
    assert "enforce_production_launch_gate: false" in workflow
    assert "hsts_include_subdomains: false" in workflow
    assert "confirm_production_hosting_deploy: false" in workflow
    assert "ensure_custom_domains: true" in workflow
    assert "CLOUD_SQL_INSTANCE: kresco-staging-postgres" in workflow
    assert "--activation-policy ALWAYS" in workflow
    assert "--activation-policy NEVER" in workflow
    assert "trap cleanup EXIT" in workflow
    assert "python scripts/check_staging_deployment.py" in workflow
    assert "python scripts/check_public_auth_readiness.py" in workflow
    assert "normalize_secret_value()" in workflow
    assert "FIREBASE_PROJECT_ID=${firebase_project_id:-$PROJECT_ID}" in workflow
    assert "--runtime-secret-name kresco-runtime" in workflow
    assert "--frontend-apex-url \"$STAGING_FRONTEND_APEX_URL\"" in workflow
    assert "--api-host api.staging.kresco.ma" in workflow
    assert "--ensure-authorized-domains" in workflow
    assert "--require-email-password" in workflow
    assert "--require-google-provider" in workflow
    assert "STAGING_FRONTEND_APEX_URL: https://staging.kresco.ma" in workflow
    assert "STAGING_PUBLIC_API_URL: https://api.staging.kresco.ma" in workflow
    assert '--public-api-url "$STAGING_PUBLIC_API_URL"' in workflow
    assert '--subdomain-apex-url "$STAGING_FRONTEND_APEX_URL"' in workflow
    assert "STAGING_AUTH_SMOKE_EMAIL" in workflow
    assert "STAGING_AUTH_SMOKE_PASSWORD" in workflow

    backend_ci = workflow.index("backend-ci:")
    frontend_ci = workflow.index("frontend-ci:")
    deploy_backend = workflow.index("deploy-backend:")
    deploy_frontend = workflow.index("deploy-frontend:")
    deploy_hosting = workflow.index("deploy-hosting:")
    staging_smoke = workflow.index("staging-smoke:")
    auth_readiness = workflow.index("python scripts/check_public_auth_readiness.py")
    cloud_sql_start = workflow.index("--activation-policy ALWAYS")
    assert backend_ci < deploy_backend < deploy_frontend < staging_smoke
    assert frontend_ci < deploy_backend
    assert deploy_frontend < deploy_hosting < staging_smoke
    assert auth_readiness < cloud_sql_start


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
    assert "backend_service_url" in backend
    assert "frontend_revision" in frontend
    assert "frontend_image_digest" in frontend


def test_frontend_deploy_verifies_the_post_deploy_cloud_run_url():
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")

    resolve_block = workflow.split("- name: Resolve Firebase build config", 1)[1].split("- name: Install frontend dependencies", 1)[0]
    validate_block = workflow.split("- name: Validate production-shaped frontend env", 1)[1].split("- name: Build frontend image", 1)[0]
    verify_block = workflow.split("- name: Verify frontend surface", 1)[1].split("- name: Scan for production demo surface", 1)[0]
    scan_block = workflow.split("- name: Scan for production demo surface", 1)[1]

    assert 'backend_url="$(gcloud run services describe "$BACKEND_SERVICE"' not in resolve_block
    assert "FRONTEND_BACKEND_ORIGIN=https://api.staging.kresco.ma" in workflow
    assert "FRONTEND_BACKEND_ORIGIN=https://api.kresco.ma" in workflow
    assert 'gcloud run services describe "$FRONTEND_SERVICE"' not in resolve_block
    assert 'echo "FRONTEND_URL=' not in resolve_block
    assert 'firebase_api_key="$(jq -er \'.NEXT_PUBLIC_FIREBASE_API_KEY // .FIREBASE_WEB_API_KEY\'' in resolve_block
    assert 'firebase_project_id="$(jq -er \'.NEXT_PUBLIC_FIREBASE_PROJECT_ID // .FIREBASE_PROJECT_ID // .firebase_project_id\'' in resolve_block
    assert 'firebase_auth_domain="$(jq -er \'.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN // .FIREBASE_AUTH_DOMAIN // .firebase_auth_domain\'' in resolve_block
    assert 'firebase_app_id="$(jq -er \'.NEXT_PUBLIC_FIREBASE_APP_ID // .FIREBASE_APP_ID // .firebase_app_id\'' in resolve_block
    assert 'firestore_database="$(jq -er \'.NEXT_PUBLIC_FIRESTORE_DATABASE // .FIRESTORE_DATABASE // .firestore_database // "(default)"\'' in resolve_block
    assert 'echo "::add-mask::$firebase_api_key"' in resolve_block
    assert 'echo "NEXT_PUBLIC_FIREBASE_API_KEY=$firebase_api_key"' in resolve_block
    assert 'echo "NEXT_PUBLIC_FIREBASE_API_KEY=$(jq' not in resolve_block

    assert 'KRESCO_BACKEND_ORIGIN="$FRONTEND_BACKEND_ORIGIN"' in validate_block
    assert 'NEXT_PUBLIC_SITE_URL="$FRONTEND_PUBLIC_SITE_URL"' in validate_block
    assert 'NEXT_PUBLIC_AUTH_COOKIE_DOMAIN="$FRONTEND_AUTH_COOKIE_DOMAIN"' in validate_block
    assert 'NEXT_PUBLIC_RELEASE_SHA="$SHORT_SHA"' in validate_block
    assert "${{ env.BACKEND_URL }}" not in validate_block
    assert "$BACKEND_URL" not in validate_block
    assert "${{ env.FRONTEND_PUBLIC_SITE_URL }}" not in validate_block

    assert 'url="$(gcloud run services describe "$FRONTEND_SERVICE"' in verify_block
    assert 'export FRONTEND_URL="$url"' in verify_block
    assert 'url = os.environ["FRONTEND_URL"]' in verify_block
    assert 'echo "FRONTEND_URL=$url" >> "$GITHUB_ENV"' in verify_block
    assert 'echo "frontend_url=$url" >> "$GITHUB_OUTPUT"' in verify_block

    assert 'npm run check:production-demo-surface -- --base-url "$FRONTEND_URL" --json' in scan_block
    assert "FRONTEND_URL: ${{ env.FRONTEND_URL }}" not in scan_block
