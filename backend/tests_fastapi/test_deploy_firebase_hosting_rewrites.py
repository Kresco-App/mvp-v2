from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "deploy_firebase_hosting_rewrites.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("deploy_firebase_hosting_rewrites_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_rest_serving_config_converts_cli_source_to_rest_glob():
    module = _load_module()

    config = module._rest_serving_config(
        {
            "rewrites": [
                {
                    "source": "/api/**",
                    "run": {"serviceId": "kresco-backend-staging", "region": "europe-southwest1"},
                },
                {
                    "source": "**",
                    "run": {"serviceId": "kresco-frontend-staging", "region": "europe-southwest1"},
                },
            ],
        },
    )

    assert config == {
        "rewrites": [
            {
                "glob": "/api/**",
                "run": {"serviceId": "kresco-backend-staging", "region": "europe-southwest1"},
            },
            {
                "glob": "**",
                "run": {"serviceId": "kresco-frontend-staging", "region": "europe-southwest1"},
            },
        ],
    }


def test_deploy_uses_version_populate_finalize_release_sequence():
    module = _load_module()
    calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def fake_request(
        method: str,
        url: str,
        project_id: str,
        access_token: str,
        body: dict[str, Any] | None,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        calls.append((method, url, body))
        assert project_id == "kresco-staging"
        assert access_token == "token"
        assert timeout_seconds == 10.0
        if url.endswith("/versions"):
            return {"name": "sites/kresco-staging/versions/abc123"}
        if url.endswith("/releases?versionName=sites%2Fkresco-staging%2Fversions%2Fabc123"):
            return {"name": "sites/kresco-staging/releases/def456"}
        return {}

    result = module.deploy_firebase_hosting_rewrites(
        environment="staging",
        firebase_json_path=REPO_ROOT / "firebase.json",
        firebaserc_path=REPO_ROOT / ".firebaserc",
        access_token="token",
        timeout_seconds=10.0,
        message="test deploy",
        dry_run=False,
        request_json=fake_request,
    )

    assert result.passed is True
    assert [deployment.target for deployment in result.deployments] == ["staging-frontend", "staging-api"]
    assert calls[0][0] == "POST"
    assert calls[0][1].endswith("/sites/kresco-staging/versions")
    assert calls[0][2]["config"]["rewrites"][0]["glob"] == "/api/**"
    assert calls[1] == (
        "POST",
        "https://firebasehosting.googleapis.com/v1beta1/sites/kresco-staging/versions/abc123:populateFiles",
        {"files": {}},
    )
    assert calls[2] == (
        "PATCH",
        "https://firebasehosting.googleapis.com/v1beta1/sites/kresco-staging/versions/abc123?updateMask=status",
        {"status": "FINALIZED"},
    )
    assert calls[3] == (
        "POST",
        "https://firebasehosting.googleapis.com/v1beta1/sites/kresco-staging/releases?versionName=sites%2Fkresco-staging%2Fversions%2Fabc123",
        {"message": "test deploy"},
    )
