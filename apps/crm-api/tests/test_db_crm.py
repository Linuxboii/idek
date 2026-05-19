# Integration tests — require live PostgreSQL. Set DATABASE_URL env var.
import pytest
from app import db

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
async def setup_db():
    await db.init_pool()
    yield
    await db.close_pool()


async def test_create_and_get_user():
    user_id = await db.create_user("crm_test@example.com", "Test User", "hashed_pw", "clerk")
    user = await db.get_user_by_email("crm_test@example.com")
    assert user is not None
    assert user["email"] == "crm_test@example.com"
    assert user["role"] == "clerk"
    await db.delete_user(user_id)


async def test_set_and_clear_takeover():
    lead_id = await db.upsert_lead("+15559990001", "CRM Test", None, None, {})
    user_id = await db.create_user("agent_crm@example.com", "Agent", "pw", "clerk")
    await db.set_takeover(lead_id, user_id)
    lead = await db.get_lead_state("+15559990001")
    assert lead["ai_paused_until"] is not None
    await db.clear_takeover(lead_id)
    lead = await db.get_lead_state("+15559990001")
    assert lead["ai_paused_until"] is None
    await db.delete_user(user_id)
