import os
from pathlib import Path
import ssl
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

_engine = None
_session_factory = None
_engine_cache_key = None

_POSTGRES_SSLMODES = {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}


def _is_postgres_url(url: str) -> bool:
    return url.startswith("postgresql://") or url.startswith("postgres://") or url.startswith("postgresql+")


def _build_async_url(url: str, pgsslrootcert: str | None = None) -> tuple[str, dict]:
    """Convert a standard DB URL to an async SQLAlchemy URL."""
    connect_args: dict = {}
    url = _quote_postgres_url_credentials(url.strip())

    if _is_postgres_url(url):
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)

        # SQLAlchemy's asyncpg dialect forwards query params as keyword args.
        # Strip libpq-style SSL keys and translate them into asyncpg's `ssl`.
        sslmode = qs.pop("sslmode", [None])[0]
        sslrootcert = qs.pop("sslrootcert", [None])[0] or pgsslrootcert or os.environ.get("PGSSLROOTCERT", "")
        socket_host = qs.pop("host", [None])[0]
        if socket_host and socket_host.startswith("/cloudsql/"):
            connect_args["host"] = socket_host
        if sslmode:
            sslmode = sslmode.lower()
            if sslmode not in _POSTGRES_SSLMODES:
                supported = ", ".join(sorted(_POSTGRES_SSLMODES))
                raise ValueError(
                    f"Unsupported PostgreSQL sslmode '{sslmode}'. Expected one of: {supported}."
                )
            connect_args["ssl"] = _ssl_for_postgres(sslmode, sslrootcert)

        clean_query = urlencode({k: v[0] for k, v in qs.items()})
        clean_parsed = parsed._replace(
            scheme="postgresql+asyncpg",
            query=clean_query,
        )
        return urlunparse(clean_parsed), connect_args

    return url, connect_args


def _quote_postgres_url_credentials(url: str) -> str:
    """Percent-encode PostgreSQL credentials while preserving already encoded values."""
    if not _is_postgres_url(url):
        return url
    if "://" not in url or "@" not in url:
        return url

    scheme, rest = url.split("://", 1)
    userinfo, location = rest.rsplit("@", 1)
    if ":" not in userinfo:
        return url

    username, password = userinfo.split(":", 1)
    if not username:
        return url

    quoted_username = quote(unquote(username), safe="")
    quoted_password = quote(unquote(password), safe="")
    return f"{scheme}://{quoted_username}:{quoted_password}@{location}"


def _ssl_for_postgres(sslmode: str, sslrootcert: str = "") -> bool | ssl.SSLContext:
    if sslmode == "disable":
        return False
    if sslmode in {"allow", "prefer", "require"}:
        return True

    cafile = _resolve_sslrootcert(sslrootcert)
    context = ssl.create_default_context(cafile=str(cafile) if cafile else None)
    context.verify_mode = ssl.CERT_REQUIRED
    context.check_hostname = sslmode == "verify-full"
    return context


def _resolve_sslrootcert(value: str) -> Path | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.lower() == "certifi":
        import certifi

        return Path(certifi.where())
    if cleaned.lower() in {"system", "default"}:
        return None
    return Path(cleaned).expanduser()


def _safe_url_for_error(url: str) -> str:
    parsed = urlparse(url)
    if parsed.password is None:
        return url
    netloc = parsed.netloc.replace(f":{parsed.password}@", ":***@")
    return urlunparse(parsed._replace(netloc=netloc))


def _is_configured_test_database_url(database_url: str) -> bool:
    test_database_url = os.environ.get("KRESCO_TEST_DATABASE_URL", "").strip()
    return bool(test_database_url) and database_url.strip() == test_database_url


def init_engine(
    database_url: str,
    pgsslrootcert: str | None = None,
    *,
    use_null_pool: bool = False,
    pool_size: int = 10,
    max_overflow: int = 20,
    pool_timeout: int = 30,
):
    global _engine, _session_factory, _engine_cache_key

    async_url, connect_args = _build_async_url(database_url, pgsslrootcert)
    uses_test_database = _is_configured_test_database_url(database_url)
    normalized_pool_size = max(1, int(pool_size))
    normalized_max_overflow = max(0, int(max_overflow))
    normalized_pool_timeout = max(1, int(pool_timeout))
    uses_direct_pool = not async_url.startswith("sqlite+aiosqlite") and not use_null_pool and not uses_test_database
    pool_cache_key = (
        normalized_pool_size,
        normalized_max_overflow,
        normalized_pool_timeout,
    ) if uses_direct_pool else (None, None, None)
    cache_pgsslrootcert = "" if async_url.startswith("sqlite") else str(pgsslrootcert or os.environ.get("PGSSLROOTCERT", ""))
    cache_key = (async_url, use_null_pool, cache_pgsslrootcert, *pool_cache_key)
    if _engine is not None and _engine_cache_key == cache_key:
        return _engine, _session_factory
    if _engine is not None:
        (
            current_url,
            current_use_null_pool,
            _current_pgsslrootcert,
            current_pool_size,
            current_max_overflow,
            current_pool_timeout,
        ) = _engine_cache_key
        raise RuntimeError(
            "Database engine already initialized for "
            f"{_safe_url_for_error(current_url)} "
            f"(use_null_pool={current_use_null_pool}, pool_size={current_pool_size}, "
            f"max_overflow={current_max_overflow}, pool_timeout={current_pool_timeout}); "
            f"refusing to reuse it for {_safe_url_for_error(async_url)} "
            f"(use_null_pool={use_null_pool}, pool_size={pool_cache_key[0]}, "
            f"max_overflow={pool_cache_key[1]}, pool_timeout={pool_cache_key[2]}). "
            "Call reset_engine() before switching databases."
        )

    engine_kwargs = {
        "echo": False,
        "connect_args": connect_args,
        "pool_pre_ping": True,
    }

    if async_url.startswith("sqlite+aiosqlite"):
        engine_kwargs["connect_args"] = {**connect_args, "timeout": 30}
    elif use_null_pool or uses_test_database:
        # Pytest's TestClient and helper fixtures span multiple event loops;
        # asyncpg pooled connections cannot be safely reused across those loops.
        engine_kwargs["poolclass"] = NullPool
    else:
        engine_kwargs["pool_recycle"] = 1800
        engine_kwargs["pool_size"] = normalized_pool_size
        engine_kwargs["max_overflow"] = normalized_max_overflow
        engine_kwargs["pool_timeout"] = normalized_pool_timeout

    _engine = create_async_engine(async_url, **engine_kwargs)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)
    _engine_cache_key = cache_key
    return _engine, _session_factory


def get_session_factory():
    return _session_factory


async def reset_engine() -> None:
    global _engine, _session_factory, _engine_cache_key
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
    _engine_cache_key = None


from typing import TypeVar, Type
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

T = TypeVar("T")

async def get_or_create(
    db: AsyncSession,
    model: Type[T],
    defaults: dict | None = None,
    **kwargs
) -> tuple[T, bool]:
    stmt = select(model).filter_by(**kwargs).with_for_update()
    instance = await db.scalar(stmt)
    if instance is not None:
        return instance, False

    params = {**kwargs, **(defaults or {})}
    instance = model(**params)
    try:
        async with db.begin_nested():
            db.add(instance)
            await db.flush()
        return instance, True
    except IntegrityError:
        instance = await db.scalar(stmt)
        if instance is None:
            raise
        return instance, False
