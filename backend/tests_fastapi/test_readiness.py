def test_health_remains_liveness_only(app_client):
    response = app_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "2.0.0"}


def test_ready_checks_database_and_configuration(app_client):
    response = app_client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "version": "2.0.0",
        "checks": {
            "configuration": "ok",
            "database": "ok",
        },
    }


def test_ready_reports_database_failure_without_exception_details(app_client):
    original_engine = app_client.app.state.db_engine
    app_client.app.state.db_engine = BrokenEngine()
    try:
        response = app_client.get("/ready")
    finally:
        app_client.app.state.db_engine = original_engine

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "version": "2.0.0",
        "checks": {
            "configuration": "ok",
            "database": "error",
        },
        "errors": ["database"],
    }


class BrokenEngine:
    def connect(self):
        return BrokenConnection()


class BrokenConnection:
    async def __aenter__(self):
        raise RuntimeError("sensitive connection detail")

    async def __aexit__(self, exc_type, exc, tb):
        return None
