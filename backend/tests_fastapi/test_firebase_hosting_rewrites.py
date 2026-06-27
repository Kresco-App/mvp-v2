from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_firebase_hosting_rewrites.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_firebase_hosting_rewrites_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_firebase_hosting_rewrites_cover_staging_and_production():
    module = _load_module()

    for environment in ("staging", "production"):
        result = module.check_firebase_hosting_rewrites(
            environment=environment,
            firebase_json_path=REPO_ROOT / "firebase.json",
            firebaserc_path=REPO_ROOT / ".firebaserc",
        )

        assert result.passed is True
        assert all(check.errors == () for check in result.checks)
        assert len({check.name for check in result.checks}) == len(result.checks)
        assert {check.scope for check in result.checks} == {"target_mapping", "hosting_entry"}


def test_firebase_hosting_rewrites_reject_missing_api_target(tmp_path):
    module = _load_module()
    firebase_json = tmp_path / "firebase.json"
    firebaserc = tmp_path / ".firebaserc"
    firebase_json.write_text((REPO_ROOT / "firebase.json").read_text(encoding="utf-8"), encoding="utf-8")
    firebaserc.write_text(
        json.dumps(
            {
                "projects": {"staging": "kresco-staging"},
                "targets": {"kresco-staging": {"hosting": {"staging-frontend": ["kresco-staging"]}}},
            },
        ),
        encoding="utf-8",
    )

    result = module.check_firebase_hosting_rewrites(
        environment="staging",
        firebase_json_path=firebase_json,
        firebaserc_path=firebaserc,
    )

    assert result.passed is False
    assert ".firebaserc must map hosting target 'staging-api' to exactly one Firebase Hosting site." in result.checks[1].errors
