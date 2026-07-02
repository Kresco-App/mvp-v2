from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_public_auth_readiness.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_public_auth_readiness_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _runtime_secret() -> dict:
    origins = ",".join(
        [
            "https://staging.kresco.ma",
            "https://www.staging.kresco.ma",
            "https://app.staging.kresco.ma",
            "https://admin.staging.kresco.ma",
            "https://prof.staging.kresco.ma",
            "https://staff.staging.kresco.ma",
        ]
    )
    return {
        "FRONTEND_URL": "https://staging.kresco.ma",
        "AUTH_COOKIE_DOMAIN": "staging.kresco.ma",
        "CORS_ALLOWED_ORIGINS": origins,
        "CSRF_TRUSTED_ORIGINS": origins,
        "KRESCO_TRUSTED_HOSTS": "api.staging.kresco.ma",
        "NEXT_PUBLIC_FIREBASE_API_KEY": "fixture-public-api-key",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "kresco-staging",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "kresco-staging.firebaseapp.com",
        "NEXT_PUBLIC_FIREBASE_APP_ID": "1:123:web:abc",
    }


def _auth_config() -> dict:
    return {
        "authorizedDomains": [
            "localhost",
            "kresco-staging.firebaseapp.com",
            "staging.kresco.ma",
            "www.staging.kresco.ma",
            "app.staging.kresco.ma",
            "admin.staging.kresco.ma",
            "prof.staging.kresco.ma",
            "staff.staging.kresco.ma",
        ],
        "signIn": {"email": {"enabled": True}, "phoneNumber": {"enabled": True}},
        "googleProvider": {"name": "projects/kresco-staging/defaultSupportedIdpConfigs/google.com", "enabled": True},
    }


def test_public_auth_readiness_accepts_staging_domain_contract():
    module = _load_module()

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
        require_email_password=True,
        require_google_provider=True,
        require_phone_provider=True,
    )

    assert result.passed is True
    assert result.errors == ()
    assert result.expected_domains == (
        "staging.kresco.ma",
        "www.staging.kresco.ma",
        "app.staging.kresco.ma",
        "admin.staging.kresco.ma",
        "prof.staging.kresco.ma",
        "staff.staging.kresco.ma",
    )


def test_public_auth_readiness_can_check_runtime_secret_contract_only():
    module = _load_module()

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        {},
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
        require_firebase_auth_config=False,
    )

    assert result.passed is True
    assert result.errors == ()


def test_public_auth_readiness_rejects_workspace_host_as_frontend_apex():
    module = _load_module()

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        _auth_config(),
        frontend_apex_url="https://admin.staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert result.errors == ("frontend-apex-url must be the frontend apex, not a workspace or API subdomain.",)
    assert result.expected_domains == ()


def test_public_auth_readiness_reports_missing_firebase_domains():
    module = _load_module()
    auth_config = _auth_config()
    auth_config["authorizedDomains"] = ["staging.kresco.ma", "app.staging.kresco.ma"]

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        auth_config,
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
        require_email_password=True,
        require_google_provider=True,
        require_phone_provider=True,
    )

    assert result.passed is False
    assert any("Firebase Auth authorizedDomains is missing" in error for error in result.errors)
    assert any("admin.staging.kresco.ma" in error for error in result.errors)
    assert any("staff.staging.kresco.ma" in error for error in result.errors)


def test_public_auth_readiness_reports_runtime_secret_domain_mismatches():
    module = _load_module()
    runtime_secret = _runtime_secret()
    runtime_secret["FRONTEND_URL"] = "https://old-staging.example.com"
    runtime_secret["AUTH_COOKIE_DOMAIN"] = "old-staging.example.com"
    runtime_secret["CORS_ALLOWED_ORIGINS"] = "https://staging.kresco.ma"
    runtime_secret["KRESCO_TRUSTED_HOSTS"] = "old-api.example.com"

    result = module.evaluate_public_auth_readiness(
        runtime_secret,
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert "FRONTEND_URL must be 'https://staging.kresco.ma'" in "\n".join(result.errors)
    assert "AUTH_COOKIE_DOMAIN must be 'staging.kresco.ma'" in "\n".join(result.errors)
    assert any("CORS_ALLOWED_ORIGINS is missing" in error for error in result.errors)
    assert "KRESCO_TRUSTED_HOSTS must include 'api.staging.kresco.ma'." in result.errors


def test_public_auth_readiness_rejects_unexpected_runtime_origins():
    module = _load_module()
    runtime_secret = _runtime_secret()
    runtime_secret["CORS_ALLOWED_ORIGINS"] += ",https://evil.example.com"
    runtime_secret["CSRF_TRUSTED_ORIGINS"] += ",https://evil.example.com"

    result = module.evaluate_public_auth_readiness(
        runtime_secret,
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert "CORS_ALLOWED_ORIGINS has unexpected origins: https://evil.example.com." in result.errors
    assert "CSRF_TRUSTED_ORIGINS has unexpected origins: https://evil.example.com." in result.errors


def test_public_auth_readiness_reports_missing_frontend_firebase_config():
    module = _load_module()
    runtime_secret = _runtime_secret()
    for key in (
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        "NEXT_PUBLIC_FIREBASE_APP_ID",
    ):
        runtime_secret.pop(key)

    result = module.evaluate_public_auth_readiness(
        runtime_secret,
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert "NEXT_PUBLIC_FIREBASE_API_KEY must be present in the runtime secret used for frontend builds." in result.errors
    assert "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be present in the runtime secret used for frontend builds." in result.errors


def test_public_auth_readiness_rejects_literal_placeholder_frontend_firebase_config():
    module = _load_module()
    runtime_secret = _runtime_secret()
    runtime_secret["NEXT_PUBLIC_FIREBASE_API_KEY"] = "null"
    runtime_secret["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] = "undefined"
    runtime_secret["NEXT_PUBLIC_FIREBASE_APP_ID"] = "None"

    result = module.evaluate_public_auth_readiness(
        runtime_secret,
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert "NEXT_PUBLIC_FIREBASE_API_KEY must be present in the runtime secret used for frontend builds." in result.errors
    assert "NEXT_PUBLIC_FIREBASE_PROJECT_ID must be present in the runtime secret used for frontend builds." in result.errors
    assert "NEXT_PUBLIC_FIREBASE_APP_ID must be present in the runtime secret used for frontend builds." in result.errors


def test_public_auth_readiness_reports_unauthorized_frontend_auth_domain():
    module = _load_module()
    runtime_secret = _runtime_secret()
    runtime_secret["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] = "wrong-project.firebaseapp.com"

    result = module.evaluate_public_auth_readiness(
        runtime_secret,
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN 'wrong-project.firebaseapp.com' must be present in Firebase Auth authorizedDomains." in result.errors


def test_public_auth_readiness_reports_frontend_auth_domain_url_shape():
    module = _load_module()
    runtime_secret = _runtime_secret()
    runtime_secret["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] = "https://kresco-staging.firebaseapp.com"

    result = module.evaluate_public_auth_readiness(
        runtime_secret,
        _auth_config(),
        frontend_apex_url="https://staging.kresco.ma",
        api_host="api.staging.kresco.ma",
    )

    assert result.passed is False
    assert "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be a bare hostname, not a URL or host with a port." in result.errors


def test_public_auth_readiness_requires_email_password_when_requested():
    module = _load_module()
    auth_config = _auth_config()
    auth_config["signIn"] = {"email": {"enabled": False}}

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        auth_config,
        frontend_apex_url="https://staging.kresco.ma",
        require_email_password=True,
    )

    assert result.passed is False
    assert "Firebase Auth Email/Password sign-in must be enabled." in result.errors


def test_public_auth_readiness_requires_google_provider_when_requested():
    module = _load_module()
    auth_config = _auth_config()
    auth_config["googleProvider"] = {"name": "projects/kresco-staging/defaultSupportedIdpConfigs/google.com", "enabled": False}

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        auth_config,
        frontend_apex_url="https://staging.kresco.ma",
        require_google_provider=True,
    )

    assert result.passed is False
    assert "Firebase Auth Google provider must be enabled." in result.errors


def test_public_auth_readiness_requires_phone_provider_when_requested():
    module = _load_module()
    auth_config = _auth_config()
    auth_config["signIn"] = {"email": {"enabled": True}, "phoneNumber": {"enabled": False}}

    result = module.evaluate_public_auth_readiness(
        _runtime_secret(),
        auth_config,
        frontend_apex_url="https://staging.kresco.ma",
        require_phone_provider=True,
    )

    assert result.passed is False
    assert "Firebase Auth Phone provider must be enabled." in result.errors


def test_public_auth_readiness_cli_uses_fixture_files(tmp_path, capsys):
    module = _load_module()
    runtime_path = tmp_path / "runtime.json"
    auth_path = tmp_path / "auth.json"
    runtime_path.write_text(json.dumps(_runtime_secret()), encoding="utf-8")
    auth_path.write_text(json.dumps(_auth_config()), encoding="utf-8")

    exit_code = module.main(
        [
            "--frontend-apex-url",
            "https://staging.kresco.ma",
            "--api-host",
            "api.staging.kresco.ma",
            "--runtime-secret-json",
            str(runtime_path),
            "--auth-config-json",
            str(auth_path),
            "--require-email-password",
            "--require-google-provider",
            "--require-phone-provider",
            "--json",
        ]
    )

    captured = capsys.readouterr()
    payload, _ = json.JSONDecoder().raw_decode(captured.out)

    assert exit_code == 0
    assert payload["passed"] is True


def test_public_auth_readiness_cli_supports_runtime_secret_only(tmp_path, capsys):
    module = _load_module()
    runtime_path = tmp_path / "runtime.json"
    runtime_path.write_text(json.dumps(_runtime_secret()), encoding="utf-8")

    exit_code = module.main(
        [
            "--frontend-apex-url",
            "https://staging.kresco.ma",
            "--api-host",
            "api.staging.kresco.ma",
            "--runtime-secret-json",
            str(runtime_path),
            "--runtime-secret-only",
            "--json",
        ]
    )

    captured = capsys.readouterr()
    payload, _ = json.JSONDecoder().raw_decode(captured.out)

    assert exit_code == 0
    assert payload["passed"] is True


def test_public_auth_readiness_cli_rejects_authorized_domain_update_with_fixture_files(tmp_path, capsys):
    module = _load_module()
    runtime_path = tmp_path / "runtime.json"
    auth_path = tmp_path / "auth.json"
    runtime_path.write_text(json.dumps(_runtime_secret()), encoding="utf-8")
    auth_path.write_text(json.dumps(_auth_config()), encoding="utf-8")

    exit_code = module.main(
        [
            "--frontend-apex-url",
            "https://staging.kresco.ma",
            "--runtime-secret-json",
            str(runtime_path),
            "--auth-config-json",
            str(auth_path),
            "--ensure-authorized-domains",
            "--json",
        ]
    )

    captured = capsys.readouterr()
    payload, _ = json.JSONDecoder().raw_decode(captured.out)

    assert exit_code == 1
    assert payload["passed"] is False
    assert "ensure-authorized-domains cannot be used with auth-config-json." in payload["errors"]


def test_ensure_authorized_domains_does_not_patch_when_all_domains_exist(monkeypatch):
    module = _load_module()
    auth_config = _auth_config()
    required_domains = module.required_frontend_domains("https://staging.kresco.ma")

    def fail_if_called(*args, **kwargs):
        raise AssertionError("Firebase Auth update should not run when domains already exist")

    monkeypatch.setattr(module, "_run_command", fail_if_called)
    monkeypatch.setattr(module, "_fetch_identitytoolkit_json", fail_if_called)

    errors: list[str] = []
    result = module._ensure_authorized_domains(
        auth_config,
        required_domains,
        project_id="kresco-staging",
        timeout_seconds=5,
        errors=errors,
    )

    assert result is auth_config
    assert errors == []


def test_ensure_authorized_domains_patches_missing_domains_without_removing_existing(monkeypatch):
    module = _load_module()
    required_domains = module.required_frontend_domains("https://staging.kresco.ma")
    auth_config = {
        "authorizedDomains": [
            "localhost",
            "kresco-staging.firebaseapp.com",
            "staging.kresco.ma",
            "app.staging.kresco.ma",
        ],
        "signIn": {"email": {"enabled": True}},
    }
    calls: list[dict] = []

    def fake_run_command(command, errors, *, label):
        assert command == ["gcloud", "auth", "print-access-token", "--project", "kresco-staging"]
        assert label == "gcloud access token"
        return "token"

    def fake_fetch_identitytoolkit_json(
        url,
        *,
        token,
        quota_project_id,
        timeout_seconds,
        errors,
        label,
        method="GET",
        body=None,
    ):
        calls.append(
            {
                "url": url,
                "token": token,
                "quota_project_id": quota_project_id,
                "timeout_seconds": timeout_seconds,
                "label": label,
                "method": method,
                "body": body,
            }
        )
        return {
            "authorizedDomains": body["authorizedDomains"],
            "signIn": {"email": {"enabled": True}},
        }

    monkeypatch.setattr(module, "_run_command", fake_run_command)
    monkeypatch.setattr(module, "_fetch_identitytoolkit_json", fake_fetch_identitytoolkit_json)

    errors: list[str] = []
    result = module._ensure_authorized_domains(
        auth_config,
        required_domains,
        project_id="kresco-staging",
        timeout_seconds=9,
        errors=errors,
    )

    assert errors == []
    assert len(calls) == 1
    call = calls[0]
    assert call["method"] == "PATCH"
    assert call["quota_project_id"] == "kresco-staging"
    assert call["timeout_seconds"] == 9
    assert call["label"] == "Firebase Auth authorized domains update"
    assert call["url"].endswith("/projects/kresco-staging/config?updateMask=authorizedDomains")
    assert call["body"]["name"] == "projects/kresco-staging/config"
    assert call["body"]["authorizedDomains"][:2] == ["localhost", "kresco-staging.firebaseapp.com"]
    for domain in required_domains:
        assert domain in call["body"]["authorizedDomains"]
        assert domain in result["authorizedDomains"]
