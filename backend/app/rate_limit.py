import os
from functools import lru_cache
from ipaddress import ip_address, ip_network

from slowapi import Limiter

DEFAULT_RATE_LIMITS_ENV = "KRESCO_DEFAULT_RATE_LIMITS"
APPLICATION_RATE_LIMITS_ENV = "KRESCO_APPLICATION_RATE_LIMITS"
TRUSTED_PROXY_IPS_ENV = "KRESCO_TRUSTED_PROXY_IPS"


def _rate_limit_values(raw: str, fallback: str) -> list[str]:
    values = [value.strip() for value in raw.split(",") if value.strip()]
    return values or [fallback]


DEFAULT_RATE_LIMITS = _rate_limit_values(os.environ.get(DEFAULT_RATE_LIMITS_ENV, ""), "120/minute")
APPLICATION_RATE_LIMITS = _rate_limit_values(os.environ.get(APPLICATION_RATE_LIMITS_ENV, ""), "600/minute")


def _client_host(request) -> str:
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "")


@lru_cache(maxsize=16)
def _trusted_proxy_networks_for(raw: str):
    networks = []
    for item in raw.split(","):
        value = item.strip()
        if not value:
            continue
        try:
            networks.append(ip_network(value, strict=False))
        except ValueError:
            continue
    return networks


def _trusted_proxy_networks():
    return _trusted_proxy_networks_for(os.environ.get(TRUSTED_PROXY_IPS_ENV, ""))


def _is_trusted_proxy(host: str) -> bool:
    try:
        peer_ip = ip_address(host)
    except ValueError:
        return False
    return any(peer_ip in network for network in _trusted_proxy_networks())


def _first_forwarded_for_ip(header_value: str) -> str | None:
    parsed_candidates = []
    for candidate in header_value.split(","):
        value = candidate.strip()
        if not value:
            continue
        try:
            parsed_candidates.append(ip_address(value))
        except ValueError:
            continue
    if not parsed_candidates:
        return None

    trusted_networks = _trusted_proxy_networks()
    for candidate in reversed(parsed_candidates):
        if not any(candidate in network for network in trusted_networks):
            return str(candidate)
    return str(parsed_candidates[0])


def trusted_remote_address(request) -> str:
    host = _client_host(request)
    if not _is_trusted_proxy(host):
        return host

    forwarded_for = request.headers.get("x-forwarded-for", "")
    return _first_forwarded_for_ip(forwarded_for) or host

RATE_LIMIT_STORAGE_URI_ENV = "KRESCO_RATE_LIMIT_STORAGE_URI"
# Shared store (e.g. redis://...) makes limits global across Lambda containers.
# Defaults to in-memory for local/dev; production validation requires a shared URI.
_rate_limit_storage_uri = os.environ.get(RATE_LIMIT_STORAGE_URI_ENV, "").strip() or "memory://"

limiter = Limiter(
    key_func=trusted_remote_address,
    default_limits=DEFAULT_RATE_LIMITS,
    application_limits=APPLICATION_RATE_LIMITS,
    storage_uri=_rate_limit_storage_uri,
)
