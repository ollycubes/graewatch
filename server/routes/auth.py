"""
POST /api/auth/register   — create a new account
POST /api/auth/login      — authenticate and return a JWT
GET  /api/auth/me         — return the current user's profile (protected)
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from utils.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter()

db: AsyncIOMotorDatabase | None = None


# ── Request / Response models ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/auth/register", status_code=201)
async def register(payload: RegisterRequest):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    # Validate password length
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    # Check for existing user
    existing = await db["users"].find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    # Create user document
    doc = {
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "display_name": payload.display_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db["users"].insert_one(doc)
    user_id = str(result.inserted_id)

    # Auto-login after registration
    token = create_access_token(user_id, payload.email)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": payload.email,
            "display_name": payload.display_name,
        },
    }


@router.post("/api/auth/login")
async def login(payload: LoginRequest):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    user = await db["users"].find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(user["_id"])
    token = create_access_token(user_id, payload.email)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user["email"],
            "display_name": user["display_name"],
        },
    }


@router.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    from bson import ObjectId

    user = await db["users"].find_one(
        {"_id": ObjectId(current_user["sub"])},
        {"_id": 1, "email": 1, "display_name": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "display_name": user["display_name"],
    }
