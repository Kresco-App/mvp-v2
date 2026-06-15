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
from app.services.media_storage import (
    LocalMediaStorage,
    S3MediaStorage,
    S3MockMediaStorage,
    async_media_url,
    media_url,
    presign_s3_reference,
)


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


def test_local_media_storage_deletes_owned_references_and_retains_external_references(tmp_path):
    storage = LocalMediaStorage(root=tmp_path / "media")
    owned = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))
    external = tmp_path / "external.png"
    external.write_bytes(b"keep")

    assert asyncio.run(storage.delete_reference("/uploads/profile/1/avatar.png")) is False
    assert asyncio.run(storage.delete_reference("https://cdn.example/avatar.png")) is False
    assert external.read_bytes() == b"keep"

    assert asyncio.run(storage.delete_reference(owned.reference)) is True
    assert not (tmp_path / "media" / "profile" / "1" / "avatar.png").exists()
    assert asyncio.run(storage.delete_reference(owned.reference)) is False


def test_local_media_storage_rejects_traversal_keys(tmp_path):
    storage = LocalMediaStorage(root=tmp_path / "media")

    for key in ("../outside.png", "..\\outside.png", "profile/1/../../outside.png"):
        with pytest.raises(media_storage.MediaStorageError):
            asyncio.run(storage.put_object(
                key=key,
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


def test_s3_mock_media_storage_deletes_only_owned_bucket_and_prefix(tmp_path):
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

    assert asyncio.run(storage.delete_reference("s3://other-bucket/e2e/profile/1/avatar.png")) is False
    assert asyncio.run(storage.delete_reference("s3://kresco-e2e-media/other/profile/1/avatar.png")) is False
    assert (tmp_path / "s3" / "kresco-e2e-media" / "e2e" / "profile" / "1" / "avatar.png").exists()

    assert asyncio.run(storage.delete_reference(stored.reference)) is True
    assert not (tmp_path / "s3" / "kresco-e2e-media" / "e2e" / "profile" / "1" / "avatar.png").exists()


def test_s3_mock_media_storage_rejects_traversal_keys(tmp_path):
    settings = SimpleNamespace(
        media_s3_bucket="kresco-e2e-media",
        media_s3_region="us-east-1",
        media_s3_prefix="e2e",
        media_s3_mock_root=str(tmp_path / "s3"),
        media_s3_presign_ttl_seconds=300,
    )
    storage = S3MockMediaStorage(settings)

    for key in ("../outside.png", "..\\outside.png", "profile/1/../../outside.png"):
        with pytest.raises(media_storage.MediaStorageError):
            asyncio.run(storage.put_object(
                key=key,
                content=b"image-bytes",
                content_type="image/png",
            ))

    assert not (tmp_path / "s3" / "outside.png").exists()


def test_s3_media_storage_uses_private_server_side_encrypted_objects(monkeypatch):
    media_storage._s3_client.cache_clear()
    put_calls = []
    delete_calls = []

    class FakeClient:
        def put_object(self, **kwargs):
            put_calls.append(kwargs)

        def delete_object(self, **kwargs):
            delete_calls.append(kwargs)

        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: FakeClient())
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
    assert asyncio.run(storage.delete_reference("s3://other-bucket/production/profile/1/avatar.png")) is False
    assert asyncio.run(storage.delete_reference(stored.reference)) is True
    assert delete_calls == [{
        "Bucket": "kresco-private-media",
        "Key": "production/profile/1/avatar.png",
    }]
    media_storage._s3_client.cache_clear()


def test_s3_media_storage_rejects_traversal_keys_before_upload(monkeypatch):
    media_storage._s3_client.cache_clear()
    put_calls = []

    class FakeClient:
        def put_object(self, **kwargs):
            put_calls.append(kwargs)

        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(
        media_s3_bucket="kresco-private-media",
        media_s3_region="eu-north-1",
        media_s3_prefix="production",
        media_s3_endpoint_url="",
        media_s3_presign_ttl_seconds=300,
    )
    storage = S3MediaStorage(settings)

    for key in ("../outside.png", "..\\outside.png", "profile/1/../../outside.png"):
        with pytest.raises(media_storage.MediaStorageError):
            asyncio.run(storage.put_object(
                key=key,
                content=b"image-bytes",
                content_type="image/png",
            ))

    assert put_calls == []
    media_storage._s3_client.cache_clear()


def test_s3_media_storage_retries_transient_put_failures(monkeypatch):
    media_storage._s3_client.cache_clear()
    put_calls = []

    class TransientS3Error(Exception):
        response = {"Error": {"Code": "SlowDown"}, "ResponseMetadata": {"HTTPStatusCode": 503}}

    class FakeClient:
        def put_object(self, **kwargs):
            put_calls.append(kwargs)
            if len(put_calls) == 1:
                raise TransientS3Error("temporary throttle")

        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    monkeypatch.setattr(media_storage, "S3_PUT_RETRY_BASE_SECONDS", 0)
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
    assert len(put_calls) == 2
    media_storage._s3_client.cache_clear()


def test_s3_presign_reuses_cached_boto3_client(monkeypatch):
    media_storage._s3_client.cache_clear()
    calls = []

    class FakeClient:
        def generate_presigned_url(self, operation, Params, ExpiresIn):
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: calls.append((service, region_name, endpoint_url)) or FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(
        media_storage_backend="s3",
        media_s3_bucket="kresco-media",
        media_s3_prefix="",
        media_s3_region="eu-north-1",
        media_s3_endpoint_url="",
        media_s3_presign_ttl_seconds=300,
    )

    first = media_url("s3://kresco-media/profile/1/avatar.png", settings)
    second = presign_s3_reference("s3://kresco-media/profile/1/banner.png", settings=settings)

    assert first == "https://signed.example.com/kresco-media/profile/1/avatar.png?ttl=300"
    assert second == "https://signed.example.com/kresco-media/profile/1/banner.png?ttl=300"
    assert calls == [("s3", "eu-north-1", None)]
    media_storage._s3_client.cache_clear()


def test_media_url_presigns_only_configured_s3_scope(monkeypatch):
    media_storage._s3_client.cache_clear()
    presigned_keys = []

    class FakeClient:
        def generate_presigned_url(self, operation, Params, ExpiresIn):
            presigned_keys.append((operation, Params["Bucket"], Params["Key"], ExpiresIn))
            return f"https://signed.example.com/{Params['Bucket']}/{Params['Key']}?ttl={ExpiresIn}"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(
        media_storage_backend="s3",
        media_s3_bucket="kresco-private-media",
        media_s3_region="eu-north-1",
        media_s3_prefix="production",
        media_s3_endpoint_url="",
        media_s3_presign_ttl_seconds=300,
    )

    scoped = media_url("s3://kresco-private-media/production/profile/1/avatar.png", settings)
    wrong_bucket = media_url("s3://other-bucket/production/profile/1/avatar.png", settings)
    wrong_prefix = media_url("s3://kresco-private-media/staging/profile/1/avatar.png", settings)

    assert scoped == "https://signed.example.com/kresco-private-media/production/profile/1/avatar.png?ttl=300"
    assert wrong_bucket == ""
    assert wrong_prefix == ""
    assert presigned_keys == [("get_object", "kresco-private-media", "production/profile/1/avatar.png", 300)]
    media_storage._s3_client.cache_clear()


def test_media_url_refuses_to_presign_s3_reference_without_configured_bucket(monkeypatch):
    calls = []

    class FakeClient:
        def generate_presigned_url(self, operation, Params, ExpiresIn):
            calls.append((operation, Params, ExpiresIn))
            return "https://signed.example.com/unscoped"

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: FakeClient())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    settings = SimpleNamespace(
        media_storage_backend="s3",
        media_s3_bucket="",
        media_s3_region="eu-north-1",
        media_s3_prefix="production",
        media_s3_endpoint_url="",
        media_s3_presign_ttl_seconds=300,
    )

    assert media_url("s3://unowned-bucket/production/profile/1/avatar.png", settings) == ""
    assert calls == []
    media_storage._s3_client.cache_clear()


def test_s3_mock_media_url_presigns_only_configured_scope():
    settings = SimpleNamespace(
        media_storage_backend="s3-mock",
        media_s3_bucket="kresco-e2e-media",
        media_s3_prefix="e2e",
        media_s3_presign_ttl_seconds=300,
    )

    scoped = media_url("s3://kresco-e2e-media/e2e/professor-chat/4/work.png", settings)
    wrong_bucket = media_url("s3://other-bucket/e2e/professor-chat/4/work.png", settings)
    wrong_prefix = media_url("s3://kresco-e2e-media/production/professor-chat/4/work.png", settings)

    assert scoped == "https://mock-s3.local/kresco-e2e-media/e2e/professor-chat/4/work.png?expires=300&signature=mock"
    assert wrong_bucket == ""
    assert wrong_prefix == ""


def test_async_media_url_denies_unscoped_s3_reference_before_presign(monkeypatch):
    calls = []

    async def fake_to_thread(func, *args, **kwargs):
        calls.append((func.__name__, args, kwargs))
        return func(*args, **kwargs)

    def fake_presign(reference, *, settings, client=None, expires_in=None):
        return f"signed:{reference}:{settings.media_s3_presign_ttl_seconds}"

    monkeypatch.setattr(media_storage.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(media_storage, "presign_s3_reference", fake_presign)
    settings = SimpleNamespace(
        media_storage_backend="s3",
        media_s3_bucket="kresco-private-media",
        media_s3_prefix="production",
        media_s3_presign_ttl_seconds=123,
    )

    result = asyncio.run(async_media_url("s3://other-bucket/production/profile/1/avatar.png", settings))

    assert result == ""
    assert calls == []


def test_async_media_url_offloads_s3_presign_to_thread(monkeypatch):
    calls = []

    async def fake_to_thread(func, *args, **kwargs):
        calls.append((func.__name__, args, kwargs))
        return func(*args, **kwargs)

    def fake_presign(reference, *, settings, client=None, expires_in=None):
        return f"signed:{reference}:{settings.media_s3_presign_ttl_seconds}"

    monkeypatch.setattr(media_storage.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(media_storage, "presign_s3_reference", fake_presign)
    settings = SimpleNamespace(
        media_storage_backend="s3",
        media_s3_bucket="kresco-media",
        media_s3_prefix="",
        media_s3_presign_ttl_seconds=123,
    )

    result = asyncio.run(async_media_url("s3://kresco-media/profile/1/avatar.png", settings))

    assert result == "signed:s3://kresco-media/profile/1/avatar.png:123"
    assert calls == [("fake_presign", ("s3://kresco-media/profile/1/avatar.png",), {"settings": settings})]


def test_mock_presign_uses_runtime_default_without_settings():
    url = media_storage.mock_presign_s3_reference("s3://kresco-media/profile/1/avatar.png")

    assert url == "https://mock-s3.local/kresco-media/profile/1/avatar.png?expires=3600&signature=mock"


def test_warm_media_storage_client_initializes_s3_client_once(monkeypatch):
    media_storage._s3_client.cache_clear()
    calls = []

    class FakeClient:
        pass

    fake_boto3 = SimpleNamespace(client=lambda service, region_name=None, endpoint_url=None, **kwargs: calls.append((service, region_name, endpoint_url)) or FakeClient())
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
