from pathlib import Path

from app.stage_prefix import strip_stage_prefix


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_lambda_handler_initializes_runtime_services_without_asgi_lifespan():
    handler_source = (BACKEND_ROOT / "app_handler.py").read_text(encoding="utf-8")

    assert "initialize_app_runtime(_app, _settings)" in handler_source


def test_api_gateway_stage_prefix_is_stripped_before_fastapi_routing():
    environ = {"PATH_INFO": "/staging/ready"}

    strip_stage_prefix(environ, "/staging")

    assert environ["PATH_INFO"] == "/ready"


def test_api_gateway_stage_root_maps_to_fastapi_root():
    environ = {"PATH_INFO": "/production"}

    strip_stage_prefix(environ, "/production")

    assert environ["PATH_INFO"] == "/"


def test_api_gateway_stage_script_name_is_stripped_before_asgi_scope_building():
    environ = {"SCRIPT_NAME": "/staging", "PATH_INFO": "/ready"}

    strip_stage_prefix(environ, "/staging")

    assert environ["SCRIPT_NAME"] == ""
    assert environ["PATH_INFO"] == "/ready"
