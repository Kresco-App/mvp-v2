from types import SimpleNamespace
import asyncio
import sys

import pytest

from app.services.image_uploads import (
    allowed_image_extension,
    image_matches_mime_type,
    normalize_image_mime_type,
)
from app.services import media_storage
from app.services.media_storage import LocalMediaStorage, S3MediaStorage, S3MockMediaStorage, media_url, presign_s3_reference


def test_image_mime_helpers_normalize_content_type_values():
    content_type = " Image/PNG; charset=binary "

    assert normalize_image_mime_type(content_type) == "image/png"
    assert allowed_image_extension(content_type) == ".png"
    assert image_matches_mime_type(b"\x89PNG\r\n\x1a\npayload", content_type) is True


def test_image_mime_helpers_reject_mismatched_signature():
    assert image_matches_mime_type(b"<script>alert(1)</script>", "image/png") is False


def test_local_media_storage_returns_relative_reference_and_url(tmp_path):
    storage = LocalMediaStorage(root=tmp_path / "media")

    stored = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))

    assert stored.key == "profile/1/avatar.png"
    assert stored.reference == "/media/profile/1/avatar.png"
    assert stored.url == "/media/profile/1/avatar.png"
    assert (tmp_path / "media" / "profile" / "1" / "avatar.png").read_bytes() == b"image-bytes"


def test_local_media_storage_rejects_traversal_keys(tmp_path):
    storage = LocalMediaStorage(root=tmp_path / "media")

    with pytest.raises(media_storage.MediaStorageError):
        asyncio.run(storage.put_object(
            key="../outside.png",
            content=b"image-bytes",
            content_type="image/png",
        ))

    assert not (tmp_path / "outside.png").exists()


def test_s3_mock_media_storage_returns_private_s3_reference_and_mock_presigned_url(tmp_path):
    settings = SimpleNamespace(
        media_s3_bucket="kresco-e2e-media",
        media_s3_region="us-east-1",
        media_s3_prefix="e2e",
        media_s3_mock_root=str(tmp_path / "s3"),
        media_s3_presign_ttl_seconds=300,
    )
    storage = S3MockMediaStorage(settings)

    stored = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))

    assert stored.key == "e2e/profile/1/avatar.png"
    assert stored.reference == "s3://kresco-e2e-media/e2e/profile/1/avatar.png"
    assert stored.url == "https://mock-s3.local/kresco-e2e-media/e2e/profile/1/avatar.png?expires=300&signature=mock"
    assert (tmp_path / "s3" / "kresco-e2e-media" / "e2e" / "profile" / "1" / "avatar.png").read_bytes() == b"image-bytes"


def test_s3_mock_media_storage_rejects_traversal_keys(tmp_path):
    settings = SimpleNamespace(
        media_s3_bucket="kresco-e2e-media",
        media_s3_region="us-east-1",
        media_s3_prefix="e2e",
        media_s3_mock_root=str(tmp_path / "s3"),
        media_s3_presign_ttl_seconds=300,
    )
    storage = S3MockMediaStorage(settings)

    with pytest.raises(media_storage.MediaStorageError):
        asyncio.run(storage.put_object(
            key="../outside.png",
            content=b"image-bytes",
            content_type="image/png",
        ))

    assert not (tmp_path / "s3" / "outside.png").exists()


def test_s3_media_storage_uses_private_server_side_encrypted_objects(monkeypatch):
    media_storage._s3_client.cache_clear()
    put_calls = []

    class FakeClient:
        def put_object(self, **kwargs):
            put_calls.append(kwargs)

        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None: FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(
        media_s3_bucket="kresco-private-media",
        media_s3_region="eu-north-1",
        media_s3_prefix="production",
        media_s3_endpoint_url="",
        media_s3_presign_ttl_seconds=300,
    )

    storage = S3MediaStorage(settings)
    stored = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))

    assert stored.reference == "s3://kresco-private-media/production/profile/1/avatar.png"
    assert stored.url == "https://signed.example.com/kresco-private-media/production/profile/1/avatar.png?ttl=300"
    assert put_calls == [{
        "Bucket": "kresco-private-media",
        "Key": "production/profile/1/avatar.png",
        "Body": b"image-bytes",
        "ContentType": "image/png",
        "ServerSideEncryption": "AES256",
    }]
    assert "ACL" not in put_calls[0]
    media_storage._s3_client.cache_clear()


def test_s3_presign_reuses_cached_boto3_client(monkeypatch):
    media_storage._s3_client.cache_clear()
    calls = []

    class FakeClient:
        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None: calls.append((service, region_name, endpoint_url)) or FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(media_s3_region="eu-north-1", media_s3_presign_ttl_seconds=300)

    first = media_url("s3://kresco-media/profile/1/avatar.png", settings)
    second = presign_s3_reference("s3://kresco-media/profile/1/banner.png", settings=settings)

    assert first == "https://signed.example.com/kresco-media/profile/1/avatar.png?ttl=300"
    assert second == "https://signed.example.com/kresco-media/profile/1/banner.png?ttl=300"
    assert calls == [("s3", "eu-north-1", None)]
    media_storage._s3_client.cache_clear()


def test_warm_media_storage_client_initializes_s3_client_once(monkeypatch):
    media_storage._s3_client.cache_clear()
    calls = []

    class FakeClient:
        pass

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None: calls.append((service, region_name, endpoint_url)) or FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(
        media_storage_backend="s3",
        media_s3_region="eu-north-1",
        media_s3_endpoint_url="",
    )

    asyncio.run(media_storage.warm_media_storage_client(settings))
    asyncio.run(media_storage.warm_media_storage_client(settings))

    assert calls == [("s3", "eu-north-1", None)]
    media_storage._s3_client.cache_clear()


def test_media_url_leaves_non_s3_references_unchanged():
    settings = SimpleNamespace(media_storage_backend="s3")

    assert media_url("/media/profile/1/avatar.png", settings) == "/media/profile/1/avatar.png"
    assert media_url("https://cdn.example/avatar.png", settings) == "https://cdn.example/avatar.png"
