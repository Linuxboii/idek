import logging
from datetime import datetime, timezone, timedelta
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


@router.get("/conversations")
async def list_conversations(
    phone: str | None = None,
    limit: int = 50,
    offset: int = 0,
    _user=Depends(get_current_user),
):
    return await db.list_conversations(limit=limit, offset=offset, phone=phone)


@router.get("/conversations/{lead_id}")
async def get_conversation(lead_id: str, _user=Depends(get_current_user)):
    conv = await db.get_conversation(lead_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.clear_unread(lead_id)
    return conv


@router.put("/leads/{lead_id}/takeover")
async def takeover(lead_id: str, user=Depends(get_current_user)):
    await db.set_takeover(lead_id, user["id"])
    await ws_manager.broadcast(lead_id, {
        "event": "takeover",
        "lead_id": lead_id,
        "paused_until": (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
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


@router.post("/chat/{lead_id}/send-text")
async def send_text(lead_id: str, req: SendTextRequest, user=Depends(get_current_user)):
    conv = await db.get_conversation(lead_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Lead not found")
    msg_id = await db.insert_agent_message(lead_id, user["id"], req.text)
    await db.set_takeover(lead_id, user["id"])
    await whatsapp.send_text(conv["lead"]["phone"], req.text)
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
async def send_media_endpoint(
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
    text_repr = f"[{wa_type}: {file.filename}]"
    msg_id = await db.insert_agent_message(
        lead_id, user["id"], text_repr, media_type=wa_type, media_id=media_id,
    )
    await db.set_takeover(lead_id, user["id"])
    await whatsapp.send_media(
        conv["lead"]["phone"], wa_type, media_id,
        caption=caption, filename=file.filename or "",
    )
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


@router.get("/media/{media_id}")
async def proxy_media(media_id: str, _user=Depends(get_current_user)):
    from .config import settings
    async with httpx.AsyncClient() as client:
        meta = await client.get(
            f"https://graph.facebook.com/v19.0/{media_id}",
            headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}"},
            timeout=15,
        )
        meta.raise_for_status()
        media_url = meta.json().get("url")
        resp = await client.get(
            media_url,
            headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}"},
            timeout=60,
        )
        resp.raise_for_status()
    return StreamingResponse(
        iter([resp.content]),
        media_type=resp.headers.get("content-type", "application/octet-stream"),
    )
