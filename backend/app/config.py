import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
LEGACY_FALLBACK_JWT_SECRET = "fallback-secret-change-in-production"
PUBLIC_DEV_JWT_SECRET = "dev-jwt-secret-change-me-32-bytes-minimum"
LOCAL_DATABASE_URL = "sqlite+aiosqlite:///./db.sqlite3"
PRODUCTION_ENVIRONMENTS = {"production", "prod", "staging"}
DISALLOWED_JWT_SECRETS = {"", "change-me", LEGACY_FALLBACK_JWT_SECRET, PUBLIC_DEV_JWT_SECRET}
DISALLOWED_JWT_SECRET_MARKERS = ("change-me", "placeholder", "test-secret", "development", "local")

REQUIRED_PRODUCTION_FIELDS: tuple[tuple[str, str], ...] = (
    ("gcp_project_id", "GCP_PROJECT_ID"),
    ("gcp_region", "GCP_REGION"),
    ("firebase_project_id", "FIREBASE_PROJECT_ID"),
    ("firebase_web_api_key", "FIREBASE_WEB_API_KEY"),
    ("vdocipher_api_secret", "VDOCIPHER_API_SECRET"),
    ("vdocipher_api_base_url", "VDOCIPHER_API_BASE_URL"),
    ("vdocipher_live_create_url", "VDOCIPHER_LIVE_CREATE_URL"),
    ("resend_api_key", "RESEND_API_KEY"),
)
CMI_PRODUCTION_FIELDS: tuple[tuple[str, str], ...] = (
    ("cmi_client_id", "CMI_CLIENT_ID"),
    ("cmi_store_key", "CMI_STORE_KEY"),
    ("cmi_payment_url", "CMI_PAYMENT_URL"),
    ("cmi_ok_url", "CMI_OK_URL"),
    ("cmi_fail_url", "CMI_FAIL_URL"),
    ("cmi_callback_url", "CMI_CALLBACK_URL"),
)
MEDIA_STORAGE_LOCAL = "local"
MEDIA_STORAGE_GCS = "gcs"
MEDIA_STORAGE_GCS_MOCK = "gcs-mock"
DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS = 3600
GCP_RUNTIME_SECRET_NAME_ENV = "KRESCO_GCP_RUNTIME_SECRET_NAME"
PRODUCTION_DATABASE_CONNECTION_STRATEGIES = {"alloydb", "cloud_sql"}
RUNTIME_SECRET_KEY_ALIASES = {
    "KRESCO_ENV": "environment",
    "APP_ENV": "environment",
    "ENVIRONMENT": "environment",
    "ENV": "environment",
    "KRESCO_RELEASE_SHA": "release_sha",
    "RELEASE_SHA": "release_sha",
    "GITHUB_SHA": "release_sha",
    GCP_RUNTIME_SECRET_NAME_ENV: "gcp_runtime_secret_name",
    "GCP_PROJECT": "gcp_project_id",
    "GCP_PROJECT_ID": "gcp_project_id",
    "GOOGLE_CLOUD_PROJECT": "gcp_project_id",
    "GCP_REGION": "gcp_region",
    "FIREBASE_PROJECT_ID": "firebase_project_id",
    "FIREBASE_WEB_API_KEY": "firebase_web_api_key",
    "FIRESTORE_DATABASE": "firestore_database",
    "KRESCO_DARK_PRODUCTION_MODE": "dark_production_mode",
    "DATABASE_URL": "database_url",
    "DATABASE_CONNECTION_STRATEGY": "database_connection_strategy",
    "DATABASE_POOL_SIZE": "database_pool_size",
    "DATABASE_MAX_OVERFLOW": "database_max_overflow",
    "DATABASE_POOL_TIMEOUT": "database_pool_timeout",
    "PGSSLROOTCERT": "pgsslrootcert",
    "JWT_SECRET_KEY": "jwt_secret_key",
    "JWT_ALGORITHM": "jwt_algorithm",
    "JWT_EXPIRE_MINUTES": "jwt_expire_minutes",
    "VDOCIPHER_API_SECRET": "vdocipher_api_secret",
    "VDOCIPHER_API_BASE_URL": "vdocipher_api_base_url",
    "VDOCIPHER_LIVE_CREATE_URL": "vdocipher_live_create_url",
    "VDOCIPHER_LIVE_DELETE_URL": "vdocipher_live_delete_url",
    "CMI_CLIENT_ID": "cmi_client_id",
    "CMI_STORE_KEY": "cmi_store_key",
    "CMI_PAYMENT_URL": "cmi_payment_url",
    "CMI_OK_URL": "cmi_ok_url",
    "CMI_FAIL_URL": "cmi_fail_url",
    "CMI_CALLBACK_URL": "cmi_callback_url",
    "CORS_ALLOWED_ORIGINS": "cors_allowed_origins",
    "CORS_ALLOW_ORIGIN_REGEX": "cors_allow_origin_regex",
    "FRONTEND_URL": "frontend_url",
    "AUTH_COOKIE_SAMESITE": "auth_cookie_samesite",
    "KRESCO_AUTH_COOKIE_SAMESITE": "auth_cookie_samesite",
    "DEBUG": "debug",
    "RESEND_API_KEY": "resend_api_key",
    "KRESCO_RATE_LIMIT_STORAGE_URI": "rate_limit_storage_uri",
    "REALTIME_OUTBOX_SECRET": "realtime_outbox_secret",
    "MEDIA_STORAGE_BACKEND": "media_storage_backend",
    "MEDIA_GCS_BUCKET": "media_gcs_bucket",
    "MEDIA_GCS_PREFIX": "media_gcs_prefix",
    "MEDIA_GCS_SIGNED_URL_TTL_SECONDS": "media_gcs_signed_url_ttl_seconds",
    "MEDIA_GCS_MOCK_ROOT": "media_gcs_mock_root",
    "MEDIA_PROFILE_QUOTA_BYTES": "media_profile_quota_bytes",
    "MEDIA_CHAT_CONVERSATION_QUOTA_BYTES": "media_chat_conversation_quota_bytes",
    "MAX_REQUEST_BODY_BYTES": "max_request_body_bytes",
    "KRESCO_MAX_REQUEST_BODY_BYTES": "max_request_body_bytes",
}


class Settings(BaseSettings):
    environment: str = Field(
        default="development",
        validation_alias=AliasChoices("environment", "KRESCO_ENV", "APP_ENV", "ENVIRONMENT", "ENV"),
    )
    release_sha: str = Field(
        default="",
        validation_alias=AliasChoices("release_sha", "KRESCO_RELEASE_SHA", "RELEASE_SHA", "GITHUB_SHA"),
    )
    gcp_runtime_secret_name: str = Field(
        default="",
        validation_alias=AliasChoices("gcp_runtime_secret_name", GCP_RUNTIME_SECRET_NAME_ENV),
    )
    gcp_project_id: str = Field(
        default="",
        validation_alias=AliasChoices("gcp_project_id", "GCP_PROJECT_ID", "GCP_PROJECT", "GOOGLE_CLOUD_PROJECT"),
    )
    gcp_region: str = Field(default="europe-southwest1", validation_alias=AliasChoices("gcp_region", "GCP_REGION"))
    firebase_project_id: str = Field(default="", validation_alias=AliasChoices("firebase_project_id", "FIREBASE_PROJECT_ID"))
    firebase_web_api_key: str = Field(default="", validation_alias=AliasChoices("firebase_web_api_key", "FIREBASE_WEB_API_KEY"))
    firestore_database: str = Field(default="(default)", validation_alias=AliasChoices("firestore_database", "FIRESTORE_DATABASE"))
    dark_production_mode: bool = Field(
        default=False,
        validation_alias=AliasChoices("dark_production_mode", "KRESCO_DARK_PRODUCTION_MODE"),
    )
    database_url: str = Field(
        default=LOCAL_DATABASE_URL,
        validation_alias=AliasChoices("database_url", "DATABASE_URL"),
    )
    database_connection_strategy: str = Field(
        default="direct",
        validation_alias=AliasChoices("database_connection_strategy", "DATABASE_CONNECTION_STRATEGY"),
    )
    database_pool_size: int = Field(
        default=10,
        validation_alias=AliasChoices("database_pool_size", "DATABASE_POOL_SIZE"),
    )
    database_max_overflow: int = Field(
        default=20,
        validation_alias=AliasChoices("database_max_overflow", "DATABASE_MAX_OVERFLOW"),
    )
    database_pool_timeout: int = Field(
        default=30,
        validation_alias=AliasChoices("database_pool_timeout", "DATABASE_POOL_TIMEOUT"),
    )
    pgsslrootcert: str = Field(
        default="certifi",
        validation_alias=AliasChoices("pgsslrootcert", "PGSSLROOTCERT"),
    )
    jwt_secret_key: str = Field(
        default="",
        validation_alias=AliasChoices("jwt_secret_key", "JWT_SECRET_KEY"),
    )
    jwt_algorithm: str = Field(default="HS256", validation_alias=AliasChoices("jwt_algorithm", "JWT_ALGORITHM"))
    jwt_expire_minutes: int = Field(default=10080, validation_alias=AliasChoices("jwt_expire_minutes", "JWT_EXPIRE_MINUTES"))
    vdocipher_api_secret: str = Field(default="", validation_alias=AliasChoices("vdocipher_api_secret", "VDOCIPHER_API_SECRET"))
    vdocipher_api_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("vdocipher_api_base_url", "VDOCIPHER_API_BASE_URL"),
    )
    vdocipher_live_create_url: str = Field(
        default="",
        validation_alias=AliasChoices("vdocipher_live_create_url", "VDOCIPHER_LIVE_CREATE_URL"),
    )
    vdocipher_live_delete_url: str = Field(
        default="",
        validation_alias=AliasChoices("vdocipher_live_delete_url", "VDOCIPHER_LIVE_DELETE_URL"),
    )
    cmi_client_id: str = Field(default="", validation_alias=AliasChoices("cmi_client_id", "CMI_CLIENT_ID"))
    cmi_store_key: str = Field(default="", validation_alias=AliasChoices("cmi_store_key", "CMI_STORE_KEY"))
    cmi_payment_url: str = Field(default="", validation_alias=AliasChoices("cmi_payment_url", "CMI_PAYMENT_URL"))
    cmi_ok_url: str = Field(default="", validation_alias=AliasChoices("cmi_ok_url", "CMI_OK_URL"))
    cmi_fail_url: str = Field(default="", validation_alias=AliasChoices("cmi_fail_url", "CMI_FAIL_URL"))
    cmi_callback_url: str = Field(default="", validation_alias=AliasChoices("cmi_callback_url", "CMI_CALLBACK_URL"))
    cors_allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002",
        validation_alias=AliasChoices("cors_allowed_origins", "CORS_ALLOWED_ORIGINS"),
    )
    cors_allow_origin_regex: str = Field(
        default=r"^https?://(localhost|127\.0\.0\.1):\d+$",
        validation_alias=AliasChoices("cors_allow_origin_regex", "CORS_ALLOW_ORIGIN_REGEX"),
    )
    frontend_url: str = Field(default="http://localhost:3000", validation_alias=AliasChoices("frontend_url", "FRONTEND_URL"))
    auth_cookie_samesite: str = Field(
        default="lax",
        validation_alias=AliasChoices("auth_cookie_samesite", "AUTH_COOKIE_SAMESITE", "KRESCO_AUTH_COOKIE_SAMESITE"),
    )
    rate_limit_storage_uri: str = Field(
        default="",
        validation_alias=AliasChoices("rate_limit_storage_uri", "KRESCO_RATE_LIMIT_STORAGE_URI"),
    )
    debug: bool = Field(default=False, validation_alias=AliasChoices("debug", "DEBUG"))
    resend_api_key: str = Field(default="", validation_alias=AliasChoices("resend_api_key", "RESEND_API_KEY"))
    realtime_outbox_secret: str = Field(
        default="",
        validation_alias=AliasChoices("realtime_outbox_secret", "REALTIME_OUTBOX_SECRET"),
    )
    media_storage_backend: str = Field(
        default=MEDIA_STORAGE_LOCAL,
        validation_alias=AliasChoices("media_storage_backend", "MEDIA_STORAGE_BACKEND"),
    )
    media_gcs_bucket: str = Field(default="", validation_alias=AliasChoices("media_gcs_bucket", "MEDIA_GCS_BUCKET"))
    media_gcs_prefix: str = Field(default="media", validation_alias=AliasChoices("media_gcs_prefix", "MEDIA_GCS_PREFIX"))
    media_gcs_signed_url_ttl_seconds: int = Field(
        default=DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS,
        validation_alias=AliasChoices("media_gcs_signed_url_ttl_seconds", "MEDIA_GCS_SIGNED_URL_TTL_SECONDS"),
    )
    media_gcs_mock_root: str = Field(default=".mock-gcs", validation_alias=AliasChoices("media_gcs_mock_root", "MEDIA_GCS_MOCK_ROOT"))
    media_profile_quota_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias=AliasChoices("media_profile_quota_bytes", "MEDIA_PROFILE_QUOTA_BYTES"),
    )
    media_chat_conversation_quota_bytes: int = Field(
        default=50 * 1024 * 1024,
        validation_alias=AliasChoices("media_chat_conversation_quota_bytes", "MEDIA_CHAT_CONVERSATION_QUOTA_BYTES"),
    )
    max_request_body_bytes: int = Field(
        default=8 * 1024 * 1024,
        validation_alias=AliasChoices("max_request_body_bytes", "MAX_REQUEST_BODY_BYTES", "KRESCO_MAX_REQUEST_BODY_BYTES"),
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def cors_allow_origin_regex_value(self) -> str | None:
        value = self.cors_allow_origin_regex.strip()
        return value or None

    @property
    def is_cloud_run(self) -> bool:
        return bool(os.environ.get("K_SERVICE"))

    @property
    def is_production_like(self) -> bool:
        return self.is_cloud_run or self.environment.strip().lower() in PRODUCTION_ENVIRONMENTS

    def production_config_errors(self) -> list[str]:
        if not self.is_production_like:
            return []

        errors: list[str] = []

        if not _is_valid_release_sha(self.release_sha):
            errors.append("KRESCO_RELEASE_SHA must identify the deployed commit or build in production environments.")

        if _is_disallowed_jwt_secret(self.jwt_secret_key):
            errors.append("JWT_SECRET_KEY must be configured to a non-default secret with at least 32 characters.")

        database_strategy = self.database_connection_strategy.strip().lower()
        if _is_sqlite_database_url(self.database_url):
            errors.append("DATABASE_URL must point to a production database, not a local SQLite database.")
        elif not _is_postgres_database_url(self.database_url):
            errors.append("DATABASE_URL must use PostgreSQL in production environments.")
        else:
            sslmode = _database_sslmode(self.database_url)
            if database_strategy == "cloud_sql" and _is_cloud_sql_socket_database_url(self.database_url):
                if sslmode not in {"", "disable"}:
                    errors.append("Cloud SQL socket DATABASE_URL must omit sslmode or set sslmode=disable.")
            else:
                if sslmode != "verify-full":
                    errors.append("DATABASE_URL must include sslmode=verify-full in production environments.")
                if not _is_readable_trust_store(self.pgsslrootcert):
                    errors.append("PGSSLROOTCERT must point to a readable CA trust store.")

        if database_strategy not in PRODUCTION_DATABASE_CONNECTION_STRATEGIES:
            errors.append("DATABASE_CONNECTION_STRATEGY must be alloydb or cloud_sql in production environments.")

        provider_fields = {
            "firebase_web_api_key",
            "vdocipher_api_secret",
            "vdocipher_live_create_url",
            "resend_api_key",
        }
        for field_name, env_name in REQUIRED_PRODUCTION_FIELDS:
            if self.dark_production_mode and field_name in provider_fields:
                continue
            value = getattr(self, field_name, "")
            if not str(value).strip():
                errors.append(f"{env_name} must be configured for production environments.")

        if not self.dark_production_mode:
            for field_name, env_name in CMI_PRODUCTION_FIELDS:
                if not str(getattr(self, field_name, "")).strip():
                    errors.append(f"{env_name} must be configured for the launch CMI checkout path.")
            errors.extend(_cmi_production_url_errors(self))

        storage_backend = self.media_storage_backend.strip().lower()
        if storage_backend != MEDIA_STORAGE_GCS:
            errors.append("MEDIA_STORAGE_BACKEND must be set to gcs in production environments.")
        if not self.media_gcs_bucket.strip():
            errors.append("MEDIA_GCS_BUCKET must be configured for production environments.")
        if int(self.media_gcs_signed_url_ttl_seconds) < 60:
            errors.append("MEDIA_GCS_SIGNED_URL_TTL_SECONDS must be at least 60 seconds.")
        if int(self.media_profile_quota_bytes) <= 0:
            errors.append("MEDIA_PROFILE_QUOTA_BYTES must be greater than zero.")
        if int(self.media_chat_conversation_quota_bytes) <= 0:
            errors.append("MEDIA_CHAT_CONVERSATION_QUOTA_BYTES must be greater than zero.")
        if int(self.max_request_body_bytes) <= 0:
            errors.append("MAX_REQUEST_BODY_BYTES must be greater than zero.")
        if len(self.realtime_outbox_secret.strip()) < 32:
            errors.append("REALTIME_OUTBOX_SECRET must be configured with at least 32 characters.")
        if not self.dark_production_mode and not _is_shared_rate_limit_storage_uri(self.rate_limit_storage_uri):
            errors.append("KRESCO_RATE_LIMIT_STORAGE_URI must point to a shared rate-limit store in production environments.")

        if _is_local_origin(self.frontend_url):
            errors.append("FRONTEND_URL must not point to localhost in production environments.")

        if self.auth_cookie_samesite.strip().lower() not in {"lax", "strict", "none"}:
            errors.append("AUTH_COOKIE_SAMESITE must be one of lax, strict, or none.")

        if any(_is_local_origin(origin) for origin in self.cors_origins_list):
            errors.append("CORS_ALLOWED_ORIGINS must not include localhost origins in production environments.")

        if any(_is_permissive_origin(origin) for origin in self.cors_origins_list):
            errors.append("CORS_ALLOWED_ORIGINS must not include wildcard origins in production environments.")

        if "localhost" in self.cors_allow_origin_regex or "127" in self.cors_allow_origin_regex:
            errors.append("CORS_ALLOW_ORIGIN_REGEX must not allow localhost origins in production environments.")

        if _is_permissive_origin_regex(self.cors_allow_origin_regex):
            errors.append("CORS_ALLOW_ORIGIN_REGEX must be tightly scoped in production environments.")

        return errors

    @property
    def auth_cookie_samesite_value(self) -> str:
        normalized = self.auth_cookie_samesite.strip().lower()
        return normalized if normalized in {"lax", "strict", "none"} else "lax"

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", ".env"),
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings(**load_runtime_secret_overrides())


def load_runtime_secret_overrides(runtime_env: dict[str, str] | None = None) -> dict[str, object]:
    env = runtime_env if runtime_env is not None else os.environ
    gcp_secret_name = str(env.get(GCP_RUNTIME_SECRET_NAME_ENV, "")).strip()
    if gcp_secret_name:
        return _load_gcp_runtime_secret(gcp_secret_name)

    return {}


def _load_gcp_runtime_secret(secret_name: str) -> dict[str, object]:
    try:
        from google.cloud import secretmanager
    except Exception as exc:  # pragma: no cover - depends on deployed image deps
        raise RuntimeError("google-cloud-secret-manager is required to load GCP runtime configuration.") from exc

    client = secretmanager.SecretManagerServiceClient()
    try:
        response = client.access_secret_version(request={"name": secret_name})
    except Exception as exc:  # pragma: no cover - exercised against GCP in staging
        raise RuntimeError("Failed to load runtime configuration from Google Secret Manager.") from exc

    try:
        decoded = json.loads(response.payload.data.decode("utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("GCP runtime configuration secret must contain valid JSON.") from exc

    if not isinstance(decoded, dict):
        raise RuntimeError("GCP runtime configuration secret must contain a JSON object.")

    return {
        RUNTIME_SECRET_KEY_ALIASES.get(str(key), str(key)): value
        for key, value in decoded.items()
        if value is not None
    }


def validate_production_settings(settings: Settings) -> None:
    errors = settings.production_config_errors()
    if errors:
        joined = " ".join(errors)
        raise ValueError(f"Production configuration is incomplete: {joined}")


def _is_sqlite_database_url(value: str) -> bool:
    return value.strip().lower().startswith("sqlite")


def _is_postgres_database_url(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized.startswith("postgresql://") or normalized.startswith("postgres://") or normalized.startswith("postgresql+asyncpg://")


def _database_sslmode(value: str) -> str:
    from urllib.parse import parse_qs, urlparse

    parsed = urlparse(value.strip())
    return parse_qs(parsed.query).get("sslmode", [""])[0].strip().lower()


def _is_cloud_sql_socket_database_url(value: str) -> bool:
    return "/cloudsql/" in value.strip()


def _is_readable_trust_store(value: str) -> bool:
    try:
        cleaned = value.strip().lower()
        if cleaned in {"certifi", "system", "default"}:
            return True
        path = Path(value).expanduser()
        return path.is_file()
    except OSError:
        return False


def _is_local_origin(value: str) -> bool:
    normalized = value.strip().lower()
    return (
        normalized.startswith("http://localhost")
        or normalized.startswith("https://localhost")
        or normalized.startswith("http://127.0.0.1")
        or normalized.startswith("https://127.0.0.1")
        or normalized.startswith("http://[::1]")
        or normalized.startswith("https://[::1]")
    )


def _cmi_production_url_errors(settings: Settings) -> list[str]:
    checks = (
        ("CMI_PAYMENT_URL", settings.cmi_payment_url, True),
        ("CMI_OK_URL", settings.cmi_ok_url, False),
        ("CMI_FAIL_URL", settings.cmi_fail_url, False),
        ("CMI_CALLBACK_URL", settings.cmi_callback_url, False),
    )
    errors: list[str] = []
    for name, value, require_cmi_host in checks:
        normalized = value.strip()
        if not normalized:
            continue
        errors.extend(_public_https_url_errors(normalized, name=name, require_cmi_host=require_cmi_host))
    return errors


def _public_https_url_errors(value: str, *, name: str, require_cmi_host: bool = False) -> list[str]:
    import ipaddress
    from urllib.parse import urlparse

    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname:
        return [f"{name} must be an HTTPS URL"]
    if hostname == "localhost" or hostname.endswith(".localhost") or "." not in hostname:
        return [f"{name} must be publicly reachable"]
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            return [f"{name} must be publicly reachable"]
    if require_cmi_host and not (hostname == "cmi.co.ma" or hostname.endswith(".cmi.co.ma")):
        return ["CMI_PAYMENT_URL must use a CMI gateway host"]
    return []


def _is_permissive_origin(value: str) -> bool:
    return value.strip() == "*"


def _is_permissive_origin_regex(value: str) -> bool:
    normalized = value.strip()
    if not normalized:
        return False
    compact = normalized.replace(" ", "")
    if compact in {"*", ".*", "^.*$", "https?://.*", "^https?://.*$", "^https://.*$", "^http://.*$"}:
        return True
    return ".*" in compact or ".+" in compact


def _is_shared_rate_limit_storage_uri(value: str) -> bool:
    normalized = value.strip().lower()
    return bool(normalized) and not normalized.startswith("memory://")


def _is_disallowed_jwt_secret(value: str) -> bool:
    normalized = value.strip().lower()
    return (
        normalized in DISALLOWED_JWT_SECRETS
        or len(value.strip()) < 32
        or any(marker in normalized for marker in DISALLOWED_JWT_SECRET_MARKERS)
    )


def _is_valid_release_sha(value: str) -> bool:
    normalized = value.strip().lower()
    if len(normalized) < 7:
        return False
    return normalized not in {"development", "local", "unknown", "placeholder", "change-me"}
