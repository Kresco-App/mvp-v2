import os
from ipaddress import ip_address, ip_network

from slowapi import Limiter

DEFAULT_RATE_LIMITS = ["120/minute"]
APPLICATION_RATE_LIMITS = ["600/minute"]
TRUSTED_PROXY_IPS_ENV = "KRESCO_TRUSTED_PROXY_IPS"


def _client_host(request) -> str:
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "")


def _trusted_proxy_networks():
    raw = os.environ.get(TRUSTED_PROXY_IPS_ENV, "")
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


def _is_trusted_proxy(host: str) -> bool:
    try:
        peer_ip = ip_address(host)
    except ValueError:
        return False
    return any(peer_ip in network for network in _trusted_proxy_networks())


def _first_forwarded_for_ip(header_value: str) -> str | None:
    for candidate in header_value.split(","):
        value = candidate.strip()
        if not value:
            continue
        try:
            return str(ip_address(value))
        except ValueError:
            return None
    return None


def trusted_remote_address(request) -> str:
    host = _client_host(request)
    if not _is_trusted_proxy(host):
        return host

    forwarded_for = request.headers.get("x-forwarded-for", "")
    return _first_forwarded_for_ip(forwarded_for) or host

limiter = Limiter(
    key_func=trusted_remote_address,
    default_limits=DEFAULT_RATE_LIMITS,
    application_limits=APPLICATION_RATE_LIMITS,
)
