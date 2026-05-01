from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./db.sqlite3"
    jwt_secret_key: str = "fallback-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080
    google_client_id: str = ""
    vdocipher_api_secret: str = ""
    stripe_sk: str = ""
    stripe_pk: str = ""
    stripe_product_id: str = ""
    stripe_webhook_secret: str = ""
    cors_allowed_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"
    debug: bool = False
    resend_api_key: str = ""
    resend_from_email: str = "Kresco <onboarding@resend.dev>"
    # Set to true in .env during local development to skip email verification
    dev_skip_email_verification: bool = False

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
