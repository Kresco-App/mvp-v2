from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = REPO_ROOT / "scripts" / "run_evidence_command.py"


def _load_runner_module():
    spec = importlib.util.spec_from_file_location("run_evidence_command_for_tests", RUNNER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_evidence_runner_captures_json_stdout_and_preserves_exit_code(tmp_path):
    runner = _load_runner_module()
    output = tmp_path / "evidence.json"

    exit_code = runner.main([
        "--name",
        "sample",
        "--output",
        str(output),
        "--",
        sys.executable,
        "-c",
        "import json; print(json.dumps({'passed': True, 'count': 3}))",
    ])

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert exit_code == 0
    assert payload["passed"] is True
    assert payload["stdout_json"] == {"passed": True, "count": 3}
    assert payload["stdout"] == ""


def test_evidence_runner_writes_redacted_failure_artifact(tmp_path, monkeypatch):
    runner = _load_runner_module()
    output = tmp_path / "evidence.json"
    secret_value = "secret-token-value-12345"
    monkeypatch.setenv("STAGING_AUTH_TOKEN", secret_value)

    exit_code = runner.main([
        "--name",
        "sample",
        "--output",
        str(output),
        "--",
        sys.executable,
        "-c",
        (
            "import sys; "
            f"print('stdout {secret_value}'); "
            f"print('stderr {secret_value}', file=sys.stderr); "
            "raise SystemExit(7)"
        ),
    ])

    payload_text = output.read_text(encoding="utf-8")
    payload = json.loads(payload_text)
    assert exit_code == 7
    assert payload["passed"] is False
    assert secret_value not in payload_text
    assert "[redacted]" in payload_text
    assert payload["stdout_json"] is None


def test_evidence_runner_require_json_rejects_noisy_success_stdout(tmp_path):
    runner = _load_runner_module()
    output = tmp_path / "evidence.json"

    exit_code = runner.main([
        "--name",
        "sample",
        "--output",
        str(output),
        "--require-json",
        "--",
        sys.executable,
        "-c",
        "print('noise'); print('{\"passed\": true}')",
    ])

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert exit_code == 1
    assert payload["exit_code"] == 0
    assert payload["passed"] is False
    assert payload["stdout_json"] is None
    assert payload["wrapper_errors"] == ["stdout must be a single valid JSON document."]
