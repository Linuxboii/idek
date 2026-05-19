import pytest
from datetime import timedelta
from jose import JWTError

from app.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token,
)


def test_hash_and_verify_password():
    hashed = hash_password("secret123")
    assert hashed != "secret123"
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip():
    token = create_access_token({"sub": "user-uuid", "role": "admin", "name": "Alice"})
    payload = decode_token(token)
    assert payload["sub"] == "user-uuid"
    assert payload["role"] == "admin"
    assert payload["type"] == "access"


def test_refresh_token_roundtrip():
    token = create_refresh_token({"sub": "user-uuid"})
    payload = decode_token(token)
    assert payload["sub"] == "user-uuid"
    assert payload["type"] == "refresh"


def test_expired_token_raises():
    token = create_access_token({"sub": "u"}, expires_delta=timedelta(seconds=-1))
    with pytest.raises(JWTError):
        decode_token(token)
