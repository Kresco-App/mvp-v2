def test_patch_profile_updates_identity_fields(app_client, auth_token):
    token, _ = auth_token(email="profile-patch@example.com")

    response = app_client.patch(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "full_name": "Updated Student",
            "avatar_url": "https://example.com/avatar.png",
            "banner_url": "https://example.com/banner.png",
            "niveau": "2bac",
            "filiere": "Sciences Physiques",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Updated Student"
    assert body["avatar_url"] == "https://example.com/avatar.png"
    assert body["banner_url"] == "https://example.com/banner.png"
    assert body["niveau"] == "2bac"
    assert body["filiere"] == "Sciences Physiques"

    persisted = app_client.get("/api/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert persisted.status_code == 200
    assert persisted.json()["banner_url"] == "https://example.com/banner.png"


def test_upload_profile_avatar_persists_local_media_url(app_client, auth_token):
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
