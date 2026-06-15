from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import parse_qs, urlparse

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import PRODUCTION_ENVIRONMENTS, RUNTIME_SECRET_ID_ENV, Settings

PLACEHOLDER = "__SET_IN_AWS_SECRETS__"
DEFAULT_SETTINGS_PATH = BACKEND_ROOT / "zappa_settings.json"
RUNTIME_SECRET_BACKED_ENV_KEYS = {
    "DATABASE_URL",
    "JWT_SECRET_KEY",
    "GOOGLE_CLIENT_ID",
    "VDOCIPHER_API_SECRET",
    "VDOCIPHER_API_BASE_URL",
    "VDOCIPHER_LIVE_CREATE_URL",
    "STRIPE_SK",
    "STRIPE_PRODUCT_ID",
    "STRIPE_WEBHOOK_SECRET",
    "CMI_CLIENT_ID",
    "CMI_STORE_KEY",
    "CMI_PAYMENT_URL",
    "CMI_OK_URL",
    "CMI_FAIL_URL",
    "CMI_CALLBACK_URL",
    "RESEND_API_KEY",
    "ABLY_API_KEY",
    "KRESCO_RATE_LIMIT_STORAGE_URI",
    "REALTIME_OUTBOX_SECRET",
    "MEDIA_S3_BUCKET",
}
RUNTIME_SECRET_VALIDATION_VALUES = {
    "DATABASE_URL": "postgresql+asyncpg://user:pass@db.example.com/kresco?sslmode=verify-full",
    "JWT_SECRET_KEY": "prod-fixture-3fb835dc1d9d4fa6a28678341a109d91",
    "GOOGLE_CLIENT_ID": "google-client",
    "VDOCIPHER_API_SECRET": "vdocipher-secret",
    "VDOCIPHER_API_BASE_URL": "https://video.example.com/api",
    "VDOCIPHER_LIVE_CREATE_URL": "https://video.example.com/live",
    "STRIPE_SK": "stripe-secret",
    "STRIPE_PRODUCT_ID": "stripe-product",
    "STRIPE_WEBHOOK_SECRET": "stripe-webhook",
    "CMI_CLIENT_ID": "cmi-client",
    "CMI_STORE_KEY": "cmi-store-key",
    "CMI_PAYMENT_URL": "https://test.cmi.co.ma/payment",
    "CMI_OK_URL": "https://app.example.com/payment/cmi/ok",
    "CMI_FAIL_URL": "https://app.example.com/payment/cmi/fail",
    "CMI_CALLBACK_URL": "https://api.example.com/api/payments/cmi/callback",
    "RESEND_API_KEY": "resend-key",
    "ABLY_API_KEY": "ably:key",
    "KRESCO_RATE_LIMIT_STORAGE_URI": "redis://rate-limit.example.com:6379/0",
    "REALTIME_OUTBOX_SECRET": "test-realtime-outbox-secret-32-bytes",
    "MEDIA_S3_BUCKET": "kresco-media-production",
}
OPTIONAL_OVERRIDE_KEYS = {
    "CORS_ALLOWED_ORIGINS",
    "CORS_ALLOW_ORIGIN_REGEX",
    "FRONTEND_URL",
    "STRIPE_PK",
}
VPC_CONFIG_ENV_KEYS = {
    "SubnetIds": "ZAPPA_SUBNET_IDS",
    "SecurityGroupIds": "ZAPPA_SECURITY_GROUP_IDS",
}
MIN_LAMBDA_MEMORY_MB = 1024
MIN_LAMBDA_TIMEOUT_SECONDS = 45
REQUIRED_REALTIME_OUTBOX_EVENT = {
    "function": "app.scheduled.process_realtime_outbox_event",
    "expression": "rate(1 minute)",
}

ENV_TO_SETTINGS_FIELD = {
    "KRESCO_ENV": "environment",
    "KRESCO_RELEASE_SHA": "release_sha",
    RUNTIME_SECRET_ID_ENV: "runtime_secret_id",
    "DATABASE_URL": "database_url",
    "DATABASE_CONNECTION_STRATEGY": "database_connection_strategy",
    "PGSSLROOTCERT": "pgsslrootcert",
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
    "CMI_CLIENT_ID": "cmi_client_id",
    "CMI_STORE_KEY": "cmi_store_key",
    "CMI_PAYMENT_URL": "cmi_payment_url",
    "CMI_OK_URL": "cmi_ok_url",
    "CMI_FAIL_URL": "cmi_fail_url",
    "CMI_CALLBACK_URL": "cmi_callback_url",
    "RESEND_API_KEY": "resend_api_key",
    "ABLY_API_KEY": "ably_api_key",
    "ABLY_TOKEN_TTL_SECONDS": "ably_token_ttl_seconds",
    "KRESCO_RATE_LIMIT_STORAGE_URI": "rate_limit_storage_uri",
    "REALTIME_OUTBOX_SECRET": "realtime_outbox_secret",
    "MEDIA_STORAGE_BACKEND": "media_storage_backend",
    "MEDIA_S3_BUCKET": "media_s3_bucket",
    "MEDIA_S3_REGION": "media_s3_region",
    "MEDIA_S3_PREFIX": "media_s3_prefix",
    "MEDIA_S3_PRESIGN_TTL_SECONDS": "media_s3_presign_ttl_seconds",
    "MEDIA_PROFILE_QUOTA_BYTES": "media_profile_quota_bytes",
    "MEDIA_CHAT_CONVERSATION_QUOTA_BYTES": "media_chat_conversation_quota_bytes",
    "MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS": "media_s3_lifecycle_expiration_days",
    "DEBUG": "debug",
}


class ZappaRenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderResult:
    path: Path
    stage: str
    replaced_keys: tuple[str, ...]
    overridden_keys: tuple[str, ...]


def render_zappa_settings(
    settings_path: Path = DEFAULT_SETTINGS_PATH,
    runtime_env: Mapping[str, str] | None = None,
    stage: str = "production",
) -> RenderResult:
    env = runtime_env if runtime_env is not None else os.environ
    settings_doc = json.loads(settings_path.read_text(encoding="utf-8"))
    target_stage = stage.strip() or "production"
    zappa_stage = settings_doc.get(target_stage)
    if not isinstance(zappa_stage, dict):
        raise ZappaRenderError(f"zappa_settings.json is missing the {target_stage} stage.")

    zappa_env = zappa_stage.get("environment_variables")
    if not isinstance(zappa_env, dict):
        raise ZappaRenderError(f"zappa_settings.json is missing {target_stage}.environment_variables.")
    embedded_secret_keys = sorted(key for key in RUNTIME_SECRET_BACKED_ENV_KEYS if key in zappa_env)
    if embedded_secret_keys:
        joined = ", ".join(embedded_secret_keys)
        raise ZappaRenderError(
            "Runtime secret-backed keys must not be present in zappa_settings.json environment_variables: "
            + joined
        )

    resolved_env, replaced_keys, overridden_keys = _resolve_environment_variables(zappa_env, env)
    _resolve_vpc_config(zappa_stage, env)
    _resolve_runtime_secret_permission(zappa_stage, resolved_env)
    _validate_stage_runtime_settings(zappa_stage, target_stage)
    _validate_rendered_environment(resolved_env, target_stage)

    zappa_stage["environment_variables"] = resolved_env
    settings_path.write_text(json.dumps(settings_doc, indent=4) + "\n", encoding="utf-8")

    return RenderResult(
        path=settings_path,
        stage=target_stage,
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


def _resolve_vpc_config(zappa_stage: dict[str, object], runtime_env: Mapping[str, str]) -> None:
    vpc_config = zappa_stage.get("vpc_config")
    if vpc_config is None:
        return
    if not isinstance(vpc_config, dict):
        raise ZappaRenderError("zappa_settings.json vpc_config must be an object.")

    missing_keys: list[str] = []
    for config_key, env_key in VPC_CONFIG_ENV_KEYS.items():
        configured_value = vpc_config.get(config_key)
        if configured_value != PLACEHOLDER:
            continue
        runtime_value = str(runtime_env.get(env_key, "")).strip()
        if not runtime_value:
            missing_keys.append(env_key)
            continue
        vpc_config[config_key] = _parse_vpc_id_list(runtime_value, env_key)

    if missing_keys:
        joined = ", ".join(sorted(missing_keys))
        raise ZappaRenderError(f"Missing required deploy environment variables: {joined}")

    subnet_ids = vpc_config.get("SubnetIds")
    security_group_ids = vpc_config.get("SecurityGroupIds")
    if not _valid_prefixed_id_list(subnet_ids, "subnet-"):
        raise ZappaRenderError("ZAPPA_SUBNET_IDS must contain one or more subnet IDs.")
    if not _valid_prefixed_id_list(security_group_ids, "sg-"):
        raise ZappaRenderError("ZAPPA_SECURITY_GROUP_IDS must contain one or more security group IDs.")


def _parse_vpc_id_list(raw_value: str, env_key: str) -> list[str]:
    try:
        decoded = json.loads(raw_value)
    except json.JSONDecodeError:
        decoded = raw_value

    if isinstance(decoded, list):
        values = [str(item).strip() for item in decoded]
    else:
        values = [part.strip() for part in str(decoded).split(",")]
    values = [value for value in values if value]
    if not values:
        raise ZappaRenderError(f"{env_key} must contain one or more comma-separated IDs.")
    return values


def _valid_prefixed_id_list(value: object, prefix: str) -> bool:
    return isinstance(value, list) and bool(value) and all(isinstance(item, str) and item.startswith(prefix) for item in value)


def _validate_stage_runtime_settings(zappa_stage: Mapping[str, object], stage: str) -> None:
    errors: list[str] = []
    if zappa_stage.get("app_function") != "app_handler.application":
        errors.append("app_function must be app_handler.application.")
    if zappa_stage.get("runtime") != "python3.11":
        errors.append("runtime must be python3.11.")
    if _int_stage_setting(zappa_stage, "memory_size") < MIN_LAMBDA_MEMORY_MB:
        errors.append(f"memory_size must be at least {MIN_LAMBDA_MEMORY_MB}.")
    if _int_stage_setting(zappa_stage, "timeout_seconds") < MIN_LAMBDA_TIMEOUT_SECONDS:
        errors.append(f"timeout_seconds must be at least {MIN_LAMBDA_TIMEOUT_SECONDS}.")
    if zappa_stage.get("keep_warm") is not True:
        errors.append("keep_warm must be true for production-like Lambda stages.")
    if zappa_stage.get("touch") is not False:
        errors.append("touch must be false so deploys rely on explicit runtime verification.")
    if zappa_stage.get("cors") is not False:
        errors.append("cors must be false; CORS is handled by the FastAPI app.")
    if zappa_stage.get("apigateway_enabled") is not True:
        errors.append("apigateway_enabled must be true.")
    if zappa_stage.get("slim_handler") is not True:
        errors.append("slim_handler must be true to keep Lambda packages lean.")

    events = zappa_stage.get("events")
    if not isinstance(events, list) or REQUIRED_REALTIME_OUTBOX_EVENT not in events:
        errors.append("events must include the realtime outbox EventBridge schedule.")

    if errors:
        raise ZappaRenderError(f"Zappa {stage} Lambda runtime settings are invalid: " + " ".join(errors))


def _int_stage_setting(zappa_stage: Mapping[str, object], key: str) -> int:
    value = zappa_stage.get(key)
    if isinstance(value, bool):
        return -1
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return -1


def _resolve_runtime_secret_permission(zappa_stage: dict[str, object], resolved_env: Mapping[str, str]) -> None:
    secret_id = str(resolved_env.get(RUNTIME_SECRET_ID_ENV, "")).strip()
    if not secret_id:
        return
    if not secret_id.startswith("arn:aws:secretsmanager:"):
        raise ZappaRenderError(f"{RUNTIME_SECRET_ID_ENV} must be a full AWS Secrets Manager ARN.")

    permissions = zappa_stage.get("extra_permissions")
    if not isinstance(permissions, list):
        raise ZappaRenderError("zappa_settings.json must grant Secrets Manager access via extra_permissions.")

    matched = False
    for statement in permissions:
        if not isinstance(statement, dict):
            continue
        actions = statement.get("Action")
        action_values = actions if isinstance(actions, list) else [actions]
        if "secretsmanager:GetSecretValue" not in action_values:
            continue
        matched = True
        resource = statement.get("Resource")
        if resource == PLACEHOLDER:
            statement["Resource"] = secret_id
        elif resource != secret_id:
            raise ZappaRenderError("Secrets Manager permission must be scoped to the runtime secret ARN.")

    if not matched:
        raise ZappaRenderError("Secrets Manager permission placeholder was not rendered.")


def _validate_rendered_environment(rendered_env: Mapping[str, str], stage: str) -> None:
    errors: list[str] = []
    secret_id = str(rendered_env.get(RUNTIME_SECRET_ID_ENV, "")).strip()
    if not secret_id:
        errors.append(f"{RUNTIME_SECRET_ID_ENV} must be configured for deployed runtime secrets.")
    elif not secret_id.startswith("arn:aws:secretsmanager:"):
        errors.append(f"{RUNTIME_SECRET_ID_ENV} must be a full AWS Secrets Manager ARN.")

    validation_env = {**RUNTIME_SECRET_VALIDATION_VALUES, **rendered_env}
    settings_kwargs = _settings_kwargs_from_environment(validation_env)
    settings = Settings(**settings_kwargs)
    errors.extend(settings.production_config_errors())
    environment = settings.environment.strip().lower()
    if environment not in PRODUCTION_ENVIRONMENTS:
        errors.append("KRESCO_ENV must be set to a production-like value for the Zappa stage.")
    if stage == "staging" and environment != "staging":
        errors.append("The Zappa staging stage must render with KRESCO_ENV=staging.")
    if stage == "production" and environment not in {"production", "prod"}:
        errors.append("The Zappa production stage must render with KRESCO_ENV=production or prod.")
    if errors:
        raise ZappaRenderError(f"Rendered Zappa {stage} environment is invalid: " + " ".join(errors))


def validate_database_url_policy(database_url: str) -> None:
    raw_url = str(database_url or "").strip()
    errors: list[str] = []
    if not raw_url:
        raise ZappaRenderError("DATABASE_URL must be configured for target database migrations.")

    parsed = urlparse(raw_url)
    if parsed.scheme.lower() not in {"postgres", "postgresql", "postgresql+asyncpg"}:
        errors.append("DATABASE_URL must use PostgreSQL.")
    if not parsed.hostname:
        errors.append("DATABASE_URL must include a database hostname.")
    elif _is_local_or_ip_hostname(parsed.hostname):
        errors.append("DATABASE_URL host must be a remote RDS Proxy hostname, not localhost or an IP address.")

    sslmode = parse_qs(parsed.query).get("sslmode", [""])[0].strip().lower()
    if sslmode != "verify-full":
        errors.append("DATABASE_URL must include sslmode=verify-full.")

    if errors:
        raise ZappaRenderError("DATABASE_URL policy is invalid: " + " ".join(errors))


def _is_local_or_ip_hostname(hostname: str) -> bool:
    normalized = hostname.strip().lower()
    if normalized in {"localhost", "localhost.localdomain"} or normalized.endswith(".localhost"):
        return True
    try:
        import ipaddress

        ipaddress.ip_address(normalized.strip("[]"))
    except ValueError:
        return False
    return True


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
    settings_path = DEFAULT_SETTINGS_PATH
    stage = os.environ.get("ZAPPA_STAGE", "production")
    if len(sys.argv) > 1:
        settings_path = Path(sys.argv[1]).resolve()
    if len(sys.argv) > 2:
        stage = sys.argv[2]

    try:
        result = render_zappa_settings(settings_path, stage=stage)
    except ZappaRenderError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(f"Rendered {result.stage} stage in {result.path}")
    if result.replaced_keys:
        print("Secrets supplied for: " + ", ".join(result.replaced_keys))
    if result.overridden_keys:
        print("Overrides applied for: " + ", ".join(result.overridden_keys))
    print("Zappa production environment validates against startup policy.")


if __name__ == "__main__":
    main()
