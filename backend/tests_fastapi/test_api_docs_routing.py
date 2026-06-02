"""Guards for OpenAPI/docs routing under the same-origin /api proxy.

Production serves the frontend at /api/* (Next rewrites -> backend). The API
Gateway stage prefix is stripped before FastAPI, so root_path must be empty and
the OpenAPI spec must live under /api/ — otherwise the Swagger page fetches
/<stage>/openapi.json, which the /api/*-only proxy does not forward (404).
"""


def test_root_path_is_empty_so_stage_prefix_is_not_double_applied(app_client):
    assert app_client.app.root_path == ""


def test_openapi_and_docs_served_under_api_prefix(app_client):
    assert app_client.get("/api/openapi.json").status_code == 200
    assert app_client.get("/api/docs").status_code == 200
    # Must NOT be at the root: the same-origin proxy only forwards /api/*.
    assert app_client.get("/openapi.json").status_code == 404


def test_docs_page_references_proxied_spec_url(app_client):
    assert "/api/openapi.json" in app_client.get("/api/docs").text
