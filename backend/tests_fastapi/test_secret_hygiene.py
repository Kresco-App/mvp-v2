from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SECRET_HYGIENE_PATH = REPO_ROOT / "scripts" / "check_secret_hygiene.py"


def _load_secret_hygiene_module():
    spec = importlib.util.spec_from_file_location("check_secret_hygiene_for_tests", SECRET_HYGIENE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_secret_hygiene_scanner_detects_without_printing_secret_values():
    secret_hygiene = _load_secret_hygiene_module()
    secret_value = "sk" + "_live_" + "1234567890abcdefghijklmnop"

    findings = secret_hygiene.scan_text(
        REPO_ROOT / "example.env",
        f"STRIPE_SK={secret_value}\n",
    )
    rendered = "\n".join(finding.format() for finding in findings)

    assert {finding.kind for finding in findings} == {"stripe-live-secret", "literal-sensitive-env-value"}
    assert "STRIPE_SK" in rendered
    assert secret_value not in rendered


def test_secret_hygiene_scanner_allows_placeholders_and_ci_secret_references():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_text(
        REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml",
        """
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          JWT_SECRET_KEY: test-secret-key-for-ci-32-bytes-minimum
          POSTGRES_PASSWORD: postgres
          VDOCIPHER_API_SECRET: __SET_IN_AWS_SECRETS__
        """,
    )

    assert findings == []


def test_secret_hygiene_scanner_detects_private_key_blocks():
    secret_hygiene = _load_secret_hygiene_module()
    private_key_header = "-----BEGIN " + "PRIVATE KEY-----"

    findings = secret_hygiene.scan_text(
        REPO_ROOT / "docs" / "bad-key.md",
        f"{private_key_header}\nredacted\n-----END PRIVATE KEY-----\n",
    )

    assert len(findings) == 1
    assert findings[0].kind == "private-key"


def test_secret_hygiene_scanner_passes_current_tracked_files():
    secret_hygiene = _load_secret_hygiene_module()

    assert secret_hygiene.scan_paths(secret_hygiene.tracked_paths()) == []


def test_ci_and_deploy_workflows_run_secret_hygiene_check():
    workflow_paths = [
        REPO_ROOT / ".github" / "workflows" / "ci-backend.yml",
        REPO_ROOT / ".github" / "workflows" / "ci-frontend.yml",
        REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml",
        REPO_ROOT / ".github" / "workflows" / "deploy-frontend.yml",
    ]

    for path in workflow_paths:
        workflow = path.read_text(encoding="utf-8")
        assert "python scripts/check_secret_hygiene.py" in workflow
