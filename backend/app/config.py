from functools import lru_cache
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(
        default="sqlite+aiosqlite:///./db.sqlite3",
        validation_alias=AliasChoices("DATABASE_URL"),
    )
    jwt_secret_key: str = Field(
        default="fallback-secret-change-in-production",
        validation_alias=AliasChoices("JWT_SECRET_KEY"),
    )
    jwt_algorithm: str = Field(default="HS256", validation_alias=AliasChoices("JWT_ALGORITHM"))
    jwt_expire_minutes: int = Field(default=10080, validation_alias=AliasChoices("JWT_EXPIRE_MINUTES"))
    google_client_id: str = Field(default="", validation_alias=AliasChoices("GOOGLE_CLIENT_ID"))
    vdocipher_api_secret: str = Field(default="", validation_alias=AliasChoices("VDOCIPHER_API_SECRET"))
    stripe_sk: str = Field(default="", validation_alias=AliasChoices("STRIPE_SK", "STRIPE_SECRET_KEY"))
    stripe_pk: str = Field(
        default="",
        validation_alias=AliasChoices("STRIPE_PK", "STRIPE_PUBLISHABLE_KEY"),
    )
    stripe_product_id: str = Field(default="", validation_alias=AliasChoices("STRIPE_PRODUCT_ID"))
    stripe_webhook_secret: str = Field(
        default="",
        validation_alias=AliasChoices("STRIPE_WEBHOOK_SECRET"),
    )
    cors_allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
        validation_alias=AliasChoices("CORS_ALLOWED_ORIGINS"),
    )
    frontend_url: str = Field(default="http://localhost:3000", validation_alias=AliasChoices("FRONTEND_URL"))
    debug: bool = Field(default=False, validation_alias=AliasChoices("DEBUG"))
    resend_api_key: str = Field(default="", validation_alias=AliasChoices("RESEND_API_KEY"))
    admin_password: str = Field(default="", validation_alias=AliasChoices("ADMIN_PASSWORD"))

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_lambda(self) -> bool:
        import os
        return bool(os.environ.get("LAMBDA_TASK_ROOT"))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
