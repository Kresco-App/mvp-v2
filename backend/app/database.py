from urllib.parse import urlparse, urlunparse, urlencode, parse_qs

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

_engine = None
_session_factory = None


def _build_async_url(url: str) -> tuple[str, dict]:
    """Convert a standard DB URL to asyncpg-compatible URL, returning (url, connect_args).

    asyncpg doesn't accept sslmode as a URL parameter — it must be in connect_args.
    """
    connect_args: dict = {}

    if url.startswith("postgresql://") or url.startswith("postgres://"):
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)

        # Extract sslmode before it confuses asyncpg
        sslmode = qs.pop("sslmode", [None])[0]
        if sslmode == "require":
            connect_args["ssl"] = "require"

        clean_query = urlencode({k: v[0] for k, v in qs.items()})
        clean_parsed = parsed._replace(
            scheme="postgresql+asyncpg",
            query=clean_query,
        )
        return urlunparse(clean_parsed), connect_args

    return url, connect_args


def init_engine(database_url: str, is_lambda: bool = False):
    global _engine, _session_factory
    if _engine is not None:
        return _engine, _session_factory

    async_url, connect_args = _build_async_url(database_url)

    # NullPool is mandatory on Lambda: connections must not persist between invocations.
    # On local dev it also works fine (slightly slower than pooling but avoids stale connections).
    _engine = create_async_engine(
        async_url,
        poolclass=NullPool,
        echo=False,
        connect_args=connect_args,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)
    return _engine, _session_factory


def get_session_factory():
    return _session_factory
