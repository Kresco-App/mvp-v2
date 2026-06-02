import inspect
from types import SimpleNamespace

from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user
from app.services.auth import AUTH_COOKIE_NAME
from app.database import get_session_factory
from app.models.users import User
import app.routers.users as users_router
from app.services import user_profile


def test_profile_mutations_stay_out_of_router():
    update_source = inspect.getsource(users_router.update_profile)
    upload_source = inspect.getsource(users_router.upload_profile_media)
    service_source = inspect.getsource(user_profile)

    assert "update_profile_state(" in update_source
    assert "upload_profile_media_state(" in upload_source
    assert "await db.commit()" not in update_source + upload_source
    assert "file.read(" not in upload_source
    assert "image_matches_mime_type(" not in upload_source
    assert "Profile media quota exceeded" not in upload_source
    assert "async def update_profile_state" in service_source
    assert "async def upload_profile_media_state" in service_source
    assert "Profile media quota exceeded" in service_source
    assert "profile_media_key(" in service_source


def _install_cookie_session(app_client, test_settings, token: str, user_id: int, *, with_csrf: bool) -> str:
    app_client.cookies.set(AUTH_COOKIE_NAME, token)
    if not with_csrf:
        app_client.cookies.set(CSRF_COOKIE_NAME, "")
        return ""

    csrf_token = csrf_token_for_user(SimpleNamespace(id=user_id, auth_token_version=0), test_settings)
    app_client.cookies.set(CSRF_COOKIE_NAME, csrf_token)
    return csrf_token


def test_patch_profile_updates_identity_fields(app_client, auth_token):
    token, _ = auth_token(email="profile-patch@example.com")

    response = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "full_name": "Updated Student",
            "niveau": "2bac",
            "filiere": "Sciences Physiques",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Updated Student"
    assert body["avatar_url"] == ""
    assert body["banner_url"] == ""
    assert body["niveau"] == "2bac"
    assert body["filiere"] == "Sciences Physiques"

    persisted = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert persisted.status_code == 200
    assert persisted.json()["banner_url"] == ""


def test_patch_profile_blocks_track_changes_after_initial_selection(app_client, auth_token):
    token, _ = auth_token(email="profile-track-boundary@example.com")

    initial = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "niveau": "2BAC",
            "filiere": "Sciences Physiques",
        },
    )
    assert initial.status_code == 200

    same_value = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "niveau": " 2bac ",
            "filiere": "sciences physiques",
        },
    )
    assert same_value.status_code == 200

    changed = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "niveau": "1BAC",
            "filiere": "Sciences Math",
        },
    )

    assert changed.status_code == 403
    assert changed.json()["detail"] == "Track changes require staff support"

    persisted = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert persisted.status_code == 200
    assert persisted.json()["niveau"] == " 2bac "
    assert persisted.json()["filiere"] == "sciences physiques"


def test_patch_profile_rejects_external_media_urls(app_client, auth_token):
    token, _ = auth_token(email="profile-external-media@example.com")

    response = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"avatar_url": "https://example.com/avatar.png"},
    )

    assert response.status_code == 422


def test_patch_profile_rejects_media_urls_over_database_limit(app_client, auth_token):
    token, _ = auth_token(email="profile-long-media@example.com")

    response = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"avatar_url": f"/media/profile/{'a' * 486}.png"},
    )

    assert response.status_code == 422


def test_patch_profile_rejects_direct_local_profile_media_reference_changes(app_client, auth_token):
    token, _ = auth_token(email="profile-direct-local-media@example.com")

    response = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"avatar_url": "/media/profile/999/avatar-0123456789abcdef0123456789abcdef.png"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Upload new avatar media through the profile media endpoint before referencing it here"


def test_patch_profile_rejects_direct_s3_profile_media_reference_changes(app_client, auth_token):
    token, _ = auth_token(email="profile-direct-s3-media@example.com")

    response = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"banner_url": "s3://kresco-private-media/profile/999/banner-0123456789abcdef0123456789abcdef.png"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Upload new banner media through the profile media endpoint before referencing it here"


def test_upload_profile_avatar_persists_storage_url(app_client, auth_token):
    token, _ = auth_token(email="profile-avatar@example.com")

    response = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\navatar", "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["url"].startswith("/media/profile/")

    persisted = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert persisted.status_code == 200
    assert persisted.json()["avatar_url"] == body["url"]


def test_patch_profile_allows_current_uploaded_media_reference(app_client, auth_token, run_db):
    token, user_id = auth_token(email="profile-avatar-current-ref@example.com")
    avatar_bytes = b"\x89PNG\r\n\x1a\navatar"

    uploaded = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("avatar.png", avatar_bytes, "image/png")},
    )

    assert uploaded.status_code == 200
    avatar_url = uploaded.json()["url"]

    patched = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Avatar Echo", "avatar_url": avatar_url},
    )

    assert patched.status_code == 200
    assert patched.json()["avatar_url"] == avatar_url
    assert patched.json()["full_name"] == "Avatar Echo"

    async def _avatar_size():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            return user.avatar_media_size

    assert run_db(_avatar_size()) == len(avatar_bytes)


def test_patch_profile_allows_clearing_uploaded_media_reference(app_client, auth_token, run_db):
    token, user_id = auth_token(email="profile-avatar-clear@example.com")
    avatar_bytes = b"\x89PNG\r\n\x1a\navatar"

    uploaded = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("avatar.png", avatar_bytes, "image/png")},
    )

    assert uploaded.status_code == 200

    cleared = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"avatar_url": ""},
    )

    assert cleared.status_code == 200
    assert cleared.json()["avatar_url"] == ""

    async def _avatar_state():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            return user.avatar_url, user.avatar_media_size

    assert run_db(_avatar_state()) == ("", 0)


def test_profile_media_upload_enforces_aggregate_quota(app_client, auth_token, test_settings, run_db):
    token, user_id = auth_token(email="profile-media-quota@example.com")
    original_quota = test_settings.media_profile_quota_bytes
    test_settings.media_profile_quota_bytes = 30
    png_20 = b"\x89PNG\r\n\x1a\n" + b"a" * 12
    png_10 = b"\x89PNG\r\n\x1a\n" + b"b" * 2
    try:
        avatar = app_client.post(
            "/api/profile/me/media/avatar",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("avatar.png", png_20, "image/png")},
        )
        assert avatar.status_code == 200

        too_large_banner = app_client.post(
            "/api/profile/me/media/banner",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("banner.png", png_20, "image/png")},
        )
        assert too_large_banner.status_code == 413
        assert too_large_banner.json()["detail"] == "Profile media quota exceeded"

        replacement_avatar = app_client.post(
            "/api/profile/me/media/avatar",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("avatar.png", png_10, "image/png")},
        )
        assert replacement_avatar.status_code == 200

        accepted_banner = app_client.post(
            "/api/profile/me/media/banner",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("banner.png", png_20, "image/png")},
        )
        assert accepted_banner.status_code == 200

        async def _sizes():
            session_factory = get_session_factory()
            async with session_factory() as db:
                user = await db.get(User, user_id)
                return user.avatar_media_size, user.banner_media_size

        assert run_db(_sizes()) == (len(png_10), len(png_20))
    finally:
        test_settings.media_profile_quota_bytes = original_quota


def test_upload_profile_avatar_uses_configured_s3_storage(app_client, auth_token, monkeypatch):
    token, _ = auth_token(email="profile-avatar-s3@example.com")
    calls = []

    class _Storage:
        async def put_object(self, *, key: str, content: bytes, content_type: str):
            calls.append({"key": key, "content": content, "content_type": content_type})
            return SimpleNamespace(
                key=f"test-prefix/{key}",
                reference=f"s3://kresco-media/test-prefix/{key}",
                url=f"https://signed.example.com/test-prefix/{key}?signature=upload",
            )

    monkeypatch.setattr("app.routers.users.get_media_storage", lambda settings: _Storage())
    monkeypatch.setattr(
        "app.routers.users.media_url",
        lambda reference, settings: f"https://signed.example.com/{reference.removeprefix('s3://kresco-media/')}?signature=read"
        if str(reference).startswith("s3://")
        else reference,
    )

    response = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\navatar", "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["url"].startswith("https://signed.example.com/test-prefix/profile/")
    assert calls[0]["key"].startswith("profile/")
    assert calls[0]["content_type"] == "image/png"

    persisted = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert persisted.status_code == 200
    assert persisted.json()["avatar_url"].startswith("https://signed.example.com/test-prefix/profile/")
    assert persisted.json()["avatar_url"].endswith("?signature=read")


def test_cookie_profile_upload_requires_and_accepts_csrf_token(app_client, auth_token, test_settings):
    token, user_id = auth_token(email="profile-avatar-csrf@example.com")
    _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=False)

    missing = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Origin": "http://localhost:3000"},
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\navatar", "image/png")},
    )

    assert missing.status_code == 403
    assert missing.json()["detail"] == "CSRF token is required for cookie-authenticated writes"

    csrf_token = _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=True)
    accepted = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Origin": "http://localhost:3000", CSRF_HEADER_NAME: csrf_token},
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\navatar", "image/png")},
    )

    assert accepted.status_code == 200
    assert accepted.json()["url"].startswith("/media/profile/")


def test_upload_profile_banner_rejects_non_image(app_client, auth_token):
    token, _ = auth_token(email="profile-banner@example.com")

    response = app_client.post(
        "/api/profile/me/media/banner",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("banner.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


def test_upload_profile_avatar_rejects_mismatched_image_signature(app_client, auth_token):
    token, _ = auth_token(email="profile-avatar-signature@example.com")

    response = app_client.post(
        "/api/profile/me/media/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("avatar.png", b"<script>alert(1)</script>", "image/png")},
    )

    assert response.status_code == 400
