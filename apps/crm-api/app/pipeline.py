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

    # Resolve message text
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
