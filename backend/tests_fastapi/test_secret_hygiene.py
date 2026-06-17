from __future__ import annotations

import importlib.util
import subprocess
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


def _rotation_table(
    secret_hygiene,
    *,
    provider="provider",
    owner="security-owner",
    rotated_at="2026-06-05T00:00:00Z",
    revoked="yes",
    evidence="ticket-123",
):
    rows = "\n".join(
        (
            f"| `{record.secret_name}` | {provider} | {record.environment} | {owner} | "
            f"{rotated_at} | {revoked} | {evidence} |"
        )
        for record in secret_hygiene.REQUIRED_ROTATION_RECORDS
    )
    return f"""
        | Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
        | --- | --- | --- | --- | --- | --- | --- |
        {rows}
        """


def test_secret_hygiene_scanner_detects_without_printing_secret_values():
    secret_hygiene = _load_secret_hygiene_module()
    secret_value = "ghp_" + "1234567890abcdefghijklmnopqrstuvwx"

    findings = secret_hygiene.scan_text(
        REPO_ROOT / "example.env",
        f"GITHUB_TOKEN={secret_value}\n",
    )
    rendered = "\n".join(finding.format() for finding in findings)

    assert {finding.kind for finding in findings} == {"github-token", "literal-sensitive-env-value"}
    assert "GITHUB_TOKEN" in rendered
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
          VDOCIPHER_API_SECRET: __SET_IN_SECRET_MANAGER__
        """,
    )

    assert findings == []


def test_secret_hygiene_scanner_allows_ci_database_url_references():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_text(
        REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml",
        """
        env:
          CI_POSTGRES_DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/kresco_ci
        run: |
          DATABASE_URL="$CI_POSTGRES_DATABASE_URL" alembic upgrade head
        """,
    )

    assert findings == []


def test_secret_hygiene_scanner_flags_literal_database_urls_without_printing_values():
    secret_hygiene = _load_secret_hygiene_module()
    database_url = "postgresql://kresco:real-password@db-prod.internal:5432/kresco?sslmode=verify-full"

    findings = secret_hygiene.scan_text(
        REPO_ROOT / ".env.local",
        f"DATABASE_URL={database_url}\n",
    )
    rendered = "\n".join(finding.format() for finding in findings)

    assert [(finding.kind, finding.identifier) for finding in findings] == [
        ("literal-sensitive-env-value", "DATABASE_URL"),
    ]
    assert database_url not in rendered


def test_secret_hygiene_scanner_detects_private_key_blocks():
    secret_hygiene = _load_secret_hygiene_module()
    private_key_header = "-----BEGIN " + "PRIVATE KEY-----"

    findings = secret_hygiene.scan_text(
        REPO_ROOT / "docs" / "bad-key.md",
        f"{private_key_header}\nredacted\n-----END PRIVATE KEY-----\n",
    )

    assert len(findings) == 1
    assert findings[0].kind == "private-key"


def test_secret_hygiene_scanner_detects_oidc_jwt_tokens_without_printing_values():
    secret_hygiene = _load_secret_hygiene_module()
    token_value = (
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJpc3MiOiJodHRwczovL29pZGMuZXhhbXBsZSIsInN1YiI6InByb2plY3QifQ."
        "signature-segment-that-is-long-enough"
    )

    findings = secret_hygiene.scan_text(
        REPO_ROOT / "frontend" / ".env.inspect",
        f'VERCEL_OIDC_TOKEN="{token_value}"\n',
    )
    rendered = "\n".join(finding.format() for finding in findings)

    assert {finding.kind for finding in findings} == {"jwt-token", "literal-sensitive-env-value"}
    assert "VERCEL_OIDC_TOKEN" in rendered
    assert token_value not in rendered


def test_secret_hygiene_scanner_treats_token_env_names_as_sensitive():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_text(
        REPO_ROOT / ".env.local",
        "DEPLOY_TOKEN=plain-token-value-that-must-not-render\n",
    )
    rendered = "\n".join(finding.format() for finding in findings)

    assert [(finding.kind, finding.identifier) for finding in findings] == [
        ("literal-sensitive-env-value", "DEPLOY_TOKEN"),
    ]
    assert "plain-token-value-that-must-not-render" not in rendered


def test_secret_hygiene_scanner_allows_non_secret_token_metadata_names():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_text(
        REPO_ROOT / ".env.example",
        "\n".join([
            "ABLY_TOKEN_TTL_SECONDS=3600",
            "AUTH_TOKEN_VERSION=1",
            "RESET_TOKEN_EXPIRATION_MINUTES=30",
            "VERCEL_OIDC_TOKEN=<vercel-runtime-issued-oidc-token>",
            "DEPLOY_TOKEN=${{ secrets.DEPLOY_TOKEN }}",
            "STAGING_STUDENT_TOKENS_FILE=student-tokens.json",
        ]),
    )

    assert findings == []


def test_include_local_env_output_redacts_detected_oidc_jwt_tokens(tmp_path, capsys, monkeypatch):
    secret_hygiene = _load_secret_hygiene_module()
    token_value = (
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJpc3MiOiJodHRwczovL29pZGMuZXhhbXBsZSIsInN1YiI6InByb2plY3QifQ."
        "signature-segment-that-is-long-enough"
    )
    local_env = tmp_path / ".env.local"
    local_env.write_text(f"VERCEL_OIDC_TOKEN={token_value}\n", encoding="utf-8")

    monkeypatch.setattr(secret_hygiene, "tracked_paths", lambda: [])
    monkeypatch.setattr(secret_hygiene, "local_env_paths", lambda: [local_env])

    exit_code = secret_hygiene.main(["--include-local-env"])
    output = capsys.readouterr().out

    assert exit_code == 1
    assert "Scanned 1 ignored local env file(s)." in output
    assert "jwt-token" in output
    assert "literal-sensitive-env-value" in output
    assert "VERCEL_OIDC_TOKEN" in output
    assert token_value not in output


def test_local_env_paths_only_include_git_ignored_env_files(tmp_path):
    secret_hygiene = _load_secret_hygiene_module()
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (tmp_path / ".gitignore").write_text(".env\n.env.*\n!.env.example\n", encoding="utf-8")
    env_dir = tmp_path / "backend"
    env_dir.mkdir()
    ignored_env = env_dir / ".env"
    ignored_env.write_text("JWT_SECRET_KEY=local-live-value-that-is-realish\n", encoding="utf-8")
    (env_dir / ".env.example").write_text("JWT_SECRET_KEY=placeholder\n", encoding="utf-8")

    paths = secret_hygiene.local_env_paths(tmp_path)
    findings = secret_hygiene.scan_paths(paths)
    rendered = "\n".join(finding.format() for finding in findings)

    assert [path.relative_to(tmp_path).as_posix() for path in paths] == ["backend/.env"]
    assert {finding.kind for finding in findings} == {"literal-sensitive-env-value"}
    assert "JWT_SECRET_KEY" in rendered
    assert "local-live-value-that-is-realish" not in rendered


def test_rotation_checklist_detects_placeholders_and_missing_required_records():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        """
        | Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
        | --- | --- | --- | --- | --- | --- | --- |
        | `DATABASE_URL` | GitHub Environment / Google Cloud SQL | production | TBD | TBD | TBD | TBD |
        """,
    )

    assert any(finding.kind == "rotation-checklist-placeholder" for finding in findings)
    assert any(
        finding.kind == "rotation-checklist-missing-record" and finding.identifier == "JWT_SECRET_KEY [staging]"
        for finding in findings
    )


def test_rotation_checklist_accepts_completed_required_records():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        _rotation_table(secret_hygiene),
    )

    assert findings == []


def test_rotation_checklist_rejects_impossible_timestamps():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        _rotation_table(secret_hygiene, rotated_at="2026-99-99T99:99:99Z"),
    )

    assert any(finding.kind == "rotation-checklist-invalid-timestamp" for finding in findings)


def test_rotation_checklist_rejects_embedded_placeholder_language():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        _rotation_table(
            secret_hygiene,
            provider="TBD provider",
            owner="owner TBD",
            evidence="TBD ticket-123",
        ),
    )

    assert any(finding.kind == "rotation-checklist-placeholder" for finding in findings)


def test_rotation_checklist_ignores_unrelated_later_markdown_tables():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        _rotation_table(secret_hygiene)
        + """

        ## Sign-off

        | Team | Role | Date | Result | Owner | Notes | Link |
        | --- | --- | --- | --- | --- | --- | --- |
        | Platform | Reviewer | bad-date | no | TBD | note | none |
        """,
    )

    assert findings == []


def test_rotation_checklist_accepts_escaped_pipe_markdown_evidence_links():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        _rotation_table(secret_hygiene, evidence="[rotation \\| audit](https://example.invalid/run/123)"),
    )

    assert findings == []


def test_rotation_checklist_rejects_one_row_identifier_only_coverage():
    secret_hygiene = _load_secret_hygiene_module()
    rows = "\n".join(
        (
            f"| `{identifier}` | provider | production | security-owner | "
            f"2026-06-05T00:00:00Z | yes | ticket-123 |"
        )
        for identifier in secret_hygiene.REQUIRED_ROTATION_RECORD_IDENTIFIERS
    )

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        f"""
        | Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
        | --- | --- | --- | --- | --- | --- | --- |
        {rows}
        """,
    )

    assert any(
        finding.kind == "rotation-checklist-missing-record" and finding.identifier == "DATABASE_URL [staging]"
        for finding in findings
    )
    assert any(
        finding.kind == "rotation-checklist-missing-record"
        and finding.identifier == "GCP_WORKLOAD_IDENTITY_PROVIDER / GCP_DEPLOY_SERVICE_ACCOUNT [deploy]"
        for finding in findings
    )


def test_rotation_checklist_rejects_weak_or_cosmetic_evidence_values():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        """
        | Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
        | --- | --- | --- | --- | --- | --- | --- |
        | `DATABASE_URL` | provider | staging | pending | 2026-06-05 | no | done |
        """,
    )

    assert any(finding.kind == "rotation-checklist-placeholder" for finding in findings)
    assert any(finding.kind == "rotation-checklist-invalid-timestamp" for finding in findings)
    assert any(finding.kind == "rotation-checklist-revocation-missing" for finding in findings)
    assert any(finding.kind == "rotation-checklist-weak-evidence" for finding in findings)


def test_rotation_checklist_rejects_negative_revocation_and_unlinked_digit_notes():
    secret_hygiene = _load_secret_hygiene_module()
    rows = "\n".join(
        (
            f"| `{record.secret_name}` | provider | {record.environment} | security-owner | "
            "2026-06-05T00:00:00Z | not revoked | manual note 1 |"
        )
        for record in secret_hygiene.REQUIRED_ROTATION_RECORDS
    )

    findings = secret_hygiene.scan_rotation_checklist_text(
        REPO_ROOT / "docs" / "secrets-rotation-checklist.md",
        f"""
        | Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
        | --- | --- | --- | --- | --- | --- | --- |
        {rows}
        """,
    )

    assert any(finding.kind == "rotation-checklist-revocation-missing" for finding in findings)
    assert any(finding.kind == "rotation-checklist-weak-evidence" for finding in findings)


def test_checked_in_rotation_checklist_inventories_every_required_secret():
    secret_hygiene = _load_secret_hygiene_module()

    findings = secret_hygiene.scan_rotation_checklist()

    assert [
        finding.identifier
        for finding in findings
        if finding.kind == "rotation-checklist-missing-record"
    ] == []


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
