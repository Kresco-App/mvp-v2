from __future__ import annotations

import importlib.util
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


def test_launch_gate_fails_current_repo_until_all_rows_and_score_are_ready():
    launch_gate = _load_launch_gate_module()
    result = launch_gate.check_paths(
        REPO_ROOT / "docs" / "production-remediation-traceability.md",
        REPO_ROOT / "PRODUCTION-SWITCH.md",
    )

    incomplete_ids = {row.gate_id for row in result.incomplete_rows}

    assert result.passed is False
    assert "SEC-CSP-STYLE-001" in incomplete_ids
    assert "SEC-SECRETS-001" in incomplete_ids
    assert any("below target" in error for error in result.errors)


def test_launch_gate_passes_only_when_traceability_and_score_pass():
    launch_gate = _load_launch_gate_module()
    traceability = """
## Launch Gate

| ID | Finding | Required Change | Evidence Required | Status |
| --- | --- | --- | --- | --- |
| SEC-ONE | finding | change | evidence | verified |

## Evidence Log
"""
    switch = """
Current non-Stripe launch readiness: **9/10**.

Target for broad student production: **9/10**.
"""

    result = launch_gate.evaluate_launch_gate(traceability, switch)

    assert result.passed is True
    assert result.errors == ()
    assert result.incomplete_rows == ()


def test_launch_gate_rejects_stale_score_even_if_rows_are_verified():
    launch_gate = _load_launch_gate_module()
    traceability = """
| ID | Finding | Required Change | Evidence Required | Status |
| --- | --- | --- | --- | --- |
| SEC-ONE | finding | change | evidence | verified |

## Evidence Log
"""
    switch = """
Current non-Stripe launch readiness: **8.5/10**.

Target for broad student production: **9/10**.
"""

    result = launch_gate.evaluate_launch_gate(traceability, switch)

    assert result.passed is False
    assert "Launch readiness score 8.5/10 is below target 9/10." in result.errors


def test_deploy_workflows_are_manual_only_and_gate_production():
    backend_workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")
    frontend_workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")

    for workflow in (backend_workflow, frontend_workflow):
        assert "\n  workflow_dispatch:" in workflow
        assert "\n  push:" not in workflow
        assert "python scripts/check_production_launch_gate.py" in workflow

    assert "if: ${{ env.ZAPPA_STAGE == 'production' }}" in backend_workflow
    assert "environment: ${{ inputs.stage }}" in backend_workflow
    assert "ZAPPA_STAGE: ${{ inputs.stage }}" in backend_workflow
    assert "KRESCO_RELEASE_SHA: ${{ github.sha }}" in backend_workflow
    assert "confirm_database_migration" in backend_workflow
    assert "Require production database migration confirmation" in backend_workflow
    assert "Capture production database snapshot before migration" in backend_workflow
    assert "aws rds create-db-cluster-snapshot" in backend_workflow
    assert "aws rds create-db-snapshot" in backend_workflow
    migration_index = backend_workflow.index("- name: Run Alembic migrations on target database")
    deploy_index = backend_workflow.index("- name: Deploy to Lambda")
    assert migration_index < deploy_index
    assert 'zappa invoke "$ZAPPA_STAGE" app.scheduled.run_alembic_migrations_event' not in backend_workflow
    assert "Require production CloudWatch alarms" in backend_workflow
    assert "CLOUDWATCH_ALARM_NAMES: ${{ vars.CLOUDWATCH_ALARM_NAMES }}" in backend_workflow
    assert "aws cloudwatch describe-alarms" in backend_workflow

    assert "if: ${{ env.DEPLOY_ENVIRONMENT == 'production' }}" in frontend_workflow
    assert "environment: ${{ inputs.environment }}" in frontend_workflow
    assert "NEXT_PUBLIC_RELEASE_SHA: ${{ github.sha }}" in frontend_workflow
    assert "vercel deploy --prebuilt --prod" in frontend_workflow
    assert "vercel deploy --prebuilt --token" in frontend_workflow


def test_ci_and_deploy_workflows_report_test_coverage():
    backend_ci = (REPO_ROOT / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")
    backend_deploy = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")
    frontend_ci = (REPO_ROOT / ".github" / "workflows" / "ci-frontend.yml").read_text(encoding="utf-8")
    frontend_deploy = (REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml").read_text(encoding="utf-8")
    e2e_db_prep = (REPO_ROOT / "backend" / "scripts" / "prepare_e2e_db.py").read_text(encoding="utf-8")

    assert "pytest-cov" in (REPO_ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8")
    assert "--cov=app --cov=scripts --cov-report=term-missing:skip-covered --cov-report=xml" in backend_ci
    assert "--cov=app --cov=scripts --cov-report=term-missing:skip-covered --cov-report=xml" in backend_deploy
    assert "npm run test:coverage" in frontend_ci
    assert "npm run test:coverage" in frontend_deploy
    for workflow in (frontend_ci, frontend_deploy):
        assert "image: postgres:16" in workflow
        assert "KRESCO_E2E_DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/kresco_frontend_e2e" in workflow
        assert "npm run test:e2e:integration" in workflow
    assert "command.upgrade(config, \"head\")" in e2e_db_prep
    assert "DROP SCHEMA IF EXISTS public CASCADE" in e2e_db_prep
    assert "KRESCO_E2E_DATABASE_URL is required for CI integration tests." in e2e_db_prep
