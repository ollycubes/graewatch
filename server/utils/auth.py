"""
Authentication utilities: password hashing, JWT creation/validation,
and FastAPI dependencies for extracting the current user from requests.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import Depends, HTTPException, Request
import bcrypt
from jose import JWTError, jwt

# ── Password hashing ─────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the plain-text password."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plain-text password against a stored bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT tokens ────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


def _get_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    return secret


def create_access_token(user_id: str, email: str) -> str:
    """Create a signed JWT containing the user's id and email."""
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, _get_secret(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT. Raises JWTError on failure."""
    return jwt.decode(token, _get_secret(), algorithms=[ALGORITHM])


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def _extract_token(request: Request) -> str | None:
    """Pull the Bearer token from the Authorization header, if present."""
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(request: Request) -> dict:
    """
    Dependency that requires a valid JWT.
    Returns the decoded payload dict with keys: sub, email.
    Raises 401 if the token is missing or invalid.
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


async def get_optional_user(request: Request) -> dict | None:
    """
    Dependency that returns the decoded JWT payload if a valid token is present,
    or None if no token is provided. Does NOT raise on missing token.
    """
    token = _extract_token(request)
    if not token:
        return None
    try:
        return decode_access_token(token)
    except JWTError:
        return None
