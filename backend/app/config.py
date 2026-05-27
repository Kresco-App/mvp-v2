from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
FALLBACK_JWT_SECRET = "fallback-secret-change-in-production"
LOCAL_DATABASE_URL = "sqlite+aiosqlite:///./db.sqlite3"
PRODUCTION_ENVIRONMENTS = {"production", "prod", "staging"}

REQUIRED_PRODUCTION_FIELDS: tuple[tuple[str, str], ...] = (
    ("google_client_id", "GOOGLE_CLIENT_ID"),
    ("vdocipher_api_secret", "VDOCIPHER_API_SECRET"),
    ("vdocipher_api_base_url", "VDOCIPHER_API_BASE_URL"),
    ("vdocipher_live_create_url", "VDOCIPHER_LIVE_CREATE_URL"),
    ("stripe_sk", "STRIPE_SK"),
    ("stripe_product_id", "STRIPE_PRODUCT_ID"),
    ("stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET"),
    ("resend_api_key", "RESEND_API_KEY"),
    ("ably_api_key", "ABLY_API_KEY"),
)
MEDIA_STORAGE_LOCAL = "local"
MEDIA_STORAGE_S3 = "s3"
MEDIA_STORAGE_S3_MOCK = "s3-mock"


class Settings(BaseSettings):
    environment: str = Field(
        default="development",
        validation_alias=AliasChoices("environment", "KRESCO_ENV", "APP_ENV", "ENVIRONMENT", "ENV"),
    )
    database_url: str = Field(
        default=LOCAL_DATABASE_URL,
        validation_alias=AliasChoices("database_url", "DATABASE_URL"),
    )
    database_connection_strategy: str = Field(
        default="direct",
        validation_alias=AliasChoices("database_connection_strategy", "DATABASE_CONNECTION_STRATEGY"),
    )
    pgsslrootcert: str = Field(
        default=str(BACKEND_DIR / "certs" / "rds-global-bundle.pem"),
        validation_alias=AliasChoices("pgsslrootcert", "PGSSLROOTCERT"),
    )
    jwt_secret_key: str = Field(
        default=FALLBACK_JWT_SECRET,
        validation_alias=AliasChoices("jwt_secret_key", "JWT_SECRET_KEY"),
    )
    jwt_algorithm: str = Field(default="HS256", validation_alias=AliasChoices("jwt_algorithm", "JWT_ALGORITHM"))
    jwt_expire_minutes: int = Field(default=10080, validation_alias=AliasChoices("jwt_expire_minutes", "JWT_EXPIRE_MINUTES"))
    google_client_id: str = Field(default="", validation_alias=AliasChoices("google_client_id", "GOOGLE_CLIENT_ID"))
    vdocipher_api_secret: str = Field(default="", validation_alias=AliasChoices("vdocipher_api_secret", "VDOCIPHER_API_SECRET"))
    vdocipher_api_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("vdocipher_api_base_url", "VDOCIPHER_API_BASE_URL"),
    )
    vdocipher_live_create_url: str = Field(
        default="",
        validation_alias=AliasChoices("vdocipher_live_create_url", "VDOCIPHER_LIVE_CREATE_URL"),
    )
    stripe_sk: str = Field(default="", validation_alias=AliasChoices("stripe_sk", "STRIPE_SK", "STRIPE_SECRET_KEY"))
    stripe_pk: str = Field(
        default="",
        validation_alias=AliasChoices("stripe_pk", "STRIPE_PK", "STRIPE_PUBLISHABLE_KEY"),
    )
    stripe_product_id: str = Field(default="", validation_alias=AliasChoices("stripe_product_id", "STRIPE_PRODUCT_ID"))
    stripe_webhook_secret: str = Field(
        default="",
        validation_alias=AliasChoices("stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET"),
    )
    cors_allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002",
        validation_alias=AliasChoices("cors_allowed_origins", "CORS_ALLOWED_ORIGINS"),
    )
    cors_allow_origin_regex: str = Field(
        default=r"^https?://(localhost|127\.0\.0\.1):\d+$",
        validation_alias=AliasChoices("cors_allow_origin_regex", "CORS_ALLOW_ORIGIN_REGEX"),
    )
    frontend_url: str = Field(default="http://localhost:3000", validation_alias=AliasChoices("frontend_url", "FRONTEND_URL"))
    debug: bool = Field(default=False, validation_alias=AliasChoices("debug", "DEBUG"))
    resend_api_key: str = Field(default="", validation_alias=AliasChoices("resend_api_key", "RESEND_API_KEY"))
    ably_api_key: str = Field(default="", validation_alias=AliasChoices("ably_api_key", "ABLY_API_KEY"))
    ably_token_ttl_seconds: int = Field(
        default=3600,
        validation_alias=AliasChoices("ably_token_ttl_seconds", "ABLY_TOKEN_TTL_SECONDS"),
    )
    realtime_outbox_secret: str = Field(
        default="",
        validation_alias=AliasChoices("realtime_outbox_secret", "REALTIME_OUTBOX_SECRET"),
    )
    media_storage_backend: str = Field(
        default=MEDIA_STORAGE_LOCAL,
        validation_alias=AliasChoices("media_storage_backend", "MEDIA_STORAGE_BACKEND"),
    )
    media_s3_bucket: str = Field(default="", validation_alias=AliasChoices("media_s3_bucket", "MEDIA_S3_BUCKET"))
    media_s3_region: str = Field(default="", validation_alias=AliasChoices("media_s3_region", "MEDIA_S3_REGION", "AWS_REGION"))
    media_s3_prefix: str = Field(default="media", validation_alias=AliasChoices("media_s3_prefix", "MEDIA_S3_PREFIX"))
    media_s3_endpoint_url: str = Field(default="", validation_alias=AliasChoices("media_s3_endpoint_url", "MEDIA_S3_ENDPOINT_URL"))
    media_s3_mock_root: str = Field(default=".mock-s3", validation_alias=AliasChoices("media_s3_mock_root", "MEDIA_S3_MOCK_ROOT"))
    media_s3_presign_ttl_seconds: int = Field(
        default=300,
        validation_alias=AliasChoices("media_s3_presign_ttl_seconds", "MEDIA_S3_PRESIGN_TTL_SECONDS"),
    )
    media_profile_quota_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias=AliasChoices("media_profile_quota_bytes", "MEDIA_PROFILE_QUOTA_BYTES"),
    )
    media_chat_conversation_quota_bytes: int = Field(
        default=50 * 1024 * 1024,
        validation_alias=AliasChoices("media_chat_conversation_quota_bytes", "MEDIA_CHAT_CONVERSATION_QUOTA_BYTES"),
    )
    media_s3_lifecycle_expiration_days: int = Field(
        default=365,
        validation_alias=AliasChoices("media_s3_lifecycle_expiration_days", "MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS"),
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_lambda(self) -> bool:
        import os
        return bool(os.environ.get("LAMBDA_TASK_ROOT"))

    @property
    def is_production_like(self) -> bool:
        return self.is_lambda or self.environment.strip().lower() in PRODUCTION_ENVIRONMENTS

    def production_config_errors(self) -> list[str]:
        if not self.is_production_like:
            return []

        errors: list[str] = []

        if self.jwt_secret_key == FALLBACK_JWT_SECRET or len(self.jwt_secret_key.strip()) < 32:
            errors.append("JWT_SECRET_KEY must be configured to a non-default secret with at least 32 characters.")

        if _is_sqlite_database_url(self.database_url):
            errors.append("DATABASE_URL must point to a production database, not a local SQLite database.")
        elif not _is_postgres_database_url(self.database_url):
            errors.append("DATABASE_URL must use PostgreSQL in production environments.")
        else:
            sslmode = _database_sslmode(self.database_url)
            if sslmode != "verify-full":
                errors.append("DATABASE_URL must include sslmode=verify-full in production environments.")
            if not _is_readable_file(self.pgsslrootcert):
                errors.append("PGSSLROOTCERT must point to the bundled readable RDS CA PEM file.")

        if self.database_connection_strategy.strip().lower() != "rds_proxy":
            errors.append("DATABASE_CONNECTION_STRATEGY must be rds_proxy in production environments.")

        for field_name, env_name in REQUIRED_PRODUCTION_FIELDS:
            value = getattr(self, field_name, "")
            if not str(value).strip():
                errors.append(f"{env_name} must be configured for production environments.")

        storage_backend = self.media_storage_backend.strip().lower()
        if storage_backend != MEDIA_STORAGE_S3:
            errors.append("MEDIA_STORAGE_BACKEND must be set to s3 in production environments.")
        if not self.media_s3_bucket.strip():
            errors.append("MEDIA_S3_BUCKET must be configured for production environments.")
        if not self.media_s3_region.strip():
            errors.append("MEDIA_S3_REGION or AWS_REGION must be configured for production environments.")
        if self.media_s3_endpoint_url.strip() and _is_local_origin(self.media_s3_endpoint_url):
            errors.append("MEDIA_S3_ENDPOINT_URL must not point to localhost in production environments.")
        if int(self.media_s3_presign_ttl_seconds) < 60:
            errors.append("MEDIA_S3_PRESIGN_TTL_SECONDS must be at least 60 seconds.")
        if int(self.media_profile_quota_bytes) <= 0:
            errors.append("MEDIA_PROFILE_QUOTA_BYTES must be greater than zero.")
        if int(self.media_chat_conversation_quota_bytes) <= 0:
            errors.append("MEDIA_CHAT_CONVERSATION_QUOTA_BYTES must be greater than zero.")
        if int(self.media_s3_lifecycle_expiration_days) <= 0:
            errors.append("MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS must be greater than zero.")
        if len(self.realtime_outbox_secret.strip()) < 32:
            errors.append("REALTIME_OUTBOX_SECRET must be configured with at least 32 characters.")

        if _is_local_origin(self.frontend_url):
            errors.append("FRONTEND_URL must not point to localhost in production environments.")

        if any(_is_local_origin(origin) for origin in self.cors_origins_list):
            errors.append("CORS_ALLOWED_ORIGINS must not include localhost origins in production environments.")

        if any(_is_permissive_origin(origin) for origin in self.cors_origins_list):
            errors.append("CORS_ALLOWED_ORIGINS must not include wildcard origins in production environments.")

        if "localhost" in self.cors_allow_origin_regex or "127" in self.cors_allow_origin_regex:
            errors.append("CORS_ALLOW_ORIGIN_REGEX must not allow localhost origins in production environments.")

        if _is_permissive_origin_regex(self.cors_allow_origin_regex):
            errors.append("CORS_ALLOW_ORIGIN_REGEX must be tightly scoped in production environments.")

        return errors

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", ".env"),
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


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


def _is_readable_file(value: str) -> bool:
    try:
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
