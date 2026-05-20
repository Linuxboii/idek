from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Query, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001"
_ADMIN_USER = {"id": ADMIN_USER_ID, "role": "admin", "name": "Admin"}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _make_token(data: dict, expire: datetime) -> str:
    return jwt.encode({**data, "exp": expire}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    delta = expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _make_token({**data, "type": "access"}, datetime.now(timezone.utc) + delta)


def create_refresh_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _make_token({**data, "type": "refresh"}, expire)


def decode_token(token: str) -> dict:
    """Raises JWTError if invalid or expired."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    if token == settings.ADMIN_TOKEN:
        return _ADMIN_USER
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise JWTError("not access token")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"id": sub, "role": role, "name": payload.get("name", "")}


async def get_ws_user(token: str = Query(...)) -> dict:
    if token == settings.ADMIN_TOKEN:
        return _ADMIN_USER
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise JWTError()
    except JWTError:
        raise HTTPException(status_code=403, detail="Invalid token")
    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or not role:
        raise HTTPException(status_code=403, detail="Invalid token")
    return {"id": sub, "role": role, "name": payload.get("name", "")}


async def get_media_user(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
) -> dict:
    actual_token = token
    if authorization and authorization.lower().startswith("bearer "):
        actual_token = authorization.split(" ")[1]

    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing token",
        )

    if actual_token == settings.ADMIN_TOKEN:
        return _ADMIN_USER
    try:
        payload = decode_token(actual_token)
        if payload.get("type") != "access":
            raise JWTError("not access token")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return {"id": sub, "role": role, "name": payload.get("name", "")}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
