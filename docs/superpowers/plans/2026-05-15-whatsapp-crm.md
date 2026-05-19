# WhatsApp CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend existing n8n-python FastAPI app into a multi-agent WhatsApp CRM with real-time WebSocket chat, human takeover (12h timer + manual resume), media pass-through, JWT auth with admin/clerk roles, and React frontend.

**Architecture:** Single FastAPI process extended with `auth.py`, `ws_manager.py`, `crm_api.py`. WebSocket channel map held in-memory keyed by `lead_id`. AI guard checks `leads.ai_paused_until > NOW()` before every pipeline run. React+Vite frontend — WhatsApp Web layout (sidebar + chat panel).

**Tech Stack:** FastAPI, asyncpg/PostgreSQL, python-jose (JWT), passlib (bcrypt), python-multipart, httpx, React 18, React Router 6, Axios, Tailwind CSS 3, native WebSocket API

---

### Task 1: DB migration + config update

**Files:**
- Create: `schema_crm.sql`
- Modify: `app/config.py`
- Modify: `.env.example`

- [ ] **Step 1: Create schema_crm.sql**

```sql
-- schema_crm.sql
-- Run AFTER schema.sql and schema_templates.sql

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'clerk' CHECK (role IN ('admin', 'clerk')),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS ai_paused_until  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_paused_by     UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS assigned_to      UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS unread_count     INT NOT NULL DEFAULT 0;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS sent_by    UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS media_type TEXT,
    ADD COLUMN IF NOT EXISTS media_id   TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_ai_paused    ON leads(ai_paused_until) WHERE ai_paused_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_lead_time ON messages(lead_id, created_at DESC);
```

- [ ] **Step 2: Add JWT_SECRET and BUSINESS_NAME to app/config.py**

Open `app/config.py`. Add these fields inside the `Settings` class:

```python
JWT_SECRET: str = "change-me-in-production"
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 480   # 8 hours
REFRESH_TOKEN_EXPIRE_DAYS: int = 7
BUSINESS_NAME: str = "Business"
```

- [ ] **Step 3: Add vars to .env.example**

```
JWT_SECRET=your-secret-key-min-32-chars
BUSINESS_NAME=Your Business Name
```

- [ ] **Step 4: Apply migration**

```bash
psql $DATABASE_URL -f schema_crm.sql
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add schema_crm.sql app/config.py .env.example
git commit -m "feat: CRM schema migration and config settings"
```

---

### Task 2: Auth module

**Files:**
- Create: `app/auth.py`
- Create: `tests/__init__.py`
- Create: `tests/test_auth.py`
- Modify: `requirements.txt`

- [ ] **Step 1: Add dependencies to requirements.txt**

```
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
anyio[trio]==4.3.0
pytest-anyio==0.0.0
httpx==0.27.0
```

```bash
pip install "python-jose[cryptography]" "passlib[bcrypt]" python-multipart "anyio[trio]" pytest-anyio httpx
```

- [ ] **Step 2: Write failing tests**

Create `tests/__init__.py` (empty).

Create `tests/test_auth.py`:

```python
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
```

- [ ] **Step 3: Run — expect ImportError**

```bash
pytest tests/test_auth.py -v
```
Expected: `ImportError: cannot import name 'hash_password' from 'app.auth'`

- [ ] **Step 4: Create app/auth.py**

```python
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

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
    return {"id": payload["sub"], "role": payload["role"], "name": payload.get("name", "")}


async def get_ws_user(token: str = Query(...)) -> dict:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise JWTError()
    except JWTError:
        raise HTTPException(status_code=403, detail="Invalid token")
    return {"id": payload["sub"], "role": payload["role"], "name": payload.get("name", "")}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
```

- [ ] **Step 5: Run — expect 4 PASSED**

```bash
pytest tests/test_auth.py -v
```
Expected: 4 tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add app/auth.py tests/__init__.py tests/test_auth.py requirements.txt
git commit -m "feat: JWT + bcrypt auth module"
```

---

### Task 3: WebSocket manager

**Files:**
- Create: `app/ws_manager.py`
- Create: `tests/test_ws_manager.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_ws_manager.py`:

```python
import pytest
from unittest.mock import AsyncMock

from app.ws_manager import WebSocketManager

pytestmark = pytest.mark.anyio


async def test_connect_adds_to_channel():
    mgr = WebSocketManager()
    ws = AsyncMock()
    await mgr.connect("lead-1", ws)
    assert ws in mgr.channels["lead-1"]


async def test_disconnect_removes_from_channel():
    mgr = WebSocketManager()
    ws = AsyncMock()
    await mgr.connect("lead-1", ws)
    mgr.disconnect("lead-1", ws)
    assert ws not in mgr.channels.get("lead-1", set())


async def test_broadcast_sends_to_all():
    mgr = WebSocketManager()
    ws1, ws2 = AsyncMock(), AsyncMock()
    await mgr.connect("lead-1", ws1)
    await mgr.connect("lead-1", ws2)
    await mgr.broadcast("lead-1", {"event": "test"})
    ws1.send_json.assert_awaited_once_with({"event": "test"})
    ws2.send_json.assert_awaited_once_with({"event": "test"})


async def test_broadcast_removes_dead_socket():
    mgr = WebSocketManager()
    ws = AsyncMock()
    ws.send_json.side_effect = Exception("dead")
    await mgr.connect("lead-1", ws)
    await mgr.broadcast("lead-1", {"event": "test"})
    assert ws not in mgr.channels.get("lead-1", set())
```

- [ ] **Step 2: Run — expect ImportError**

```bash
pytest tests/test_ws_manager.py -v
```
Expected: `ImportError: cannot import name 'WebSocketManager'`

- [ ] **Step 3: Create app/ws_manager.py**

```python
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.channels: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, lead_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.channels[lead_id].add(ws)

    def disconnect(self, lead_id: str, ws: WebSocket) -> None:
        self.channels[lead_id].discard(ws)
        if not self.channels[lead_id]:
            del self.channels[lead_id]

    async def broadcast(self, lead_id: str, data: dict[str, Any]) -> None:
        dead: set[WebSocket] = set()
        for ws in list(self.channels.get(lead_id, set())):
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(lead_id, ws)

    async def broadcast_all(self, data: dict[str, Any]) -> None:
        for lead_id in list(self.channels.keys()):
            await self.broadcast(lead_id, data)


# Singleton — imported by pipeline.py and crm_api.py
ws_manager = WebSocketManager()
```

- [ ] **Step 4: Run — expect 4 PASSED**

```bash
pytest tests/test_ws_manager.py -v
```
Expected: 4 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add app/ws_manager.py tests/test_ws_manager.py
git commit -m "feat: WebSocket manager — channel map, broadcast, dead socket cleanup"
```

---

### Task 4: DB additions for CRM

**Files:**
- Modify: `app/db.py`
- Create: `tests/test_db_crm.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_db_crm.py`:

```python
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
```

- [ ] **Step 2: Run — expect AttributeError**

```bash
pytest tests/test_db_crm.py -v
```
Expected: `AttributeError: module 'app.db' has no attribute 'create_user'`

- [ ] **Step 3: Update get_lead_state to include ai_paused_until**

In `app/db.py`, find `get_lead_state` and replace its query:

```python
async def get_lead_state(phone: str) -> Optional[dict]:
    async with pool().acquire() as con:
        row = await con.fetchrow(
            "SELECT id::text as id, score, escalated, ai_paused_until FROM leads WHERE phone = $1 LIMIT 1;",
            _normalize_phone(phone),
        )
        return dict(row) if row else None
```

- [ ] **Step 4: Append CRM functions to app/db.py**

Append to the bottom of `app/db.py`:

```python
# ── User CRUD ────────────────────────────────────────────────────────────────

async def create_user(email: str, name: str, password_hash: str, role: str) -> str:
    async with pool().acquire() as con:
        row = await con.fetchval(
            "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id;",
            email, name, password_hash, role,
        )
        return str(row)


async def get_user_by_email(email: str) -> Optional[dict]:
    async with pool().acquire() as con:
        row = await con.fetchrow(
            "SELECT id::text, email, name, role, password_hash, active FROM users WHERE email = $1;",
            email,
        )
        return dict(row) if row else None


async def get_user_by_id(user_id: str) -> Optional[dict]:
    async with pool().acquire() as con:
        row = await con.fetchrow(
            "SELECT id::text, email, name, role, active FROM users WHERE id = $1::uuid;",
            user_id,
        )
        return dict(row) if row else None


async def list_users() -> list[dict]:
    async with pool().acquire() as con:
        rows = await con.fetch(
            "SELECT id::text, email, name, role, active, created_at FROM users ORDER BY created_at;"
        )
        return [dict(r) for r in rows]


async def update_user(user_id: str, name: Optional[str], role: Optional[str], active: Optional[bool]) -> None:
    async with pool().acquire() as con:
        await con.execute(
            """UPDATE users SET
               name   = COALESCE($2, name),
               role   = COALESCE($3, role),
               active = COALESCE($4, active),
               updated_at = NOW()
               WHERE id = $1::uuid;""",
            user_id, name, role, active,
        )


async def delete_user(user_id: str) -> None:
    async with pool().acquire() as con:
        await con.execute("DELETE FROM users WHERE id = $1::uuid;", user_id)


# ── Takeover ─────────────────────────────────────────────────────────────────

async def set_takeover(lead_id: str, agent_id: str) -> None:
    async with pool().acquire() as con:
        await con.execute(
            """UPDATE leads SET
               ai_paused_until = NOW() + INTERVAL '12 hours',
               ai_paused_by = $2::uuid,
               updated_at = NOW()
               WHERE id = $1::uuid;""",
            lead_id, agent_id,
        )


async def clear_takeover(lead_id: str) -> None:
    async with pool().acquire() as con:
        await con.execute(
            "UPDATE leads SET ai_paused_until = NULL, ai_paused_by = NULL, updated_at = NOW() WHERE id = $1::uuid;",
            lead_id,
        )


# ── Conversations ─────────────────────────────────────────────────────────────

async def list_conversations(limit: int = 50, offset: int = 0) -> list[dict]:
    q = """
    SELECT
        l.id::text, l.phone, l.name, l.score,
        l.ai_paused_until, l.unread_count,
        l.assigned_to::text,
        u.name AS assigned_agent_name,
        m.message_text AS last_message,
        m.created_at   AS last_message_at
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    LEFT JOIN LATERAL (
        SELECT message_text, created_at FROM messages
        WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
    ) m ON TRUE
    ORDER BY COALESCE(m.created_at, l.created_at) DESC
    LIMIT $1 OFFSET $2;
    """
    async with pool().acquire() as con:
        rows = await con.fetch(q, limit, offset)
        out = []
        for r in rows:
            d = dict(r)
            d["ai_active"] = d["ai_paused_until"] is None
            if d["ai_paused_until"]:
                d["ai_paused_until"] = d["ai_paused_until"].isoformat()
            if d["last_message_at"]:
                d["last_message_at"] = d["last_message_at"].isoformat()
            out.append(d)
        return out


async def get_conversation(lead_id: str) -> Optional[dict]:
    async with pool().acquire() as con:
        lead = await con.fetchrow(
            """SELECT l.id::text AS id, l.phone, l.name, l.score, l.unread_count,
                      l.ai_paused_until, l.ai_paused_by::text, l.assigned_to::text,
                      u.name AS assigned_agent_name
               FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
               WHERE l.id = $1::uuid;""",
            lead_id,
        )
        if not lead:
            return None
        msgs = await con.fetch(
            """SELECT m.id::text, m.role, m.message_text, m.media_type, m.media_id,
                      m.created_at, u.name AS agent_name
               FROM messages m LEFT JOIN users u ON u.id = m.sent_by
               WHERE m.lead_id = $1::uuid ORDER BY m.created_at;""",
            lead_id,
        )
        lead_d = dict(lead)
        lead_d["ai_active"] = lead_d["ai_paused_until"] is None
        if lead_d["ai_paused_until"]:
            lead_d["ai_paused_until"] = lead_d["ai_paused_until"].isoformat()
        return {
            "lead": lead_d,
            "messages": [
                {**dict(m), "created_at": m["created_at"].isoformat()}
                for m in msgs
            ],
        }


async def increment_unread(lead_id: str) -> None:
    async with pool().acquire() as con:
        await con.execute(
            "UPDATE leads SET unread_count = unread_count + 1 WHERE id = $1::uuid;",
            lead_id,
        )


async def clear_unread(lead_id: str) -> None:
    async with pool().acquire() as con:
        await con.execute(
            "UPDATE leads SET unread_count = 0 WHERE id = $1::uuid;",
            lead_id,
        )


async def insert_agent_message(
    lead_id: str, agent_id: str, text: str,
    media_type: Optional[str] = None, media_id: Optional[str] = None,
) -> str:
    async with pool().acquire() as con:
        row = await con.fetchval(
            """INSERT INTO messages (lead_id, role, message_text, sent_by, media_type, media_id)
               VALUES ($1::uuid, 'agent', $2, $3::uuid, $4, $5)
               RETURNING id::text;""",
            lead_id, text, agent_id, media_type, media_id,
        )
        return str(row)
```

- [ ] **Step 5: Run tests — expect PASSED (requires live DB)**

```bash
pytest tests/test_db_crm.py -v
```
Expected: 2 tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add app/db.py tests/test_db_crm.py
git commit -m "feat: CRM DB functions — users CRUD, takeover, conversations, unread"
```

---

### Task 5: Pipeline AI guard

**Files:**
- Modify: `app/pipeline.py`
- Create: `tests/test_pipeline_guard.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_pipeline_guard.py`:

```python
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

pytestmark = pytest.mark.anyio

_PAYLOAD = {
    "messages": [{"type": "text", "text": {"body": "hi"}, "id": "msg1"}],
    "contacts": [{"wa_id": "15550001111", "profile": {"name": "Test"}}],
}

_EXT = {
    "scoreDelta": 0, "size_preference": None, "facing": None,
    "preferred_locations": None, "budget_min": None,
    "budget_max": None, "budget_estimate": None,
}


@patch("app.pipeline.ws_manager")
@patch("app.pipeline.db")
async def test_ai_skipped_when_paused(mock_db, mock_ws):
    from app.pipeline import handle_message

    future = datetime.now(timezone.utc) + timedelta(hours=6)
    mock_db.upsert_lead = AsyncMock(return_value="lead-uuid")
    mock_db.insert_message = AsyncMock()
    mock_db.get_lead_state = AsyncMock(return_value={
        "id": "lead-uuid", "ai_paused_until": future, "score": 0
    })
    mock_db.increment_unread = AsyncMock()
    mock_ws.broadcast = AsyncMock()

    with patch("app.pipeline.agent") as mock_agent:
        await handle_message(_PAYLOAD)
        mock_agent.chat.assert_not_called()

    mock_db.increment_unread.assert_awaited_once_with("lead-uuid")


@patch("app.pipeline.ws_manager")
@patch("app.pipeline.db")
async def test_ai_runs_when_not_paused(mock_db, mock_ws):
    from app.pipeline import handle_message

    mock_db.upsert_lead = AsyncMock(return_value="lead-uuid")
    mock_db.insert_message = AsyncMock()
    mock_db.get_lead_state = AsyncMock(return_value={
        "id": "lead-uuid", "ai_paused_until": None, "score": 0
    })
    mock_db.get_recent_messages = AsyncMock(return_value=[])
    mock_db.update_lead_extraction = AsyncMock()
    mock_ws.broadcast = AsyncMock()

    with patch("app.pipeline.agent") as mock_agent, \
         patch("app.pipeline.whatsapp") as mock_wa, \
         patch("app.pipeline.extract", return_value=_EXT):
        mock_agent.format_history.return_value = ""
        mock_agent.chat = AsyncMock(return_value="Hello!")
        mock_wa.send_text = AsyncMock()
        await handle_message(_PAYLOAD)
        mock_agent.chat.assert_awaited_once()
```

- [ ] **Step 2: Run — expect FAIL (guard not added yet)**

```bash
pytest tests/test_pipeline_guard.py::test_ai_skipped_when_paused -v
```
Expected: FAIL — `agent.chat` is called even when paused.

- [ ] **Step 3: Rewrite app/pipeline.py with AI guard**

Replace the entire contents of `app/pipeline.py`:

```python
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from . import agent, calendar_client, db, whatsapp
from .extractor import extract
from .ws_manager import ws_manager

log = logging.getLogger(__name__)

JSON_BLOCK_RE = re.compile(r"\{[^{}]*\}", re.DOTALL)


def _clean_outgoing(text: str) -> str:
    t = (text or "").replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    t = re.sub(r"\n+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = "".join(c for c in t if 32 <= ord(c) <= 126)
    return t


def _extract_schedule_json(output: str) -> Optional[dict]:
    if "{" not in output:
        return None
    m = JSON_BLOCK_RE.search(output)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except Exception:
        return None
    if not data.get("date") or not data.get("time"):
        return None
    return data


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def handle_message(payload: dict) -> None:
    """Entry point for a WhatsApp `messages` webhook payload (value object)."""
    try:
        msg = payload["messages"][0]
        contact = payload["contacts"][0]
    except (KeyError, IndexError):
        log.warning("payload missing messages/contacts: %s", payload)
        return

    mtype = msg.get("type")
    wa_id = contact.get("wa_id")
    name = (contact.get("profile") or {}).get("name") or ""
    referral = (msg.get("referral") or {}).get("source_url", "")
    referral_type = (msg.get("referral") or {}).get("source_type", "")

    if mtype == "text":
        message_text = (msg.get("text") or {}).get("body", "")
    elif mtype == "audio":
        media_id = (msg.get("audio") or {}).get("id")
        media_url = await whatsapp.get_media_url(media_id)
        audio_bytes, _ct = await whatsapp.download_media(media_url)
        message_text = await agent.transcribe(audio_bytes)
    else:
        log.info("unsupported message type: %s", mtype)
        return

    final_message = message_text.strip() or "[Empty message]"

    lead_id = await db.upsert_lead(
        phone=wa_id, name=name, referral_type=referral_type,
        referral=referral, raw_payload=payload,
    )
    await db.insert_message(lead_id, "user", final_message)

    # ── AI GUARD ─────────────────────────────────────────────────────────────
    try:
        lead_state = await db.get_lead_state(wa_id)
        paused_until = lead_state["ai_paused_until"] if lead_state else None
        if paused_until and paused_until > datetime.now(timezone.utc):
            await db.increment_unread(lead_id)
            await ws_manager.broadcast(lead_id, {
                "event": "new_message",
                "lead_id": lead_id,
                "message": {
                    "role": "user", "message_text": final_message,
                    "media_type": None, "media_id": None, "created_at": _now_iso(),
                },
            })
            return
    except Exception:
        log.exception("AI guard check failed — proceeding with AI (fail open)")
    # ─────────────────────────────────────────────────────────────────────────

    history = await db.get_recent_messages(lead_id, limit=5)
    formatted_history = agent.format_history(history)
    ext = extract(final_message)

    await db.update_lead_extraction(
        lead_id=lead_id,
        score_delta=ext["scoreDelta"],
        size_preference=ext["size_preference"],
        facing=ext["facing"],
        preferred_locations=ext["preferred_locations"],
        budget_min=ext["budget_min"],
        budget_max=ext["budget_max"],
        budget_estimate=ext["budget_estimate"],
    )

    ctx = {
        "name": name,
        "size_preference": ext["size_preference"],
        "preferred_locations": ext["preferred_locations"],
        "facing": ext["facing"],
        "budget_min": ext["budget_min"],
        "scoreDelta": ext["scoreDelta"],
        "current_date": datetime.now().isoformat(),
        "formatted_history": formatted_history,
        "message_text": final_message,
    }

    output = await agent.chat(ctx)
    log.info("agent output: %s", output[:200])

    schedule = _extract_schedule_json(output)
    if schedule:
        try:
            start_iso, end_iso = calendar_client.build_iso_range(schedule["date"], schedule["time"])
            event = await asyncio.to_thread(
                calendar_client.create_event, start_iso, end_iso,
                f"Level Up — {name or wa_id}",
            )
            link = calendar_client.hangout_link(event) or ""
            confirm = (
                "Your call has been scheduled! Our team will reach out to you shortly. "
                f"You may use this gmeet link to join the meet\n{link}"
            )
            await whatsapp.send_text(wa_id, confirm)
            cleaned_confirm = _clean_outgoing(confirm)
            await db.insert_message(lead_id, "assistant", cleaned_confirm)
            await ws_manager.broadcast(lead_id, {
                "event": "new_message", "lead_id": lead_id,
                "message": {"role": "assistant", "message_text": cleaned_confirm,
                            "media_type": None, "media_id": None, "created_at": _now_iso()},
            })
            return
        except Exception:
            log.exception("calendar scheduling failed; falling back to plain reply")

    cleaned = _clean_outgoing(output)
    await whatsapp.send_text(wa_id, output)
    await db.insert_message(lead_id, "assistant", cleaned)
    await ws_manager.broadcast(lead_id, {
        "event": "new_message", "lead_id": lead_id,
        "message": {"role": "assistant", "message_text": cleaned,
                    "media_type": None, "media_id": None, "created_at": _now_iso()},
    })
```

- [ ] **Step 4: Run — expect 2 PASSED**

```bash
pytest tests/test_pipeline_guard.py -v
```
Expected: 2 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add app/pipeline.py tests/test_pipeline_guard.py
git commit -m "feat: AI guard in pipeline — skip AI when human has taken over"
```

---

### Task 6: WhatsApp media upload + send methods

**Files:**
- Modify: `app/whatsapp.py`

- [ ] **Step 1: Check existing field name for phone number ID**

```bash
grep -n "PHONE\|phone_id\|phone_number" app/whatsapp.py app/config.py
```
Note the exact `settings.WA_PHONE_*` field name. Use it in steps below.

- [ ] **Step 2: Append upload_media and send_media to app/whatsapp.py**

```python
async def upload_media(file_bytes: bytes, content_type: str, filename: str) -> str:
    """Upload bytes to WhatsApp Media API. Returns media_id."""
    url = f"https://graph.facebook.com/v19.0/{settings.WA_PHONE_NUMBER_ID}/media"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {settings.WA_TOKEN}"},
            files={"file": (filename, file_bytes, content_type)},
            data={"messaging_product": "whatsapp"},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["id"]


async def send_media(
    to: str, media_type: str, media_id: str,
    caption: str = "", filename: str = "",
) -> dict:
    """Send a media message using an already-uploaded media_id."""
    if media_type == "document":
        media_body = {"id": media_id, "filename": filename or "file"}
        if caption:
            media_body["caption"] = caption
    elif media_type in ("image", "video"):
        media_body = {"id": media_id}
        if caption:
            media_body["caption"] = caption
    else:  # audio
        media_body = {"id": media_id}

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": media_type,
        media_type: media_body,
    }
    url = f"https://graph.facebook.com/v19.0/{settings.WA_PHONE_NUMBER_ID}/messages"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {settings.WA_TOKEN}",
                     "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
```

If Step 1 shows the field is `WA_PHONE_ID` (not `WA_PHONE_NUMBER_ID`), replace both occurrences above with `settings.WA_PHONE_ID`.

- [ ] **Step 3: Commit**

```bash
git add app/whatsapp.py
git commit -m "feat: WhatsApp media upload and send methods"
```

---

### Task 7: CRM API router + main.py wiring

**Files:**
- Create: `app/crm_api.py`
- Modify: `app/main.py`
- Create: `tests/test_crm_api.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_crm_api.py`:

```python
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
    mock_db.set_takeover = AsyncMock()
    ws_manager.broadcast = AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.put(
            "/api/leads/lead-uuid/takeover",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    mock_db.set_takeover.assert_awaited_once_with("lead-uuid", "agent-uuid")
```

- [ ] **Step 2: Run — expect 404/import errors**

```bash
pytest tests/test_crm_api.py -v
```
Expected: failures — router not mounted yet.

- [ ] **Step 3: Create app/crm_api.py**

```python
# app/crm_api.py
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import db, whatsapp
from .auth import (
    create_access_token, create_refresh_token,
    get_current_user, get_ws_user,
    hash_password, require_admin, verify_password,
)
from .ws_manager import ws_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class CreateUserRequest(BaseModel):
    email: str
    name: str
    password: str
    role: str = "clerk"


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class SendTextRequest(BaseModel):
    text: str


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.get_user_by_email(req.email)
    if not user or not user.get("active"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token_data = {"sub": user["id"], "role": user["role"], "name": user["name"]}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": {"id": user["id"], "name": user["name"], "role": user["role"]},
    }


# ── Users (admin only) ────────────────────────────────────────────────────────

@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    return await db.list_users()


@router.post("/users", dependencies=[Depends(require_admin)])
async def create_user(req: CreateUserRequest):
    if req.role not in ("admin", "clerk"):
        raise HTTPException(status_code=400, detail="role must be admin or clerk")
    if await db.get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="Email already in use")
    user_id = await db.create_user(req.email, req.name, hash_password(req.password), req.role)
    return {"id": user_id}


@router.put("/users/{user_id}", dependencies=[Depends(require_admin)])
async def update_user(user_id: str, req: UpdateUserRequest):
    await db.update_user(user_id, req.name, req.role, req.active)
    return {"ok": True}


@router.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
async def deactivate_user(user_id: str):
    await db.update_user(user_id, None, None, False)
    return {"ok": True}


# ── Conversations ─────────────────────────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(
    limit: int = 50, offset: int = 0,
    _user=Depends(get_current_user),
):
    return await db.list_conversations(limit=limit, offset=offset)


@router.get("/conversations/{lead_id}")
async def get_conversation(lead_id: str, _user=Depends(get_current_user)):
    conv = await db.get_conversation(lead_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.clear_unread(lead_id)
    return conv


# ── Takeover ──────────────────────────────────────────────────────────────────

@router.put("/leads/{lead_id}/takeover")
async def takeover(lead_id: str, user=Depends(get_current_user)):
    await db.set_takeover(lead_id, user["id"])
    await ws_manager.broadcast(lead_id, {
        "event": "takeover",
        "lead_id": lead_id,
        "paused_until": datetime.now(timezone.utc).isoformat(),
        "by": user["name"],
    })
    return {"ok": True}


@router.delete("/leads/{lead_id}/takeover")
async def resume_ai(lead_id: str, _user=Depends(get_current_user)):
    await db.clear_takeover(lead_id)
    await ws_manager.broadcast(lead_id, {"event": "resume_ai", "lead_id": lead_id})
    return {"ok": True}


@router.put("/leads/{lead_id}/assign", dependencies=[Depends(require_admin)])
async def assign_lead(lead_id: str, agent_id: str):
    async with db.pool().acquire() as con:
        await con.execute(
            "UPDATE leads SET assigned_to = $2::uuid WHERE id = $1::uuid;",
            lead_id, agent_id,
        )
    return {"ok": True}


# ── Messaging ─────────────────────────────────────────────────────────────────

@router.post("/chat/{lead_id}/send-text")
async def send_text(lead_id: str, req: SendTextRequest, user=Depends(get_current_user)):
    conv = await db.get_conversation(lead_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Lead not found")
    await whatsapp.send_text(conv["lead"]["phone"], req.text)
    msg_id = await db.insert_agent_message(lead_id, user["id"], req.text)
    await db.set_takeover(lead_id, user["id"])
    await ws_manager.broadcast(lead_id, {
        "event": "new_message",
        "lead_id": lead_id,
        "message": {
            "id": msg_id, "role": "agent", "message_text": req.text,
            "media_type": None, "media_id": None,
            "agent_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    })
    return {"ok": True, "message_id": msg_id}


@router.post("/chat/{lead_id}/send-media")
async def send_media(
    lead_id: str,
    file: UploadFile = File(...),
    caption: str = Form(""),
    user=Depends(get_current_user),
):
    conv = await db.get_conversation(lead_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Lead not found")

    content_type = file.content_type or "application/octet-stream"
    file_bytes = await file.read()

    if content_type.startswith("image/"):
        wa_type = "image"
    elif content_type.startswith("video/"):
        wa_type = "video"
    elif content_type.startswith("audio/"):
        wa_type = "audio"
    else:
        wa_type = "document"

    media_id = await whatsapp.upload_media(file_bytes, content_type, file.filename or "file")
    await whatsapp.send_media(
        conv["lead"]["phone"], wa_type, media_id,
        caption=caption, filename=file.filename or "",
    )

    text_repr = f"[{wa_type}: {file.filename}]"
    msg_id = await db.insert_agent_message(
        lead_id, user["id"], text_repr, media_type=wa_type, media_id=media_id,
    )
    await db.set_takeover(lead_id, user["id"])
    await ws_manager.broadcast(lead_id, {
        "event": "new_message",
        "lead_id": lead_id,
        "message": {
            "id": msg_id, "role": "agent",
            "message_text": text_repr, "media_type": wa_type, "media_id": media_id,
            "agent_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    })
    return {"ok": True, "media_id": media_id, "message_id": msg_id}


# ── Media proxy ────────────────────────────────────────────────────────────────

@router.get("/media/{media_id}")
async def proxy_media(media_id: str, _user=Depends(get_current_user)):
    """Proxy WA media download — keeps WA token server-side."""
    from .config import settings
    async with httpx.AsyncClient() as client:
        meta = await client.get(
            f"https://graph.facebook.com/v19.0/{media_id}",
            headers={"Authorization": f"Bearer {settings.WA_TOKEN}"},
            timeout=15,
        )
        meta.raise_for_status()
        media_url = meta.json().get("url")
        resp = await client.get(
            media_url,
            headers={"Authorization": f"Bearer {settings.WA_TOKEN}"},
            timeout=60,
        )
        resp.raise_for_status()
    return StreamingResponse(
        iter([resp.content]),
        media_type=resp.headers.get("content-type", "application/octet-stream"),
    )
```

- [ ] **Step 4: Update app/main.py to mount crm_api router + WebSocket**

Add to `app/main.py` after existing imports:

```python
from fastapi import WebSocket, WebSocketDisconnect, Query
from . import crm_api
from .ws_manager import ws_manager
from .auth import get_ws_user
```

Add after `app.include_router(templates_api.router)`:

```python
app.include_router(crm_api.router)
```

Add new WebSocket endpoint before the `health` route:

```python
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    try:
        user = await get_ws_user(token)
    except Exception:
        await ws.close(code=4001)
        return
    await ws_manager.connect("__global__", ws)
    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action")
            lead_id = data.get("lead_id")
            if action == "subscribe" and lead_id:
                ws_manager.channels[lead_id].add(ws)
            elif action == "unsubscribe" and lead_id:
                ws_manager.channels[lead_id].discard(ws)
    except WebSocketDisconnect:
        ws_manager.disconnect("__global__", ws)
        for channel in list(ws_manager.channels.values()):
            channel.discard(ws)
```

- [ ] **Step 5: Run — expect 4 PASSED**

```bash
pytest tests/test_crm_api.py -v
```
Expected: 4 tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add app/crm_api.py app/main.py tests/test_crm_api.py
git commit -m "feat: CRM API router and WebSocket endpoint"
```

---

### Task 8: Frontend — project setup

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Install deps**

```bash
cd frontend
npm install react-router-dom@6 axios
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configure tailwind.config.js**

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 3: Replace frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
```

- [ ] **Step 4: Update frontend/vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: (process.env.VITE_API_BASE_URL || 'http://localhost:8000')
          .replace(/^http/, 'ws'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 5: Verify build runs clean**

```bash
cd frontend && npm run build
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add package.json vite.config.js tailwind.config.js postcss.config.js src/index.css
git commit -m "feat: frontend — react-router, axios, tailwind setup"
```

---

### Task 9: Frontend — API client + WebSocket hook

**Files:**
- Create: `frontend/src/api.js`
- Create: `frontend/src/ws.js`

- [ ] **Step 1: Create frontend/src/api.js**

```js
// frontend/src/api.js
import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({ baseURL: `${BASE}/api` })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE}/api/auth/login`, {}, {
            headers: { Authorization: `Bearer ${refresh}` },
          })
          localStorage.setItem('access_token', data.access_token)
          err.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(err.config)
        } catch { /* fall through */ }
      }
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
}

export const conversationsApi = {
  list: (limit = 50, offset = 0) => api.get('/conversations', { params: { limit, offset } }),
  get: (id) => api.get(`/conversations/${id}`),
}

export const leadsApi = {
  takeover: (id) => api.put(`/leads/${id}/takeover`),
  resumeAI: (id) => api.delete(`/leads/${id}/takeover`),
  assign: (id, agentId) => api.put(`/leads/${id}/assign`, null, { params: { agent_id: agentId } }),
}

export const chatApi = {
  sendText: (leadId, text) => api.post(`/chat/${leadId}/send-text`, { text }),
  sendMedia: (leadId, file, caption = '') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('caption', caption)
    return api.post(`/chat/${leadId}/send-media`, fd)
  },
}

export const usersApi = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  deactivate: (id) => api.delete(`/users/${id}`),
}

export default api
```

- [ ] **Step 2: Create frontend/src/ws.js**

```js
// frontend/src/ws.js
import { useCallback, useEffect, useRef } from 'react'

export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const retryCount = useRef(0)
  const onMsgRef = useRef(onMessage)
  onMsgRef.current = onMessage

  const connect = useCallback(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return null

    const base = (import.meta.env.VITE_API_BASE_URL || window.location.origin)
      .replace(/^https/, 'wss').replace(/^http/, 'ws')

    const socket = new WebSocket(`${base}/ws?token=${token}`)

    socket.onopen = () => { retryCount.current = 0 }

    socket.onmessage = (e) => {
      try { onMsgRef.current(JSON.parse(e.data)) } catch { /* ignore bad JSON */ }
    }

    socket.onclose = () => {
      const delay = Math.min(1000 * 2 ** retryCount.current, 30000)
      retryCount.current++
      setTimeout(connect, delay)
    }

    ws.current = socket
    return socket
  }, [])

  useEffect(() => {
    const socket = connect()
    return () => socket?.close()
  }, [connect])

  const subscribe = useCallback((leadId) => {
    ws.current?.send(JSON.stringify({ action: 'subscribe', lead_id: leadId }))
  }, [])

  const unsubscribe = useCallback((leadId) => {
    ws.current?.send(JSON.stringify({ action: 'unsubscribe', lead_id: leadId }))
  }, [])

  return { subscribe, unsubscribe }
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/api.js src/ws.js
git commit -m "feat: axios API client with refresh interceptor + WebSocket hook"
```

---

### Task 10: Frontend — Auth context + Login page + App router

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Create: `frontend/src/pages/Login.jsx`
- Rewrite: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Create frontend/src/context/AuthContext.jsx**

```jsx
// frontend/src/context/AuthContext.jsx
import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user')) } catch { return null }
  })

  const login = (userData, accessToken, refreshToken) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    localStorage.setItem('crm_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('crm_user')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 2: Create frontend/src/pages/Login.jsx**

```jsx
// frontend/src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await authApi.login(email, password)
      login(data.user, data.access_token, data.refresh_token)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">WhatsApp CRM</h1>
        <form onSubmit={submit} className="space-y-4">
          <input type="email" placeholder="Email" required value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <input type="password" placeholder="Password" required value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite frontend/src/App.jsx**

```jsx
// frontend/src/App.jsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AdminUsers from './pages/AdminUsers'

function Private({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function AdminOnly({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Private><Dashboard /></Private>} />
          <Route path="/admin/users" element={<AdminOnly><AdminUsers /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: Update frontend/src/main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/App.jsx src/main.jsx src/pages/Login.jsx src/context/AuthContext.jsx
git commit -m "feat: login page, auth context, protected routes"
```

---

### Task 11: Frontend — ConversationList sidebar

**Files:**
- Create: `frontend/src/components/ConversationList.jsx`

- [ ] **Step 1: Create frontend/src/components/ConversationList.jsx**

```jsx
// frontend/src/components/ConversationList.jsx
import { useEffect, useState } from 'react'
import { conversationsApi } from '../api'

export default function ConversationList({ selectedId, onSelect, liveUpdates }) {
  const [convs, setConvs] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | ai | human | unread

  const load = async () => {
    try {
      const { data } = await conversationsApi.list()
      setConvs(data)
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [])

  // Merge live WS updates into local list
  useEffect(() => {
    if (!liveUpdates) return
    setConvs(prev => prev.map(c => {
      const upd = liveUpdates[c.id]
      if (!upd) return c
      return {
        ...c,
        last_message: upd.lastMessage ?? c.last_message,
        ai_active: upd.ai_active ?? c.ai_active,
        unread_count: upd.unread_count ?? c.unread_count,
      }
    }))
  }, [liveUpdates])

  const filtered = convs.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    const matchFilter =
      filter === 'all' ? true :
      filter === 'ai' ? c.ai_active :
      filter === 'human' ? !c.ai_active :
      filter === 'unread' ? c.unread_count > 0 : true
    return matchSearch && matchFilter
  })

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 w-80 flex-shrink-0">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-800 text-lg mb-3">Conversations</h2>
        <input
          type="text" placeholder="Search name or phone…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <div className="flex gap-1 mt-2">
          {['all', 'ai', 'human', 'unread'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-2 py-1 rounded-full font-medium transition-colors
                ${filter === f ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {filtered.map(c => (
          <button key={c.id} onClick={() => onSelect(c)}
            className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors
              ${selectedId === c.id ? 'bg-green-50 border-l-4 border-l-green-500' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-800 text-sm truncate">{c.name || c.phone}</span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {c.unread_count > 0 && (
                  <span className="bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {c.unread_count > 9 ? '9+' : c.unread_count}
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${c.ai_active ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {c.ai_active ? '🤖' : '👤'}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{c.last_message || '—'}</p>
            {c.assigned_agent_name && (
              <p className="text-xs text-gray-400 mt-0.5">→ {c.assigned_agent_name}</p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">No conversations</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend
git add src/components/ConversationList.jsx
git commit -m "feat: ConversationList sidebar with search, filter, unread badge"
```

---

### Task 12: Frontend — ChatPanel components

**Files:**
- Create: `frontend/src/components/MessageBubble.jsx`
- Create: `frontend/src/components/TakeoverBanner.jsx`
- Create: `frontend/src/components/MediaUpload.jsx`
- Create: `frontend/src/components/ChatPanel.jsx`

- [ ] **Step 1: Create frontend/src/components/MessageBubble.jsx**

```jsx
// frontend/src/components/MessageBubble.jsx
const BASE = import.meta.env.VITE_API_BASE_URL || ''

function MediaPreview({ mediaType, mediaId }) {
  const src = `${BASE}/api/media/${mediaId}`
  if (mediaType === 'image') return <img src={src} alt="" className="max-w-xs rounded-lg mt-1" />
  if (mediaType === 'audio') return <audio controls src={src} className="mt-1 max-w-xs" />
  if (mediaType === 'video') return <video controls src={src} className="max-w-xs rounded-lg mt-1" />
  return <a href={src} target="_blank" rel="noreferrer" className="underline text-blue-300 text-xs">Download file</a>
}

export default function MessageBubble({ msg }) {
  const isOut = msg.role === 'assistant' || msg.role === 'agent'
  const label = msg.role === 'agent' ? (msg.agent_name || 'Agent') : msg.role === 'assistant' ? '🤖 AI' : null

  return (
    <div className={`flex flex-col mb-2 ${isOut ? 'items-end' : 'items-start'}`}>
      {label && <span className="text-xs text-gray-400 mb-0.5 px-1">{label}</span>}
      <div className={`max-w-sm px-3 py-2 rounded-2xl text-sm
        ${isOut ? 'bg-green-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
        {msg.media_type && msg.media_id
          ? <MediaPreview mediaType={msg.media_type} mediaId={msg.media_id} />
          : <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
        }
      </div>
      <span className="text-xs text-gray-400 mt-0.5 px-1">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Create frontend/src/components/TakeoverBanner.jsx**

```jsx
// frontend/src/components/TakeoverBanner.jsx
import { leadsApi } from '../api'

export default function TakeoverBanner({ lead, onResume }) {
  if (!lead || lead.ai_active) return null

  const until = lead.ai_paused_until
    ? new Date(lead.ai_paused_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const handleResume = async () => {
    try { await leadsApi.resumeAI(lead.id); onResume() } catch { /* ignore */ }
  }

  return (
    <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-between">
      <span className="text-sm text-orange-700">
        👤 Human mode{until ? ` until ${until}` : ''}
      </span>
      <button onClick={handleResume}
        className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-full font-medium">
        Resume AI
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create frontend/src/components/MediaUpload.jsx**

```jsx
// frontend/src/components/MediaUpload.jsx
import { useRef } from 'react'

export default function MediaUpload({ onFile }) {
  const ref = useRef()
  const handleChange = (e) => {
    const file = e.target.files?.[0]
    if (file) { onFile(file); e.target.value = '' }
  }
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()}
        className="text-gray-500 hover:text-green-600 p-2 rounded-lg hover:bg-gray-100 text-lg"
        title="Attach file">
        📎
      </button>
      <input ref={ref} type="file" className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={handleChange} />
    </>
  )
}
```

- [ ] **Step 4: Create frontend/src/components/ChatPanel.jsx**

```jsx
// frontend/src/components/ChatPanel.jsx
import { useEffect, useRef, useState } from 'react'
import { chatApi, conversationsApi, leadsApi } from '../api'
import MediaUpload from './MediaUpload'
import MessageBubble from './MessageBubble'
import TakeoverBanner from './TakeoverBanner'

export default function ChatPanel({ lead: initialLead }) {
  const [conv, setConv] = useState(null)
  const [lead, setLead] = useState(initialLead)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef()

  const loadConv = async () => {
    if (!initialLead?.id) return
    try {
      const { data } = await conversationsApi.get(initialLead.id)
      setConv(data)
      setLead({
        ...initialLead,
        ai_active: data.lead.ai_active,
        ai_paused_until: data.lead.ai_paused_until,
      })
    } catch { /* ignore */ }
  }

  useEffect(() => { loadConv() }, [initialLead?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.messages?.length])

  const handleSendText = async (e) => {
    e.preventDefault()
    if (!text.trim() || !conv || sending) return
    setSending(true)
    try { await chatApi.sendText(conv.lead.id, text); setText(''); await loadConv() }
    catch { /* ignore */ } finally { setSending(false) }
  }

  const handleSendMedia = async (file) => {
    if (!conv || sending) return
    setSending(true)
    try { await chatApi.sendMedia(conv.lead.id, file); await loadConv() }
    catch { /* ignore */ } finally { setSending(false) }
  }

  const handleTakeover = async () => {
    if (!conv) return
    try {
      await leadsApi.takeover(conv.lead.id)
      setLead(prev => ({ ...prev, ai_active: false }))
    } catch { /* ignore */ }
  }

  if (!initialLead) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-2">💬</p>
          <p>Select a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">{lead?.name || lead?.phone}</h3>
          <p className="text-xs text-gray-500">{lead?.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          {lead?.ai_active && (
            <button onClick={handleTakeover}
              className="text-xs bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-700 px-3 py-1 rounded-full font-medium transition-colors">
              Take Over
            </button>
          )}
          <span className={`text-xs px-2 py-1 rounded-full font-medium
            ${lead?.ai_active ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
            {lead?.ai_active ? '🤖 AI Active' : '👤 Human'}
          </span>
        </div>
      </div>

      <TakeoverBanner
        lead={lead}
        onResume={() => setLead(prev => ({ ...prev, ai_active: true, ai_paused_until: null }))}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {conv?.messages?.map((m, i) => <MessageBubble key={m.id || i} msg={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendText}
        className="px-4 py-3 border-t border-gray-200 flex items-center gap-2 bg-white">
        <MediaUpload onFile={handleSendMedia} />
        <input type="text" value={text} onChange={e => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        <button type="submit" disabled={sending || !text.trim()}
          className="bg-green-500 hover:bg-green-600 text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-50 flex-shrink-0 text-sm">
          ➤
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/components/
git commit -m "feat: ChatPanel, MessageBubble, TakeoverBanner, MediaUpload"
```

---

### Task 13: Frontend — Dashboard + Admin pages

**Files:**
- Create: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/components/UserManagement.jsx`
- Create: `frontend/src/pages/AdminUsers.jsx`

- [ ] **Step 1: Create frontend/src/pages/Dashboard.jsx**

```jsx
// frontend/src/pages/Dashboard.jsx
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWebSocket } from '../ws'
import ConversationList from '../components/ConversationList'
import ChatPanel from '../components/ChatPanel'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [selectedLead, setSelectedLead] = useState(null)
  const [liveUpdates, setLiveUpdates] = useState({})

  const { subscribe, unsubscribe } = useWebSocket(
    useCallback((msg) => {
      if (msg.event === 'new_message') {
        setLiveUpdates(prev => ({
          ...prev,
          [msg.lead_id]: {
            ...(prev[msg.lead_id] || {}),
            lastMessage: msg.message.message_text,
            unread_count: msg.lead_id !== selectedLead?.id
              ? ((prev[msg.lead_id]?.unread_count || 0) + 1)
              : 0,
          },
        }))
      }
      if (msg.event === 'takeover') {
        setLiveUpdates(prev => ({
          ...prev,
          [msg.lead_id]: { ...(prev[msg.lead_id] || {}), ai_active: false },
        }))
      }
      if (msg.event === 'resume_ai') {
        setLiveUpdates(prev => ({
          ...prev,
          [msg.lead_id]: { ...(prev[msg.lead_id] || {}), ai_active: true },
        }))
      }
    }, [selectedLead?.id])
  )

  const handleSelect = (lead) => {
    if (selectedLead?.id) unsubscribe(selectedLead.id)
    setSelectedLead(lead)
    subscribe(lead.id)
    // clear unread badge locally
    setLiveUpdates(prev => ({
      ...prev,
      [lead.id]: { ...(prev[lead.id] || {}), unread_count: 0 },
    }))
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-green-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0 shadow">
        <span className="font-bold text-lg">WhatsApp CRM</span>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80">{user?.name} · {user?.role}</span>
          {user?.role === 'admin' && (
            <Link to="/admin/users" className="text-sm underline opacity-80 hover:opacity-100">
              Agents
            </Link>
          )}
          <button onClick={logout}
            className="text-sm bg-green-700 hover:bg-green-800 px-3 py-1 rounded-lg">
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          selectedId={selectedLead?.id}
          onSelect={handleSelect}
          liveUpdates={liveUpdates}
        />
        <ChatPanel lead={selectedLead} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create frontend/src/components/UserManagement.jsx**

```jsx
// frontend/src/components/UserManagement.jsx
import { useState } from 'react'
import { usersApi } from '../api'

export default function UserManagement({ users, onRefresh }) {
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'clerk' })
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setCreating(true); setError('')
    try {
      await usersApi.create(form)
      setForm({ email: '', name: '', password: '', role: 'clerk' })
      onRefresh()
    } catch (err) { setError(err.response?.data?.detail || 'Failed') }
    finally { setCreating(false) }
  }

  const toggle = async (u) => {
    await usersApi.update(u.id, { active: !u.active })
    onRefresh()
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Add Agent</h3>
        <form onSubmit={create} className="grid grid-cols-2 gap-3">
          <input placeholder="Email" type="email" required value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Full name" required value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Password" type="password" required value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="clerk">Clerk</option>
            <option value="admin">Admin</option>
          </select>
          {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={creating}
            className="col-span-2 bg-green-500 text-white py-2 rounded-lg font-medium disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Agent'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Name', 'Email', 'Role', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggle(u)}
                    className="text-xs text-gray-500 hover:text-gray-800 underline">
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create frontend/src/pages/AdminUsers.jsx**

```jsx
// frontend/src/pages/AdminUsers.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi } from '../api'
import UserManagement from '../components/UserManagement'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const load = async () => {
    try { const { data } = await usersApi.list(); setUsers(data) } catch { /* ignore */ }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-600 text-white px-6 py-4 flex items-center gap-4 shadow">
        <Link to="/" className="text-sm opacity-80 hover:opacity-100">← Back</Link>
        <h1 className="font-bold text-lg">Agent Management</h1>
      </header>
      <div className="max-w-3xl mx-auto p-6">
        <UserManagement users={users} onRefresh={load} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/Dashboard.jsx src/pages/AdminUsers.jsx src/components/UserManagement.jsx
git commit -m "feat: Dashboard, AdminUsers page, UserManagement component"
```

---

### Task 14: Seed first admin + smoke test

**Files:**
- Create: `seed_admin.py`

- [ ] **Step 1: Create seed_admin.py**

```python
# seed_admin.py — run once to create first admin user
import asyncio
import os
from app.auth import hash_password
from app import db


async def main():
    email = os.environ.get("ADMIN_EMAIL", "admin@yourdomain.com")
    password = os.environ.get("ADMIN_PASSWORD", "changeme123")
    name = os.environ.get("ADMIN_NAME", "Admin")
    await db.init_pool()
    uid = await db.create_user(email, name, hash_password(password), "admin")
    print(f"Admin created: {uid}")
    print(f"Email: {email}")
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Apply DB migration and seed**

```bash
psql $DATABASE_URL -f schema_crm.sql
ADMIN_EMAIL=admin@yourdomain.com ADMIN_PASSWORD=changeme python seed_admin.py
```
Expected: prints `Admin created: <uuid>`

- [ ] **Step 3: Run full unit test suite**

```bash
pytest tests/ -v --ignore=tests/test_db_crm.py
```
Expected: all tests PASS. (`test_db_crm.py` skipped — needs live DB.)

- [ ] **Step 4: Start dev backend**

```bash
uvicorn app.main:app --reload --port 8000
```
Expected: starts with no import errors.

- [ ] **Step 5: Start dev frontend**

```bash
cd frontend && npm run dev
```
Expected: Vite starts on port 5173.

- [ ] **Step 6: Smoke test**

Open `http://localhost:5173`:
1. Redirects to `/login` ✓
2. Enter admin credentials → redirects to `/` ✓
3. Left sidebar shows conversation list ✓
4. Top nav shows name + role + "Agents" link ✓
5. Click a conversation → chat panel shows messages ✓
6. "Take Over" button visible → click → banner shows "Human mode" ✓
7. "Resume AI" in banner → AI Active pill returns ✓
8. Paperclip → pick an image → sends to WA ✓ (requires real WA config)

- [ ] **Step 7: Update CLAUDE.md**

Add under `## API Endpoints` in CLAUDE.md:

```markdown
### CRM (auth required)
- `POST /api/auth/login` — login → access + refresh tokens
- `GET  /api/conversations` — paginated list + unread + AI status
- `GET  /api/conversations/{id}` — detail + messages (clears unread)
- `PUT  /api/leads/{id}/takeover` — pause AI, start 12h timer
- `DEL  /api/leads/{id}/takeover` — resume AI
- `POST /api/chat/{id}/send-text` — agent sends text
- `POST /api/chat/{id}/send-media` — agent sends media (multipart)
- `GET  /api/media/{media_id}` — WA media proxy (auth required)
- `GET  /ws?token=<jwt>` — WebSocket for real-time events

### Admin (admin role only)
- `GET/POST /api/users` — list / create agents
- `PUT/DEL  /api/users/{id}` — update / deactivate agent
- `PUT /api/leads/{id}/assign?agent_id=` — assign lead
```

Also add to Commands section:
```bash
psql -f schema_crm.sql       # CRM tables (run after schema.sql + schema_templates.sql)
python seed_admin.py          # seed first admin user
```

- [ ] **Step 8: Commit everything**

```bash
git add seed_admin.py CLAUDE.md
git commit -m "feat: seed script, smoke test complete, CLAUDE.md updated"
```
