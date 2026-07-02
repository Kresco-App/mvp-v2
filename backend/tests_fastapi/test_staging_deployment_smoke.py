from __future__ import annotations

import importlib.util
import json
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
        label="backend",
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


def test_staging_deployment_fails_when_frontend_cloud_run_firebase_env_is_empty(monkeypatch):
    smoke = _load_module()
    service = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "env": [
                                {"name": "NEXT_PUBLIC_FIREBASE_API_KEY", "value": ""},
                                {"name": "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "value": "kresco-staging"},
                                {"name": "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "value": ""},
                                {"name": "NEXT_PUBLIC_FIREBASE_APP_ID"},
                            ]
                        }
                    ]
                }
            }
        }
    }

    def fake_run_command(command, *, label):
        assert command[:4] == ["gcloud", "run", "services", "describe"]
        assert label == "frontend Cloud Run service"
        return json.dumps(service)

    monkeypatch.setattr(smoke, "_run_command", fake_run_command)

    errors, env = smoke._check_frontend_cloud_run_firebase_env(
        project_id="kresco-staging",
        region="europe-southwest1",
        frontend_service="kresco-frontend-staging",
    )

    assert errors == [
        "Cloud Run frontend env NEXT_PUBLIC_FIREBASE_API_KEY must be non-empty.",
        "Cloud Run frontend env NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be non-empty.",
        "Cloud Run frontend env NEXT_PUBLIC_FIREBASE_APP_ID must be non-empty.",
    ]
    assert env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] == "kresco-staging"


def test_staging_deployment_fails_when_frontend_bundle_is_missing_firebase_config(monkeypatch):
    smoke = _load_module()

    def fake_fetch(_opener, url, *, method="GET", json_body=None, timeout_seconds, max_body_bytes=65536):
        if url == "https://staging.kresco.ma":
            return smoke.HttpPayload(
                status=200,
                body=b'<html><script src="/_next/static/chunks/app.js"></script></html>',
            )
        if url == "https://staging.kresco.ma/_next/static/chunks/app.js":
            return smoke.HttpPayload(status=200, body=b"console.log('no firebase config')")
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(smoke, "_fetch", fake_fetch)

    errors = smoke._check_frontend_firebase_bundle(
        object(),
        "https://staging.kresco.ma",
        {
            "NEXT_PUBLIC_FIREBASE_API_KEY": "fixture-api-key",
            "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "kresco-staging",
            "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "kresco-staging.firebaseapp.com",
            "NEXT_PUBLIC_FIREBASE_APP_ID": "1:123:web:abc",
        },
        timeout_seconds=1,
    )

    assert errors == [
        "frontend JavaScript bundle is missing Firebase public config marker(s): "
        "NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID, "
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_APP_ID."
    ]


def test_staging_deployment_uses_secret_values_when_cloud_run_env_is_blank_for_bundle_check():
    smoke = _load_module()

    config = smoke._expected_frontend_firebase_config(
        {
            "NEXT_PUBLIC_FIREBASE_API_KEY": "",
            "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "",
            "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "",
        },
        firebase_project_id="kresco-staging",
        firebase_api_key="fixture-api-key",
    )

    assert config["NEXT_PUBLIC_FIREBASE_API_KEY"] == "fixture-api-key"
    assert config["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] == "kresco-staging"
    assert config["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] == "kresco-staging.firebaseapp.com"


def test_staging_deployment_accepts_frontend_bundle_with_firebase_config(monkeypatch):
    smoke = _load_module()

    def fake_fetch(_opener, url, *, method="GET", json_body=None, timeout_seconds, max_body_bytes=65536):
        if url == "https://staging.kresco.ma":
            return smoke.HttpPayload(
                status=200,
                body=b'<html><script src="/_next/static/chunks/app.js"></script></html>',
            )
        if url == "https://staging.kresco.ma/_next/static/chunks/app.js":
            return smoke.HttpPayload(
                status=200,
                body=(
                    b"fixture-api-key kresco-staging "
                    b"kresco-staging.firebaseapp.com 1:123:web:abc"
                ),
            )
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(smoke, "_fetch", fake_fetch)

    errors = smoke._check_frontend_firebase_bundle(
        object(),
        "https://staging.kresco.ma",
        {
            "NEXT_PUBLIC_FIREBASE_API_KEY": "fixture-api-key",
            "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "kresco-staging",
            "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "kresco-staging.firebaseapp.com",
            "NEXT_PUBLIC_FIREBASE_APP_ID": "1:123:web:abc",
        },
        timeout_seconds=1,
    )

    assert errors == []


def test_staging_deployment_role_auth_matrix_checks_configured_roles_once_per_role(monkeypatch):
    smoke = _load_module()
    sign_ins: list[tuple[str, str]] = []
    profile_checks: list[dict[str, object]] = []

    def fake_id_token(*, firebase_api_key, email, password, timeout_seconds, label):
        assert firebase_api_key == "fixture-api-key"
        assert password
        assert timeout_seconds == 3
        sign_ins.append((label, email))
        return f"id-token-for-{email}"

    def fake_profile_check(
        backend_url,
        id_token,
        *,
        timeout_seconds,
        label,
        expected_role=None,
        expected_tier=None,
        expected_staff=None,
    ):
        profile_checks.append({
            "backend_url": backend_url,
            "id_token": id_token,
            "timeout_seconds": timeout_seconds,
            "label": label,
            "expected_role": expected_role,
            "expected_tier": expected_tier,
            "expected_staff": expected_staff,
        })
        return []

    monkeypatch.setattr(smoke, "_firebase_password_id_token", fake_id_token)
    monkeypatch.setattr(smoke, "_check_firebase_session_profile", fake_profile_check)

    errors = smoke._check_optional_role_firebase_auth_smokes(
        [
            ("backend", "https://backend.example.com"),
            ("public api", "https://api.staging.kresco.ma"),
        ],
        firebase_api_key="fixture-api-key",
        timeout_seconds=3,
        environ={
            "STAGING_AUTH_BASIC_EMAIL": "basic@example.com",
            "STAGING_AUTH_BASIC_PASSWORD": "basic-password",
            "STAGING_AUTH_ADMIN_EMAIL": "admin@example.com",
            "STAGING_AUTH_ADMIN_PASSWORD": "admin-password",
        },
    )

    assert errors == []
    assert sign_ins == [
        ("basic role", "basic@example.com"),
        ("admin role", "admin@example.com"),
    ]
    assert profile_checks == [
        {
            "backend_url": "https://backend.example.com",
            "id_token": "id-token-for-basic@example.com",
            "timeout_seconds": 3,
            "label": "backend basic role",
            "expected_role": "student",
            "expected_tier": "basic",
            "expected_staff": False,
        },
        {
            "backend_url": "https://api.staging.kresco.ma",
            "id_token": "id-token-for-basic@example.com",
            "timeout_seconds": 3,
            "label": "public api basic role",
            "expected_role": "student",
            "expected_tier": "basic",
            "expected_staff": False,
        },
        {
            "backend_url": "https://backend.example.com",
            "id_token": "id-token-for-admin@example.com",
            "timeout_seconds": 3,
            "label": "backend admin role",
            "expected_role": "admin",
            "expected_tier": None,
            "expected_staff": True,
        },
        {
            "backend_url": "https://api.staging.kresco.ma",
            "id_token": "id-token-for-admin@example.com",
            "timeout_seconds": 3,
            "label": "public api admin role",
            "expected_role": "admin",
            "expected_tier": None,
            "expected_staff": True,
        },
    ]


def test_staging_deployment_role_auth_matrix_reports_partial_secret_pair():
    smoke = _load_module()

    errors = smoke._check_optional_role_firebase_auth_smokes(
        [("backend", "https://backend.example.com")],
        firebase_api_key="fixture-api-key",
        timeout_seconds=3,
        environ={
            "STAGING_AUTH_STAFF_EMAIL": "staff@example.com",
        },
    )

    assert errors == [
        "staff role auth smoke needs both STAGING_AUTH_STAFF_EMAIL and STAGING_AUTH_STAFF_PASSWORD."
    ]


def test_staging_deployment_profile_expectations_report_role_tier_and_staff_mismatch():
    smoke = _load_module()

    errors = smoke._profile_expectation_errors(
        {"role": "student", "tier": "basic", "is_staff": False},
        label="public api admin role",
        expected_role="admin",
        expected_tier="vip",
        expected_staff=True,
    )

    assert errors == [
        "public api admin role profile role was 'student', expected 'admin'.",
        "public api admin role profile tier was 'basic', expected 'vip'.",
        "public api admin role profile is_staff was False, expected True.",
    ]
