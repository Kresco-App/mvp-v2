from __future__ import annotations

import hmac
import os
from urllib.parse import urlparse, urlunparse

LOCAL_SQLITE_SCHEMES = {"sqlite", "sqlite+aiosqlite", "sqlite+pysqlite"}
DESTRUCTIVE_SEED_CONFIRM_ENV = "KRESCO_CONFIRM_DESTRUCTIVE_SEED"


class UnsafeSeedDatabaseError(RuntimeError):
    pass


def require_local_seed_database_url(database_url: str, script_name: str) -> None:
    if is_local_seed_database_url(database_url):
        return

    raise UnsafeSeedDatabaseError(
        f"{script_name} is local/demo-only and refuses DATABASE_URL={redact_database_url(database_url)}. "
        "Use a sqlite:/// or sqlite+aiosqlite:/// local database for seed scripts."
    )


def require_local_seed_session(db, script_name: str) -> None:
    bind = db.get_bind()
    require_local_seed_database_url(str(getattr(bind, "url", "")), script_name)


def require_destructive_seed_database_url(database_url: str, script_name: str, *, confirmed: bool = False) -> None:
    require_local_seed_database_url(database_url, script_name)
    if confirmed:
        return

    expected = destructive_seed_confirmation_value(script_name, database_url)
    actual = os.environ.get(DESTRUCTIVE_SEED_CONFIRM_ENV, "")
    if hmac.compare_digest(actual, expected):
        return

    raise UnsafeSeedDatabaseError(
        f"{script_name} performs destructive local seed operations against DATABASE_URL={redact_database_url(database_url)}. "
        f"Set {DESTRUCTIVE_SEED_CONFIRM_ENV}={expected!r} for CLI use, or pass destructive_confirmed=True from code/tests."
    )


def require_destructive_seed_session(db, script_name: str, *, confirmed: bool = False) -> None:
    bind = db.get_bind()
    require_destructive_seed_database_url(str(getattr(bind, "url", "")), script_name, confirmed=confirmed)


def destructive_seed_confirmation_value(script_name: str, database_url: str) -> str:
    return f"{script_name}:{redact_database_url(database_url)}"


def is_local_seed_database_url(database_url: str) -> bool:
    if not database_url.strip():
        return False

    parsed = urlparse(database_url)
    return parsed.scheme in LOCAL_SQLITE_SCHEMES and parsed.netloc in {"", "localhost"}


def redact_database_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    if not parsed.netloc or "@" not in parsed.netloc:
        return database_url

    host = parsed.netloc.rsplit("@", 1)[1]
    return urlunparse(parsed._replace(netloc=f"<redacted>@{host}"))
