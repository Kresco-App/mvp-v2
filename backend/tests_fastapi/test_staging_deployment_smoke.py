from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SMOKE_PATH = REPO_ROOT / "scripts" / "check_staging_deployment.py"


def _load_module():
    scripts_dir = str(SMOKE_PATH.parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location("check_staging_deployment_for_tests", SMOKE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_staging_deployment_treats_placeholder_firebase_api_key_as_missing():
    smoke = _load_module()

    errors = smoke._check_optional_firebase_auth_smoke(
        "https://api.staging.kresco.ma",
        firebase_api_key="null",
        email="student@example.com",
        password="correct-horse-battery-staple",
        timeout_seconds=1,
    )

    assert errors == ["Firebase credential smoke needs FIREBASE_API_KEY."]


def test_staging_deployment_derives_public_api_url_from_apex():
    smoke = _load_module()
    errors: list[str] = []

    assert smoke._public_api_url_for_apex("https://staging.kresco.ma/path", errors) == "https://api.staging.kresco.ma"
    assert errors == []


def test_staging_deployment_labels_public_api_readiness_errors(monkeypatch):
    smoke = _load_module()

    def fake_fetch_json(_opener, url, *, method="GET", json_body=None, timeout_seconds):
        if url == "https://api.staging.kresco.ma/ready":
            return {"status": "ready"}
        if url == "https://api.staging.kresco.ma/health":
            return {"release_sha": "oldsha"}
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(smoke, "_fetch_json", fake_fetch_json)

    errors = smoke._check_backend_readiness(
        object(),
        "https://api.staging.kresco.ma",
        "abc12345",
        1,
        retries=1,
        delay_seconds=1,
        label="public api",
    )

    assert errors == ["public api release_sha was 'oldsha', expected 'abc12345'."]
