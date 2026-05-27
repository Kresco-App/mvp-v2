from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import PRODUCTION_ENVIRONMENTS, Settings

PLACEHOLDER = "__SET_IN_AWS_SECRETS__"
DEFAULT_SETTINGS_PATH = BACKEND_ROOT / "zappa_settings.json"
OPTIONAL_OVERRIDE_KEYS = {
    "CORS_ALLOWED_ORIGINS",
    "CORS_ALLOW_ORIGIN_REGEX",
    "FRONTEND_URL",
    "STRIPE_PK",
}

ENV_TO_SETTINGS_FIELD = {
    "KRESCO_ENV": "environment",
    "DATABASE_URL": "database_url",
    "JWT_SECRET_KEY": "jwt_secret_key",
    "JWT_ALGORITHM": "jwt_algorithm",
    "JWT_EXPIRE_MINUTES": "jwt_expire_minutes",
    "GOOGLE_CLIENT_ID": "google_client_id",
    "VDOCIPHER_API_SECRET": "vdocipher_api_secret",
    "VDOCIPHER_API_BASE_URL": "vdocipher_api_base_url",
    "VDOCIPHER_LIVE_CREATE_URL": "vdocipher_live_create_url",
    "CORS_ALLOWED_ORIGINS": "cors_allowed_origins",
    "CORS_ALLOW_ORIGIN_REGEX": "cors_allow_origin_regex",
    "FRONTEND_URL": "frontend_url",
    "STRIPE_PK": "stripe_pk",
    "STRIPE_SK": "stripe_sk",
    "STRIPE_PRODUCT_ID": "stripe_product_id",
    "STRIPE_WEBHOOK_SECRET": "stripe_webhook_secret",
    "ADMIN_PASSWORD": "admin_password",
    "RESEND_API_KEY": "resend_api_key",
    "ABLY_API_KEY": "ably_api_key",
    "ABLY_TOKEN_TTL_SECONDS": "ably_token_ttl_seconds",
    "DEBUG": "debug",
}


class ZappaRenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderResult:
    path: Path
    replaced_keys: tuple[str, ...]
    overridden_keys: tuple[str, ...]


def render_zappa_settings(
    settings_path: Path = DEFAULT_SETTINGS_PATH,
    runtime_env: Mapping[str, str] | None = None,
) -> RenderResult:
    env = runtime_env if runtime_env is not None else os.environ
    settings_doc = json.loads(settings_path.read_text(encoding="utf-8"))
    production = settings_doc.get("production")
    if not isinstance(production, dict):
        raise ZappaRenderError("zappa_settings.json is missing the production stage.")

    zappa_env = production.get("environment_variables")
    if not isinstance(zappa_env, dict):
        raise ZappaRenderError("zappa_settings.json is missing production.environment_variables.")

    resolved_env, replaced_keys, overridden_keys = _resolve_environment_variables(zappa_env, env)
    _validate_rendered_environment(resolved_env)

    production["environment_variables"] = resolved_env
    settings_path.write_text(json.dumps(settings_doc, indent=4) + "\n", encoding="utf-8")

    return RenderResult(
        path=settings_path,
        replaced_keys=tuple(sorted(replaced_keys)),
        overridden_keys=tuple(sorted(overridden_keys)),
    )


def _resolve_environment_variables(
    zappa_env: Mapping[str, str],
    runtime_env: Mapping[str, str],
) -> tuple[dict[str, str], list[str], list[str]]:
    resolved_env = dict(zappa_env)
    missing_keys: list[str] = []
    replaced_keys: list[str] = []
    overridden_keys: list[str] = []

    for key, configured_value in zappa_env.items():
        runtime_value = runtime_env.get(key)
        has_runtime_value = runtime_value is not None and str(runtime_value).strip() != ""

        if configured_value == PLACEHOLDER:
            if not has_runtime_value:
                missing_keys.append(key)
                continue
            resolved_env[key] = str(runtime_value)
            replaced_keys.append(key)
            continue

        if key in OPTIONAL_OVERRIDE_KEYS and has_runtime_value and str(runtime_value) != configured_value:
            resolved_env[key] = str(runtime_value)
            overridden_keys.append(key)

    if missing_keys:
        joined = ", ".join(sorted(missing_keys))
        raise ZappaRenderError(f"Missing required deploy environment variables: {joined}")

    unresolved_keys = [key for key, value in resolved_env.items() if value == PLACEHOLDER]
    if unresolved_keys:
        joined = ", ".join(sorted(unresolved_keys))
        raise ZappaRenderError(f"Unresolved Zappa placeholders remain: {joined}")

    return resolved_env, replaced_keys, overridden_keys


def _validate_rendered_environment(rendered_env: Mapping[str, str]) -> None:
    settings_kwargs = _settings_kwargs_from_environment(rendered_env)
    settings = Settings(**settings_kwargs)
    errors = settings.production_config_errors()
    if settings.environment.strip().lower() not in PRODUCTION_ENVIRONMENTS:
        errors.append("KRESCO_ENV must be set to a production-like value for the Zappa production stage.")
    if not settings.admin_password.strip():
        errors.append("ADMIN_PASSWORD must be configured for the admin panel.")

    if errors:
        raise ZappaRenderError("Rendered Zappa production environment is invalid: " + " ".join(errors))


def _settings_kwargs_from_environment(rendered_env: Mapping[str, str]) -> dict[str, object]:
    settings_kwargs: dict[str, object] = {
        field_name: value
        for env_name, value in rendered_env.items()
        if (field_name := ENV_TO_SETTINGS_FIELD.get(env_name)) is not None
    }
    for field_name, field_info in Settings.model_fields.items():
        settings_kwargs.setdefault(field_name, field_info.get_default(call_default_factory=True))
    return settings_kwargs


def main() -> None:
    try:
        settings_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SETTINGS_PATH
        result = render_zappa_settings(settings_path)
    except ZappaRenderError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(f"Rendered {result.path}")
    if result.replaced_keys:
        print("Secrets supplied for: " + ", ".join(result.replaced_keys))
    if result.overridden_keys:
        print("Overrides applied for: " + ", ".join(result.overridden_keys))
    print("Zappa production environment validates against startup policy.")


if __name__ == "__main__":
    main()
