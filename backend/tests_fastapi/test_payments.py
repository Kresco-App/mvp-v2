def test_webhook_requires_secret(app_client):
    response = app_client.post("/api/payments/webhook", data=b"{}", headers={"stripe-signature": "x"})
    assert response.status_code == 500
    assert "Webhook secret not configured" in response.text
