import hashlib
import hmac
import os

from starlette.concurrency import run_in_threadpool

LEGACY_UNUSABLE_PASSWORD = "!"
UNUSABLE_PASSWORD_PREFIX = "unusable$"


def make_unusable_password() -> str:
    return f"{UNUSABLE_PASSWORD_PREFIX}{os.urandom(16).hex()}"


def is_unusable_password(stored: str | None) -> bool:
    return not stored or stored == LEGACY_UNUSABLE_PASSWORD or stored.startswith(UNUSABLE_PASSWORD_PREFIX)


def hash_password(plain: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
    return salt.hex() + ":" + dk.hex()


def verify_password(plain: str, stored: str) -> bool:
    if is_unusable_password(stored):
        return False
    try:
        salt_hex, dk_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        dk = bytes.fromhex(dk_hex)
        new_dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
        return hmac.compare_digest(dk, new_dk)
    except Exception:
        return False


async def hash_password_async(plain: str) -> str:
    return await run_in_threadpool(hash_password, plain)


async def verify_password_async(plain: str, stored: str) -> bool:
    return await run_in_threadpool(verify_password, plain, stored)
