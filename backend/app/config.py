from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    database_url: str = Field(
        default="sqlite+aiosqlite:///./db.sqlite3",
        validation_alias=AliasChoices("database_url", "DATABASE_URL"),
    )
    jwt_secret_key: str = Field(
        default="fallback-secret-change-in-production",
        validation_alias=AliasChoices("jwt_secret_key", "JWT_SECRET_KEY"),
    )
    jwt_algorithm: str = Field(default="HS256", validation_alias=AliasChoices("jwt_algorithm", "JWT_ALGORITHM"))
    jwt_expire_minutes: int = Field(default=10080, validation_alias=AliasChoices("jwt_expire_minutes", "JWT_EXPIRE_MINUTES"))
    google_client_id: str = Field(default="", validation_alias=AliasChoices("google_client_id", "GOOGLE_CLIENT_ID"))
    vdocipher_api_secret: str = Field(default="", validation_alias=AliasChoices("vdocipher_api_secret", "VDOCIPHER_API_SECRET"))
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
    admin_password: str = Field(default="", validation_alias=AliasChoices("admin_password", "ADMIN_PASSWORD"))

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_lambda(self) -> bool:
        import os
        return bool(os.environ.get("LAMBDA_TASK_ROOT"))

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", ".env"),
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
