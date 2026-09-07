"""
AeroCPI Security Module.
Implements:
- ARCHITECTURE.md Section 2 (PyJWT + Argon2 via argon2-cffi)
- User specifications (demo.analyst@aerocpi.local, SEED_ANALYST_PASSWORD)
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import hashlib
import secrets
import string
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from backend.app.config import settings

# Initialize Argon2 Password Hasher
ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,
    salt_len=16
)


def hash_password(password: str) -> str:
    """Hash a raw password using Argon2id."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an Argon2 hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, Exception):
        return False


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict[str, Any]]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def hash_api_key(key: str) -> str:
    """Hash an API key using SHA-256 for secure storage at rest."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate high-entropy personal API key.
    Returns: (full_plaintext_key, hashed_key, display_prefix)
    """
    raw_token = secrets.token_urlsafe(32)
    full_key = f"aero_live_{raw_token}"
    hashed = hash_api_key(full_key)
    prefix = f"{full_key[:14]}..."
    return full_key, hashed, prefix


def generate_temp_password(length: int = 14) -> str:
    """Generate a high-entropy temporary password with mixed charset."""
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    # Ensure at least one uppercase, one lowercase, one digit, one special
    password = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%^&*")
    ]
    password += [secrets.choice(chars) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(password)
    return "".join(password)

