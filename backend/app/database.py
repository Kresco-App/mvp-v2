from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

_engine = None
_session_factory = None
_engine_cache_key = None

_POSTGRES_SSLMODES = {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}


def _build_async_url(url: str) -> tuple[str, dict]:
    """Convert a standard DB URL to an async SQLAlchemy URL."""
    connect_args: dict = {}

    if url.startswith("postgresql://") or url.startswith("postgres://"):
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)

        # SQLAlchemy's asyncpg dialect forwards query params as keyword args,
        # while asyncpg expects libpq-style ssl modes in the `ssl` argument.
        sslmode = qs.pop("sslmode", [None])[0]
        if sslmode:
            sslmode = sslmode.lower()
            if sslmode not in _POSTGRES_SSLMODES:
                supported = ", ".join(sorted(_POSTGRES_SSLMODES))
                raise ValueError(
                    f"Unsupported PostgreSQL sslmode '{sslmode}'. Expected one of: {supported}."
                )
            connect_args["ssl"] = sslmode

        clean_query = urlencode({k: v[0] for k, v in qs.items()})
        clean_parsed = parsed._replace(
            scheme="postgresql+asyncpg",
            query=clean_query,
        )
        return urlunparse(clean_parsed), connect_args

    return url, connect_args


def _safe_url_for_error(url: str) -> str:
    parsed = urlparse(url)
    if parsed.password is None:
        return url
    netloc = parsed.netloc.replace(f":{parsed.password}@", ":***@")
    return urlunparse(parsed._replace(netloc=netloc))


def init_engine(database_url: str, is_lambda: bool = False):
    global _engine, _session_factory, _engine_cache_key

    async_url, connect_args = _build_async_url(database_url)
    cache_key = (async_url, is_lambda)
    if _engine is not None and _engine_cache_key == cache_key:
        return _engine, _session_factory
    if _engine is not None:
        current_url, current_is_lambda = _engine_cache_key
        raise RuntimeError(
            "Database engine already initialized for "
            f"{_safe_url_for_error(current_url)} (is_lambda={current_is_lambda}); "
            f"refusing to reuse it for {_safe_url_for_error(async_url)} "
            f"(is_lambda={is_lambda}). Call reset_engine() before switching databases."
        )

    engine_kwargs = {
        "echo": False,
        "connect_args": connect_args,
        "pool_pre_ping": True,
    }

    if async_url.startswith("sqlite+aiosqlite"):
        engine_kwargs["connect_args"] = {**connect_args, "timeout": 30}
    elif is_lambda:
        # Lambda should rely on RDS Proxy / short-lived connections rather than
        # pooled connections that survive across warm invocations.
        engine_kwargs["poolclass"] = NullPool
    else:
        engine_kwargs["pool_recycle"] = 1800

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
