from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
VERIFIER_PATH = REPO_ROOT / "scripts" / "check_s3_media_posture.py"


def _load_verifier_module():
    spec = importlib.util.spec_from_file_location("check_s3_media_posture_for_tests", VERIFIER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeS3Client:
    source_name = "fake"

    def __init__(
        self,
        *,
        public_access_block=None,
        encryption=None,
        lifecycle=None,
        sample_key: str | None = "staging/profile/avatar.png",
        object_exists: bool = True,
        region: str = "eu-west-3",
    ) -> None:
        self.public_access_block = public_access_block or {
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True,
            }
        }
        self.encryption = encryption or {
            "ServerSideEncryptionConfiguration": {
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
                        "BucketKeyEnabled": False,
                    }
                ]
            }
        }
        self.lifecycle = lifecycle or {
            "Rules": [
                {
                    "ID": "staging-media-retention",
                    "Status": "Enabled",
                    "Filter": {"Prefix": "staging/"},
                    "Expiration": {"Days": 30},
                }
            ]
        }
        self.sample_key = sample_key
        self._object_exists = object_exists
        self.region = region
        self.seen_prefix = ""

    def get_public_access_block(self, bucket):
        del bucket
        return self.public_access_block

    def get_bucket_encryption(self, bucket):
        del bucket
        return self.encryption

    def get_bucket_lifecycle_configuration(self, bucket):
        del bucket
        return self.lifecycle

    def get_bucket_region(self, bucket):
        del bucket
        return self.region

    def find_object_key(self, bucket, prefix):
        del bucket
        self.seen_prefix = prefix
        return self.sample_key

    def object_exists(self, bucket, key):
        del bucket, key
        return self._object_exists


def _denied_probe(verifier, seen):
    def probe(bucket, key, region, timeout_seconds):
        seen["bucket"] = bucket
        seen["key"] = key
        seen["region"] = region
        seen["timeout_seconds"] = timeout_seconds
        return verifier.AnonymousReadProbeResult(
            denied=True,
            status_code=403,
            detail="anonymous ranged GET was denied.",
        )

    return probe


def test_s3_media_posture_verifier_accepts_private_encrypted_lifecycle_bucket():
    verifier = _load_verifier_module()
    client = FakeS3Client()
    seen = {}

    result = verifier.check_s3_media_posture(
        "kresco-secret-staging-media",
        prefix="staging",
        expected_retention_days=365,
        client=client,
        anonymous_probe=_denied_probe(verifier, seen),
    )

    assert result.passed is True
    assert result.errors == ()
    assert client.seen_prefix == "staging/"
    assert seen["key"] == "staging/profile/avatar.png"
    assert seen["region"] == "eu-west-3"
    assert {check.name: check.status for check in result.checks} == {
        "block_public_access": "ok",
        "bucket_encryption": "ok",
        "lifecycle": "ok",
        "anonymous_read_denial": "ok",
    }


def test_s3_media_posture_verifier_redacts_bucket_prefix_and_key_in_json():
    verifier = _load_verifier_module()

    result = verifier.check_s3_media_posture(
        "kresco-secret-staging-media",
        prefix="staging",
        expected_retention_days=365,
        anonymous_read_key="staging/profile/avatar.png",
        client=FakeS3Client(),
        anonymous_probe=_denied_probe(verifier, {}),
    )
    payload = json.dumps(result.to_dict(), sort_keys=True)

    assert "kresco-secret-staging-media" not in payload
    assert '"staging"' not in payload
    assert "staging/profile/avatar.png" not in payload
    assert '"bucket_ref": "sha256:' in payload
    assert '"object_key_ref": "sha256:' in payload


def test_s3_media_posture_verifier_fails_closed_when_block_public_access_is_incomplete():
    verifier = _load_verifier_module()
    client = FakeS3Client(
        public_access_block={
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": False,
                "RestrictPublicBuckets": True,
            }
        }
    )

    result = verifier.check_s3_media_posture(
        "kresco-secret-staging-media",
        prefix="staging",
        expected_retention_days=365,
        client=client,
        anonymous_probe=_denied_probe(verifier, {}),
    )

    assert result.passed is False
    assert any("block_public_access" in error and "BlockPublicPolicy" in error for error in result.errors)


def test_s3_media_posture_verifier_fails_closed_when_lifecycle_retention_is_too_long():
    verifier = _load_verifier_module()
    client = FakeS3Client(
        lifecycle={
            "Rules": [
                {
                    "ID": "staging-media-retention",
                    "Status": "Enabled",
                    "Filter": {"Prefix": "staging/"},
                    "Expiration": {"Days": 400},
                }
            ]
        }
    )

    result = verifier.check_s3_media_posture(
        "kresco-secret-staging-media",
        prefix="staging",
        expected_retention_days=365,
        client=client,
        anonymous_probe=_denied_probe(verifier, {}),
    )

    assert result.passed is False
    assert any("lifecycle" in error and "less strict" in error for error in result.errors)


def test_s3_media_posture_verifier_fails_closed_without_anonymous_probe_object():
    verifier = _load_verifier_module()

    result = verifier.check_s3_media_posture(
        "kresco-secret-staging-media",
        prefix="staging",
        expected_retention_days=365,
        client=FakeS3Client(sample_key=None),
        anonymous_probe=_denied_probe(verifier, {}),
    )

    assert result.passed is False
    assert any("anonymous_read_denial" in error and "no existing object" in error for error in result.errors)


def test_s3_media_posture_verifier_fails_when_anonymous_get_succeeds():
    verifier = _load_verifier_module()

    def public_probe(bucket, key, region, timeout_seconds):
        del bucket, key, region, timeout_seconds
        return verifier.AnonymousReadProbeResult(
            denied=False,
            status_code=206,
            detail="anonymous ranged GET succeeded; object appears publicly readable.",
        )

    result = verifier.check_s3_media_posture(
        "kresco-secret-staging-media",
        prefix="staging",
        expected_retention_days=365,
        client=FakeS3Client(),
        anonymous_probe=public_probe,
    )

    assert result.passed is False
    assert any("anonymous_read_denial" in error and "publicly readable" in error for error in result.errors)


def test_anonymous_s3_probe_uses_virtual_hosted_style_url():
    verifier = _load_verifier_module()

    assert verifier._anonymous_s3_object_url(
        "kresco-staging-media",
        "staging/profile/avatar one.png",
        "eu-west-3",
    ) == "https://kresco-staging-media.s3.eu-west-3.amazonaws.com/staging/profile/avatar%20one.png"
    assert verifier._anonymous_s3_object_url(
        "kresco-production-media",
        "production/avatar.png",
        "us-east-1",
    ) == "https://kresco-production-media.s3.amazonaws.com/production/avatar.png"


def test_s3_media_posture_verifier_main_json_uses_mocked_client(monkeypatch, capsys):
    verifier = _load_verifier_module()
    client = FakeS3Client()

    monkeypatch.setattr(verifier, "select_s3_client", lambda *, tool, region: client)
    monkeypatch.setattr(verifier, "anonymous_get_probe", _denied_probe(verifier, {}))

    exit_code = verifier.main(
        [
            "kresco-secret-staging-media",
            "--prefix",
            "staging",
            "--expected-retention-days",
            "365",
            "--json",
        ]
    )
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert output["passed"] is True
    assert output["evidence_source"] == "fake"
    assert "kresco-secret-staging-media" not in json.dumps(output)
