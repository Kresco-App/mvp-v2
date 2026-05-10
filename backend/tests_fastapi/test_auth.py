from app.services.email import generate_verification_token


def test_signup_verify_and_login_flow(app_client, test_settings):
    email = "newuser@example.com"
    password = "strong-pass-123"

    signup = app_client.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "full_name": "New User"},
    )
    assert signup.status_code == 202

    verify_token = generate_verification_token(email, test_settings)
    verify = app_client.post("/api/auth/verify-email", json={"token": verify_token})
    assert verify.status_code == 200
    assert "access_token" in verify.json()

    login = app_client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    assert "access_token" in login.json()


def test_google_login_happy_path(app_client, monkeypatch):
    import app.routers.users as users_router

    monkeypatch.setattr(
        users_router,
        "verify_google_token",
        lambda *_: {
            "email": "googleuser@example.com",
            "name": "Google User",
            "picture": "https://example.com/avatar.png",
            "sub": "google-sub-1",
        },
    )

    response = app_client.post("/api/google-login", json={"credential": "fake-credential"})
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["user"]["email"] == "googleuser@example.com"
