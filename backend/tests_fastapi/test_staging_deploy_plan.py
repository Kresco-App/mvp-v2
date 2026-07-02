from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PLAN_PATH = REPO_ROOT / "scripts" / "plan_staging_deploy.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("plan_staging_deploy_for_tests", PLAN_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_manual_dispatch_deploys_everything():
    planner = _load_module()

    plan = planner.plan_staging_deploy("workflow_dispatch", [])

    assert plan == planner.StagingDeployPlan(
        deploy_backend=True,
        deploy_frontend=True,
        deploy_hosting=True,
        reason="manual-dispatch",
    )


def test_backend_change_deploys_only_backend_before_smoke():
    planner = _load_module()

    plan = planner.plan_staging_deploy("push", ["backend/app/main.py"])

    assert plan.deploy_backend is True
    assert plan.deploy_frontend is False
    assert plan.deploy_hosting is False
    assert plan.reason == "backend"


def test_frontend_change_deploys_only_frontend_before_smoke():
    planner = _load_module()

    plan = planner.plan_staging_deploy("push", ["frontend/app/page.tsx"])

    assert plan.deploy_backend is False
    assert plan.deploy_frontend is True
    assert plan.deploy_hosting is False
    assert plan.reason == "frontend"


def test_hosting_config_change_deploys_only_hosting_before_smoke():
    planner = _load_module()

    plan = planner.plan_staging_deploy("push", ["firebase.json", ".firebaserc", "firebase-hosting-public/index.html"])

    assert plan.deploy_backend is False
    assert plan.deploy_frontend is False
    assert plan.deploy_hosting is True
    assert plan.reason == "hosting"


def test_workflow_or_infra_change_deploys_everything_conservatively():
    planner = _load_module()

    plan = planner.plan_staging_deploy("push", [".github/workflows/deploy-staging.yml", "infra/terraform/main.tf"])

    assert plan.deploy_backend is True
    assert plan.deploy_frontend is True
    assert plan.deploy_hosting is True
    assert plan.reason == "workflow-or-infra"


def test_scripts_change_runs_smoke_without_rebuilding_services():
    planner = _load_module()

    plan = planner.plan_staging_deploy("push", ["scripts/check_staging_deployment.py"])

    assert plan.deploy_backend is False
    assert plan.deploy_frontend is False
    assert plan.deploy_hosting is False
    assert plan.reason == "scripts-smoke-only"


def test_empty_changed_path_list_deploys_everything_as_fallback():
    planner = _load_module()

    plan = planner.plan_staging_deploy("push", [])

    assert plan.deploy_backend is True
    assert plan.deploy_frontend is True
    assert plan.deploy_hosting is True
    assert plan.reason == "no-changed-paths-fallback"
