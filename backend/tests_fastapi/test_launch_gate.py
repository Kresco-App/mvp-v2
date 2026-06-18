from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
LAUNCH_GATE_PATH = REPO_ROOT / "scripts" / "check_production_launch_gate.py"


def _load_launch_gate_module():
    spec = importlib.util.spec_from_file_location("check_production_launch_gate_for_tests", LAUNCH_GATE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _traceability_table(launch_gate, *, statuses: dict[str, str] | None = None, skip: set[str] | None = None) -> str:
    statuses = statuses or {}
    skip = skip or set()
    rows = "\n".join(
        f"| {gate_id} | finding | change | evidence | {statuses.get(gate_id, 'verified')} |"
        for gate_id in launch_gate.REQUIRED_TRACEABILITY_IDS
        if gate_id not in skip
    )
    return f"""
## Launch Gate

| ID | Finding | Required Change | Evidence Required | Status |
| --- | --- | --- | --- | --- |
{rows}

## Evidence Log
"""


def test_launch_gate_fails_current_repo_until_all_rows_and_score_are_ready():
    launch_gate = _load_launch_gate_module()
    result = launch_gate.check_paths(
        REPO_ROOT / "docs" / "production-remediation-traceability.md",
        REPO_ROOT / "PRODUCTION-SWITCH.md",
    )

    incomplete_ids = {row.gate_id for row in result.incomplete_rows}

    assert result.passed is False
    assert incomplete_ids == {"SEC-SECRETS-001"}
    assert any("below target" in error for error in result.errors)


def test_launch_gate_passes_only_when_traceability_and_score_pass():
    launch_gate = _load_launch_gate_module()
    switch = """
Current launch readiness: **9/10**.

Target for broad student production: **9/10**.
"""

    result = launch_gate.evaluate_launch_gate(_traceability_table(launch_gate), switch)

    assert result.passed is True
    assert result.errors == ()
    assert result.incomplete_rows == ()


def test_launch_gate_rejects_stale_score_even_if_rows_are_verified():
    launch_gate = _load_launch_gate_module()
    switch = """
Current launch readiness: **8.5/10**.

Target for broad student production: **9/10**.
"""

    result = launch_gate.evaluate_launch_gate(_traceability_table(launch_gate), switch)

    assert result.passed is False
    assert "Launch readiness score 8.5/10 is below target 9/10." in result.errors


def test_launch_gate_rejects_missing_duplicate_unknown_and_invalid_rows():
    launch_gate = _load_launch_gate_module()
    traceability = _traceability_table(
        launch_gate,
        statuses={"SEC-CSRF-001": "done"},
        skip={"SEC-SECRETS-001"},
    ).replace(
        "| SEC-CSP-001 | finding | change | evidence | verified |",
        (
            "| SEC-CSP-001 | finding | change | evidence | verified |\n"
            "| SEC-CSP-001 | finding | change | evidence | verified |\n"
            "| EXTRA-001 | finding | change | evidence | verified |"
        ),
    )
    switch = """
Current launch readiness: **9/10**.

Target for broad student production: **9/10**.
"""

    result = launch_gate.evaluate_launch_gate(traceability, switch)

    assert result.passed is False
    assert "Missing required traceability gate row(s): SEC-SECRETS-001." in result.errors
    assert "Duplicate traceability gate row(s): SEC-CSP-001." in result.errors
    assert "Unexpected traceability gate row(s): EXTRA-001." in result.errors
    assert "Invalid traceability status value(s): SEC-CSRF-001=done." in result.errors


def test_deploy_workflows_are_manual_only_and_gate_production():
    backend_workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")
    frontend_workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")

    for workflow in (backend_workflow, frontend_workflow):
        assert "\n  workflow_dispatch:" in workflow
        assert "\n  push:" not in workflow
        assert "python scripts/check_production_launch_gate.py" in workflow
        assert "python scripts/check_secret_hygiene.py --require-rotation-checklist" in workflow
        assert "google-github-actions/auth@v2" in workflow
        assert "workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}" in workflow
        assert "service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}" in workflow
        assert "--min-instances 0" in workflow
        assert "--max-instances 3" in workflow
        assert "confirm_production_dark_deploy" in workflow
        assert "enforce_production_launch_gate" in workflow
        assert "Dark production deploy only: this workflow does not route domains or user traffic." in workflow
        assert "inputs.enforce_production_launch_gate == true" in workflow

    assert "Deploy Backend to Cloud Run" in backend_workflow
    assert 'gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet' in backend_workflow
    assert 'docker build --pull -t "$image" backend' in backend_workflow
    assert 'docker push "$image"' in backend_workflow
    assert "gcloud run deploy \"$BACKEND_SERVICE\"" in backend_workflow
    assert "gcloud run jobs deploy \"$MIGRATION_JOB\"" in backend_workflow
    assert "gcloud run jobs execute \"$MIGRATION_JOB\"" in backend_workflow
    assert "--set-cloudsql-instances \"$cloud_sql_connection\"" in backend_workflow
    assert "--args scripts/run_alembic_from_settings.py" in backend_workflow
    assert 'ready_url = base_url + "/ready"' in backend_workflow
    assert "--activation-policy ALWAYS" in backend_workflow
    assert "--activation-policy NEVER" in backend_workflow
    assert "KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest" in backend_workflow

    assert "Deploy Frontend to Cloud Run" in frontend_workflow
    assert "actions/setup-node@v4" in frontend_workflow
    assert 'node-version: "22"' in frontend_workflow
    assert 'gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet' in frontend_workflow
    assert "docker build --pull" in frontend_workflow
    assert 'docker push "$image"' in frontend_workflow
    assert "gcloud run deploy \"$FRONTEND_SERVICE\"" in frontend_workflow
    assert "npm ci" in frontend_workflow
    assert "npm run validate:production-env" in frontend_workflow
    assert "npm run check:production-demo-surface -- --base-url \"$FRONTEND_URL\" --json" in frontend_workflow
    assert "NEXT_PUBLIC_FIREBASE_API_KEY" in frontend_workflow
    assert "NEXT_PUBLIC_REALTIME_PROVIDER=firestore" in frontend_workflow
    assert 'KRESCO_BACKEND_ORIGIN="$BACKEND_URL"' in frontend_workflow


def test_ci_and_deploy_workflows_report_test_coverage():
    backend_ci = (REPO_ROOT / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")
    frontend_ci = (REPO_ROOT / ".github" / "workflows" / "ci-frontend.yml").read_text(encoding="utf-8")
    e2e_db_prep = (REPO_ROOT / "backend" / "scripts" / "prepare_e2e_db.py").read_text(encoding="utf-8")
    backend_conftest = (REPO_ROOT / "backend" / "tests_fastapi" / "conftest.py").read_text(encoding="utf-8")

    assert "pytest-cov" in (REPO_ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8")
    assert "--cov=app --cov=scripts --cov-report=term-missing:skip-covered --cov-report=xml" in backend_ci
    for workflow_path in (
        ".github/workflows/ci-frontend.yml",
        ".github/workflows/deploy-frontend.yml",
        ".github/workflows/staging-provider-diagnostics.yml",
        ".github/workflows/staging-launch-evidence.yml",
        ".github/workflows/staging-topic-latency-evidence.yml",
        ".github/workflows/staging-live-chat-load-evidence.yml",
        ".github/workflows/staging-realtime-fanout-evidence.yml",
        ".github/workflows/staging-runbook-drill-evidence.yml",
        ".github/workflows/production-dark-evidence.yml",
    ):
        assert workflow_path in backend_ci
    assert '"codex/**"' not in backend_ci
    assert '"codex/**"' not in frontend_ci
    assert "timeout-minutes: 8" in frontend_ci
    assert "npx playwright install chromium" in frontend_ci
    assert "--with-deps chromium" not in frontend_ci
    assert "npm run test:coverage" in frontend_ci
    assert "image: postgres:16" in frontend_ci
    assert "KRESCO_E2E_DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/kresco_frontend_e2e" in frontend_ci
    assert "npm run test:e2e:integration" in frontend_ci
    assert "command.upgrade(config, \"head\")" in e2e_db_prep
    assert "DROP SCHEMA IF EXISTS public CASCADE" in e2e_db_prep
    assert "KRESCO_E2E_DATABASE_URL is required for CI integration tests." in e2e_db_prep
    assert "command.upgrade(config, \"head\")" in backend_conftest
    assert "KRESCO_TEST_DATABASE_URL is required for CI backend tests." in backend_conftest
    assert "KRESCO_TEST_DATABASE_URL: ${{ env.CI_POSTGRES_DATABASE_URL }}" in backend_ci
    assert "if _is_postgres_url(test_settings.database_url):" in backend_conftest


def test_launch_gate_docs_and_workflows_do_not_reference_retired_deployment_providers():
    tracked = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    ).stdout.splitlines()
    audited_roots = (
        ".github/workflows/",
        "docs/",
        "scripts/",
        "backend/tests_fastapi/test_staging",
        "backend/tests_fastapi/test_launch_gate.py",
        "backend/tests_fastapi/test_startup_security.py",
    )
    ignored_paths = {
        "docs/knowledge-base/content-authoring.md",
    }
    retired_terms = (
        "a" + "ws",
        "r" + "ds",
        "za" + "ppa",
        "ab" + "ly",
        "ver" + "cel",
        "s" + "3",
        "MEDIA_" + "S" + "3",
        "MEDIA-" + "S" + "3",
        "OPS-" + "R" + "DS",
        "OPS-" + "LAM" + "BDA",
    )
    stale_pattern = re.compile("|".join(rf"\b{re.escape(term)}\b" for term in retired_terms), re.IGNORECASE)
    offenders: list[str] = []
    for relative in tracked:
        if relative in ignored_paths or not relative.startswith(audited_roots):
            continue
        path = REPO_ROOT / relative
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            if stale_pattern.search(line):
                offenders.append(f"{relative}:{line_number}:{line.strip()}")

    assert offenders == []
