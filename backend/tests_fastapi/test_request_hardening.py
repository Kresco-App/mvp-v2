def test_api_responses_emit_private_no_store_cache_headers(app_client, auth_token):
    token, _user_id = auth_token(email="cache-private@example.com")

    response = app_client.get(
        "/api/profile/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["expires"] == "0"


def test_global_request_body_limit_rejects_large_payload_before_route(app_client, test_settings):
    response = app_client.post(
        "/api/auth/firebase-session",
        content=b"x" * (int(test_settings.max_request_body_bytes) + 1),
        headers={"content-type": "application/octet-stream"},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Request body too large"
    assert response.headers["x-content-type-options"] == "nosniff"
