import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

pytestmark = pytest.mark.anyio


@pytest.fixture
def app():
    from app.main import app as _app
    return _app


@patch("app.crm_api.db")
async def test_login_success(mock_db, app):
    from app.auth import hash_password
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "user-uuid", "email": "admin@test.com",
        "password_hash": hash_password("password123"),
        "role": "admin", "name": "Admin", "active": True,
    })
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/auth/login", json={
            "email": "admin@test.com", "password": "password123"
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "refresh_token" in data
    assert data["user"]["role"] == "admin"


@patch("app.crm_api.db")
async def test_login_wrong_password(mock_db, app):
    from app.auth import hash_password
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "u", "password_hash": hash_password("correct"),
        "active": True, "role": "clerk", "name": "X",
    })
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/auth/login", json={
            "email": "x@test.com", "password": "wrong"
        })
    assert resp.status_code == 401


@patch("app.crm_api.db")
async def test_conversations_requires_auth(mock_db, app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/conversations")
    assert resp.status_code == 401


@patch("app.crm_api.db")
async def test_takeover_sets_paused(mock_db, app):
    from app.auth import create_access_token
    from app.ws_manager import ws_manager
    token = create_access_token({"sub": "agent-uuid", "role": "clerk", "name": "Alice"})
    mock_db.set_takeover = AsyncMock(return_value=True)
    ws_manager.broadcast = AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.put(
            "/api/leads/lead-uuid/takeover",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    mock_db.set_takeover.assert_awaited_once_with("lead-uuid", "agent-uuid")
