import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# OWASP-recommended Argon2id settings that stay responsive on a small PC.
_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)

# No characters that look alike on paper.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def random_code(length: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def same_secret(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode("utf-8", "surrogateescape"), b.encode())
