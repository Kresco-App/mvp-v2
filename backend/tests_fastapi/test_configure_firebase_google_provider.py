from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "configure_firebase_google_provider.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("configure_firebase_google_provider_for_tests", SCRIPT_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_configure_google_provider_creates_missing_google_provider(monkeypatch):
    module = _load_module()
    calls = []

    def fake_fetch(url, *, access_token, timeout_seconds, method="GET", body=None):
        calls.append(
            {
                "url": url,
                "method": method,
                "body": body,
                "access_token": access_token,
                "timeout_seconds": timeout_seconds,
            }
        )
        if method == "GET":
            raise module.HttpJsonError(404, "missing")
        assert method == "POST"
        assert url.endswith("/projects/kresco-prod/defaultSupportedIdpConfigs?idpId=google.com")
        assert body["enabled"] is True
        assert body["clientId"] == "google-client.apps.googleusercontent.com"
        assert body["clientSecret"] == "super-secret"
        return {"enabled": True}

    monkeypatch.setattr(module, "_fetch_json", fake_fetch)

    result = module.configure_google_provider(
        project_id="kresco-prod",
        client_id="google-client.apps.googleusercontent.com",
        client_secret="super-secret",
        access_token="access-token",
    )

    assert result.to_dict() == {
        "project_id": "kresco-prod",
        "provider_id": "google.com",
        "action": "created",
        "enabled": True,
        "client_id_suffix": "rcontent.com",
    }
    assert [call["method"] for call in calls] == ["GET", "POST"]
    assert all(call["access_token"] == "access-token" for call in calls)


def test_configure_google_provider_updates_existing_google_provider(monkeypatch):
    module = _load_module()
    calls = []

    def fake_fetch(url, *, access_token, timeout_seconds, method="GET", body=None):
        calls.append({"url": url, "method": method, "body": body})
        if method == "GET":
            return {"enabled": False}
        assert method == "PATCH"
        assert url.endswith(
            "/projects/kresco-prod/defaultSupportedIdpConfigs/google.com?updateMask=enabled,clientId,clientSecret"
        )
        assert body["enabled"] is True
        assert body["clientSecret"] == "new-secret"
        return {"enabled": True}

    monkeypatch.setattr(module, "_fetch_json", fake_fetch)

    result = module.configure_google_provider(
        project_id="kresco-prod",
        client_id="new-client.apps.googleusercontent.com",
        client_secret="new-secret",
        access_token="access-token",
    )

    assert result.action == "updated"
    assert result.enabled is True
    assert [call["method"] for call in calls] == ["GET", "PATCH"]


def test_cli_reads_credentials_from_env_and_does_not_print_secret(monkeypatch, capsys):
    module = _load_module()

    monkeypatch.setenv("FIREBASE_GOOGLE_CLIENT_ID", "env-client.apps.googleusercontent.com")
    monkeypatch.setenv("FIREBASE_GOOGLE_CLIENT_SECRET", "env-secret")
    monkeypatch.setattr(module, "_gcloud_access_token", lambda **_: "access-token")
    monkeypatch.setattr(
        module,
        "configure_google_provider",
        lambda **_: module.GoogleProviderResult(
            project_id="kresco-prod",
            provider_id="google.com",
            action="created",
            enabled=True,
            client_id_suffix="tent.com",
        ),
    )

    exit_code = module.main(["--project-id", "kresco-prod", "--json"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "env-secret" not in captured.out
    assert "env-secret" not in captured.err
    assert '"enabled": true' in captured.out
