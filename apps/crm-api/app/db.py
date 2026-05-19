import json
import re
from datetime import datetime, timezone
from typing import Any, Optional
import asyncpg
from .config import settings

_pool: Optional[asyncpg.Pool] = None

ALLOWED_FACING = {"east", "west", "north", "south"}


async def init_pool() -> None:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.DATABASE_URL, min_size=1, max_size=10)
        from .auth import ADMIN_USER_ID
        async with _pool.acquire() as con:
            await con.execute(
                """INSERT INTO users (id, email, name, password_hash, role)
                   VALUES ($1::uuid, 'admin@system', 'Admin', '', 'admin')
                   ON CONFLICT DO NOTHING;""",
                ADMIN_USER_ID,
            )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    assert _pool is not None, "DB pool not initialized"
    return _pool


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:]


def _coerce_facing(f: Optional[str]) -> Optional[str]:
    """leads.facing CHECK only allows east/west/north/south. Drop composite facings."""
    if not f:
        return None
    base = f.split("-")[0]
    return base if base in ALLOWED_FACING else None


def _coerce_size_int(v: Any) -> Optional[int]:
    """leads.size_preference is INTEGER. If string range like '1800-2200', use midpoint."""
    if v is None:
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    s = str(v)
    m = re.match(r"(\d+)\s*-\s*(\d+)", s)
    if m:
        return (int(m.group(1)) + int(m.group(2))) // 2
    m = re.search(r"\d+", s)
    return int(m.group(0)) if m else None


def _coerce_budget_int(v: Any) -> Optional[int]:
    """leads.budget_min/max are INTEGER. Extractor emits crore floats — store as lakhs (×100)."""
    if v is None:
        return None
    try:
        return int(round(float(v) * 100))
    except (TypeError, ValueError):
        return None


async def upsert_lead(
    phone: str,
    name: str,
    referral_type: Optional[str],
    referral: Optional[str],
    raw_payload: dict,
) -> str:
    source = "Facebook Ads" if referral_type == "ad" else "WhatsApp"
    q = """
    INSERT INTO leads (phone, name, source, campaign, adset, ad, source_raw, last_message_at, message_count)
    VALUES ($1, $2, $3, $4, NULL, NULL, $5::jsonb, NOW(), 1)
    ON CONFLICT (phone) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
        last_message_at = NOW(),
        message_count = leads.message_count + 1,
        source = CASE
            WHEN leads.source IS NULL OR leads.source = 'unknown'
            THEN EXCLUDED.source ELSE leads.source
        END
    RETURNING id;
    """
    async with pool().acquire() as con:
        row = await con.fetchval(
            q,
            _normalize_phone(phone),
            name or "",
            source,
            referral or "",
            json.dumps(raw_payload),
        )
        return str(row)


async def get_lead_state(phone: str) -> Optional[dict]:
    async with pool().acquire() as con:
        row = await con.fetchrow(
            "SELECT id::text as id, score, escalated, ai_paused_until FROM leads WHERE phone = $1 LIMIT 1;",
            _normalize_phone(phone),
        )
        return dict(row) if row else None


async def insert_message(lead_id: str, role: str, message_text: str) -> None:
    async with pool().acquire() as con:
        await con.execute(
            "INSERT INTO messages (lead_id, role, message_text) VALUES ($1::uuid, $2, $3);",
            lead_id, role, message_text,
        )


async def get_recent_messages(lead_id: str, limit: int = 5) -> list[dict]:
    q = """
    SELECT role, message_text, created_at FROM (
        SELECT role, message_text, created_at FROM messages
        WHERE lead_id = $1::uuid ORDER BY created_at DESC LIMIT $2
    ) s ORDER BY created_at ASC;
    """
    async with pool().acquire() as con:
        rows = await con.fetch(q, lead_id, limit)
        return [dict(r) for r in rows]


async def create_template_job(
    template_name: str, language_code: str, body_params: list[str], total: int,
) -> str:
    q = """
    INSERT INTO template_jobs (template_name, language_code, body_params, total)
    VALUES ($1, $2, $3::jsonb, $4) RETURNING id;
    """
    async with pool().acquire() as con:
        row = await con.fetchval(q, template_name, language_code, json.dumps(body_params), total)
        return str(row)


async def insert_template_send(
    job_id: str, to_phone: str, wamid: Optional[str], status: str,
    error_code: Optional[int] = None, error_title: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    q = """
    INSERT INTO template_sends (job_id, to_phone, wamid, status, error_code, error_title, error_message, sent_at)
    VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, CASE WHEN $4 IN ('accepted','sent') THEN NOW() ELSE NULL END);
    """
    async with pool().acquire() as con:
        await con.execute(q, job_id, to_phone, wamid, status, error_code, error_title, error_message)


async def update_status_by_wamid(
    wamid: str, status: str,
    error_code: Optional[int] = None, error_title: Optional[str] = None, error_message: Optional[str] = None,
) -> bool:
    col_map = {
        "sent": "sent_at", "delivered": "delivered_at",
        "read": "read_at", "failed": "failed_at",
    }
    set_col = col_map.get(status)
    extra = f", {set_col} = COALESCE({set_col}, NOW())" if set_col else ""
    q = f"""
    UPDATE template_sends
       SET status = $2, updated_at = NOW(),
           error_code = COALESCE($3, error_code),
           error_title = COALESCE($4, error_title),
           error_message = COALESCE($5, error_message)
           {extra}
     WHERE wamid = $1
     RETURNING 1;
    """
    async with pool().acquire() as con:
        row = await con.fetchval(q, wamid, status, error_code, error_title, error_message)
        return row is not None


async def get_job(job_id: str) -> Optional[dict]:
    async with pool().acquire() as con:
        job = await con.fetchrow("SELECT * FROM template_jobs WHERE id = $1::uuid;", job_id)
        if not job:
            return None
        rows = await con.fetch(
            "SELECT to_phone, wamid, status, error_code, error_title, error_message, "
            "sent_at, delivered_at, read_at, failed_at "
            "FROM template_sends WHERE job_id = $1::uuid ORDER BY created_at;",
            job_id,
        )
        summary = {"queued": 0, "accepted": 0, "sent": 0, "delivered": 0, "read": 0, "failed": 0}
        sends = []
        for r in rows:
            d = dict(r)
            summary[d["status"]] = summary.get(d["status"], 0) + 1
            for k in ("sent_at", "delivered_at", "read_at", "failed_at"):
                if d[k] is not None:
                    d[k] = d[k].isoformat()
            sends.append(d)
        return {"job": {**dict(job), "id": str(job["id"]),
                        "created_at": job["created_at"].isoformat()},
                "summary": summary, "sends": sends}


async def list_jobs(limit: int = 25) -> list[dict]:
    q = """
    SELECT j.id, j.template_name, j.language_code, j.total, j.created_at,
           COUNT(s.id) FILTER (WHERE s.status = 'delivered') AS delivered,
           COUNT(s.id) FILTER (WHERE s.status = 'read')      AS read,
           COUNT(s.id) FILTER (WHERE s.status = 'failed')    AS failed,
           COUNT(s.id) FILTER (WHERE s.status IN ('queued','accepted','sent')) AS pending
    FROM template_jobs j
    LEFT JOIN template_sends s ON s.job_id = j.id
    GROUP BY j.id
    ORDER BY j.created_at DESC
    LIMIT $1;
    """
    async with pool().acquire() as con:
        rows = await con.fetch(q, limit)
        out = []
        for r in rows:
            d = dict(r)
            d["id"] = str(d["id"])
            d["created_at"] = d["created_at"].isoformat()
            out.append(d)
        return out


async def update_lead_extraction(
    lead_id: str,
    score_delta: int,
    size_preference: Any,
    facing: Optional[str],
    preferred_locations: Optional[str],
    budget_min: Optional[float],
    budget_max: Optional[float],
    budget_estimate: Optional[float],
) -> None:
    locs = None
    if preferred_locations:
        locs = preferred_locations if isinstance(preferred_locations, list) else [preferred_locations]

    size_i = _coerce_size_int(size_preference)
    facing_v = _coerce_facing(facing)
    bmin_i = _coerce_budget_int(budget_min)
    bmax_i = _coerce_budget_int(budget_max)

    q = """
    UPDATE leads SET
        score = LEAST(100, GREATEST(0, score + COALESCE($2, 0))),
        size_preference = COALESCE($3, size_preference),
        facing = COALESCE($4, facing),
        preferred_locations = COALESCE($5, preferred_locations),
        budget_min = COALESCE($6, budget_min),
        budget_max = COALESCE($7, budget_max),
        budget_estimate = COALESCE($8, budget_estimate),
        updated_at = NOW()
    WHERE id = $1::uuid;
    """
    async with pool().acquire() as con:
        await con.execute(
            q, lead_id, score_delta or 0, size_i, facing_v, locs,
            bmin_i, bmax_i, budget_estimate,
        )


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

async def set_takeover(lead_id: str, agent_id: str) -> bool:
    async with pool().acquire() as con:
        row = await con.fetchval(
            """UPDATE leads SET
               ai_paused_until = NOW() + INTERVAL '12 hours',
               ai_paused_by = $2::uuid,
               updated_at = NOW()
               WHERE id = $1::uuid
               RETURNING id;""",
            lead_id, agent_id,
        )
        return row is not None


async def clear_takeover(lead_id: str) -> bool:
    async with pool().acquire() as con:
        row = await con.fetchval(
            "UPDATE leads SET ai_paused_until = NULL, ai_paused_by = NULL, updated_at = NOW() WHERE id = $1::uuid RETURNING id;",
            lead_id,
        )
        return row is not None


# ── Conversations ─────────────────────────────────────────────────────────────

async def list_conversations(
    limit: int = 50,
    offset: int = 0,
    phone: str | None = None,
) -> list[dict]:
    if phone:
        q = """
        SELECT
            l.id::text AS id, l.phone, l.name, l.score,
            l.ai_paused_until, l.unread_count,
            l.assigned_to::text AS assigned_to,
            u.name AS assigned_agent_name,
            m.message_text AS last_message,
            m.created_at   AS last_message_at
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_to
        LEFT JOIN LATERAL (
            SELECT message_text, created_at FROM messages
            WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
        ) m ON TRUE
        WHERE l.phone = $1
        ORDER BY COALESCE(m.created_at, l.created_at) DESC
        LIMIT $2 OFFSET $3;
        """
        args = (phone, limit, offset)
    else:
        q = """
        SELECT
            l.id::text AS id, l.phone, l.name, l.score,
            l.ai_paused_until, l.unread_count,
            l.assigned_to::text AS assigned_to,
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
        args = (limit, offset)

    async with pool().acquire() as con:
        rows = await con.fetch(q, *args)
        out = []
        for r in rows:
            d = dict(r)
            d["ai_active"] = (
                d["ai_paused_until"] is None
                or d["ai_paused_until"] < datetime.now(timezone.utc)
            )
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
        lead_d["ai_active"] = lead_d["ai_paused_until"] is None or lead_d["ai_paused_until"] < datetime.now(timezone.utc)
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
