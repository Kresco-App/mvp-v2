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
    GCSMediaStorage,
    GCSMockMediaStorage,
    LocalMediaStorage,
    async_media_url,
    media_url,
    sign_gcs_reference,
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


def test_gcs_mock_media_storage_returns_private_gs_reference_and_mock_signed_url(tmp_path):
    settings = SimpleNamespace(
        media_gcs_bucket="kresco-e2e-media",
        media_gcs_prefix="e2e",
        media_gcs_mock_root=str(tmp_path / "gcs"),
        media_gcs_signed_url_ttl_seconds=300,
    )
    storage = GCSMockMediaStorage(settings)

    stored = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))

    assert stored.key == "e2e/profile/1/avatar.png"
    assert stored.reference == "gs://kresco-e2e-media/e2e/profile/1/avatar.png"
    assert stored.url == "https://mock-gcs.local/kresco-e2e-media/e2e/profile/1/avatar.png?expires=300&signature=mock"
    assert (tmp_path / "gcs" / "kresco-e2e-media" / "e2e" / "profile" / "1" / "avatar.png").read_bytes() == b"image-bytes"


def test_gcs_mock_media_storage_deletes_only_owned_bucket_and_prefix(tmp_path):
    settings = SimpleNamespace(
        media_gcs_bucket="kresco-e2e-media",
        media_gcs_prefix="e2e",
        media_gcs_mock_root=str(tmp_path / "gcs"),
        media_gcs_signed_url_ttl_seconds=300,
    )
    storage = GCSMockMediaStorage(settings)
    stored = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))

    assert asyncio.run(storage.delete_reference("gs://other-bucket/e2e/profile/1/avatar.png")) is False
    assert asyncio.run(storage.delete_reference("gs://kresco-e2e-media/other/profile/1/avatar.png")) is False
    assert (tmp_path / "gcs" / "kresco-e2e-media" / "e2e" / "profile" / "1" / "avatar.png").exists()

    assert asyncio.run(storage.delete_reference(stored.reference)) is True
    assert not (tmp_path / "gcs" / "kresco-e2e-media" / "e2e" / "profile" / "1" / "avatar.png").exists()


def test_gcs_media_storage_uses_private_cloud_storage_objects(monkeypatch):
    media_storage._gcs_client.cache_clear()
    uploads = []
    deletes = []

    class FakeBlob:
        def __init__(self, key):
            self.key = key

        def upload_from_string(self, content, content_type):
            uploads.append((self.key, content, content_type))

        def generate_signed_url(self, *, expiration, method, version):
            return f"https://signed-gcs.example.com/{self.key}?ttl={int(expiration.total_seconds())}&method={method}&version={version}"

        def delete(self):
            deletes.append(self.key)

    class FakeBucket:
        def __init__(self, name):
            self.name = name

        def blob(self, key):
            return FakeBlob(key)

    class FakeClient:
        def bucket(self, name):
            return FakeBucket(name)

    fake_storage = SimpleNamespace(Client=lambda: FakeClient())
    monkeypatch.setitem(sys.modules, "google.cloud.storage", fake_storage)
    monkeypatch.setitem(sys.modules, "google.cloud", SimpleNamespace(storage=fake_storage))
    settings = SimpleNamespace(
        media_gcs_bucket="kresco-private-media",
        media_gcs_prefix="production",
        media_gcs_signed_url_ttl_seconds=300,
    )

    storage = GCSMediaStorage(settings)
    stored = asyncio.run(storage.put_object(
        key="profile/1/avatar.png",
        content=b"image-bytes",
        content_type="image/png",
    ))

    assert stored.reference == "gs://kresco-private-media/production/profile/1/avatar.png"
    assert stored.url == "https://signed-gcs.example.com/production/profile/1/avatar.png?ttl=300&method=GET&version=v4"
    assert uploads == [("production/profile/1/avatar.png", b"image-bytes", "image/png")]
    assert asyncio.run(storage.delete_reference("gs://other-bucket/production/profile/1/avatar.png")) is False
    assert asyncio.run(storage.delete_reference(stored.reference)) is True
    assert deletes == ["production/profile/1/avatar.png"]
    media_storage._gcs_client.cache_clear()


def test_media_url_signs_only_configured_gcs_scope(monkeypatch):
    signed = []

    def fake_sign(reference, *, settings):
        signed.append((reference, settings.media_gcs_signed_url_ttl_seconds))
        return f"signed:{reference}"

    monkeypatch.setattr(media_storage, "sign_gcs_reference", fake_sign)
    settings = SimpleNamespace(
        media_storage_backend="gcs",
        media_gcs_bucket="kresco-private-media",
        media_gcs_prefix="production",
        media_gcs_signed_url_ttl_seconds=300,
    )

    scoped = media_url("gs://kresco-private-media/production/profile/1/avatar.png", settings)
    wrong_bucket = media_url("gs://other-bucket/production/profile/1/avatar.png", settings)
    wrong_prefix = media_url("gs://kresco-private-media/staging/profile/1/avatar.png", settings)

    assert scoped == "signed:gs://kresco-private-media/production/profile/1/avatar.png"
    assert wrong_bucket == ""
    assert wrong_prefix == ""
    assert signed == [("gs://kresco-private-media/production/profile/1/avatar.png", 300)]


def test_sign_gcs_reference_reuses_cached_storage_client(monkeypatch):
    media_storage._gcs_client.cache_clear()
    calls = []

    class FakeBlob:
        def __init__(self, key):
            self.key = key

        def generate_signed_url(self, *, expiration, method, version):
            return f"https://signed-gcs.example.com/{self.key}?ttl={int(expiration.total_seconds())}"

    class FakeBucket:
        def __init__(self, name):
            self.name = name

        def blob(self, key):
            return FakeBlob(key)

    class FakeClient:
        def bucket(self, name):
            calls.append(name)
            return FakeBucket(name)

    fake_storage = SimpleNamespace(Client=lambda: FakeClient())
    monkeypatch.setitem(sys.modules, "google.cloud.storage", fake_storage)
    monkeypatch.setitem(sys.modules, "google.cloud", SimpleNamespace(storage=fake_storage))
    settings = SimpleNamespace(media_gcs_signed_url_ttl_seconds=123)

    result = sign_gcs_reference("gs://kresco-media/profile/1/avatar.png", settings=settings)

    assert result == "https://signed-gcs.example.com/profile/1/avatar.png?ttl=123"
    assert calls == ["kresco-media"]
    media_storage._gcs_client.cache_clear()


def test_sign_gcs_reference_clamps_oversized_runtime_ttl(monkeypatch):
    media_storage._gcs_client.cache_clear()

    class FakeBlob:
        def __init__(self, key):
            self.key = key

        def generate_signed_url(self, *, expiration, method, version):
            del method, version
            return f"https://signed-gcs.example.com/{self.key}?ttl={int(expiration.total_seconds())}"

    class FakeBucket:
        def blob(self, key):
            return FakeBlob(key)

    class FakeClient:
        def bucket(self, name):
            del name
            return FakeBucket()

    fake_storage = SimpleNamespace(Client=lambda: FakeClient())
    monkeypatch.setitem(sys.modules, "google.cloud.storage", fake_storage)
    monkeypatch.setitem(sys.modules, "google.cloud", SimpleNamespace(storage=fake_storage))
    settings = SimpleNamespace(media_gcs_signed_url_ttl_seconds=999999)

    result = sign_gcs_reference("gs://kresco-media/profile/1/avatar.png", settings=settings)

    assert result == "https://signed-gcs.example.com/profile/1/avatar.png?ttl=3600"
    media_storage._gcs_client.cache_clear()


def test_async_media_url_denies_unscoped_gcs_reference_before_signing(monkeypatch):
    calls = []

    async def fake_to_thread(func, *args, **kwargs):
        calls.append((func.__name__, args, kwargs))
        return func(*args, **kwargs)

    def fake_sign(reference, *, settings, client=None, expires_in=None):
        return f"signed:{reference}:{settings.media_gcs_signed_url_ttl_seconds}"

    monkeypatch.setattr(media_storage.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(media_storage, "sign_gcs_reference", fake_sign)
    settings = SimpleNamespace(
        media_storage_backend="gcs",
        media_gcs_bucket="kresco-private-media",
        media_gcs_prefix="production",
        media_gcs_signed_url_ttl_seconds=123,
    )

    result = asyncio.run(async_media_url("gs://other-bucket/production/profile/1/avatar.png", settings))

    assert result == ""
    assert calls == []


def test_async_media_url_offloads_gcs_signing_to_thread(monkeypatch):
    calls = []

    async def fake_to_thread(func, *args, **kwargs):
        calls.append((func.__name__, args, kwargs))
        return func(*args, **kwargs)

    def fake_sign(reference, *, settings, client=None, expires_in=None):
        return f"signed:{reference}:{settings.media_gcs_signed_url_ttl_seconds}"

    monkeypatch.setattr(media_storage.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(media_storage, "sign_gcs_reference", fake_sign)
    settings = SimpleNamespace(
        media_storage_backend="gcs",
        media_gcs_bucket="kresco-media",
        media_gcs_prefix="",
        media_gcs_signed_url_ttl_seconds=123,
    )

    result = asyncio.run(async_media_url("gs://kresco-media/profile/1/avatar.png", settings))

    assert result == "signed:gs://kresco-media/profile/1/avatar.png:123"
    assert calls == [("fake_sign", ("gs://kresco-media/profile/1/avatar.png",), {"settings": settings})]


def test_media_url_leaves_non_gcs_references_unchanged():
    settings = SimpleNamespace(media_storage_backend="gcs")

    assert media_url("/media/profile/1/avatar.png", settings) == "/media/profile/1/avatar.png"
    assert media_url("https://cdn.example/avatar.png", settings) == "https://cdn.example/avatar.png"
