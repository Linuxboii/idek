import httpx
from .config import settings

GRAPH = "https://graph.facebook.com/v21.0"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }


async def send_text(to_phone: str, body: str) -> dict:
    url = f"{GRAPH}/{settings.WA_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": body},
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, headers=_headers(), json=payload)
        r.raise_for_status()
        return r.json()


async def send_template(
    to_phone: str,
    template_name: str,
    language_code: str = "en_US",
    body_params: list[str] | None = None,
) -> dict:
    components = []
    if body_params:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in body_params],
        })
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            **({"components": components} if components else {}),
        },
    }
    url = f"{GRAPH}/{settings.WA_PHONE_NUMBER_ID}/messages"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, headers=_headers(), json=payload)
        return {"status_code": r.status_code, "body": r.json() if r.content else {}}


async def get_templates() -> list[dict]:
    """Fetch approved message templates from Meta Graph API."""
    waba_id = settings.WA_BUSINESS_ACCOUNT_ID
    if not waba_id:
        return []
    url = f"{GRAPH}/{waba_id}/message_templates?limit=100&status=APPROVED"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url, headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}"})
        r.raise_for_status()
        data = r.json()
        return [
            {
                "name": t["name"],
                "language": t["language"],
                "category": t.get("category", ""),
                "components": t.get("components", []),
            }
            for t in data.get("data", [])
        ]


async def get_media_url(media_id: str) -> str:
    url = f"{GRAPH}/{media_id}"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url, headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}"})
        r.raise_for_status()
        return r.json()["url"]


async def download_media(media_url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(media_url, headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}"})
        r.raise_for_status()
        return r.content, r.headers.get("content-type", "audio/ogg")


async def upload_media(file_bytes: bytes, content_type: str, filename: str) -> str:
    """Upload bytes to WhatsApp Media API. Returns media_id."""
    url = f"{GRAPH}/{settings.WA_PHONE_NUMBER_ID}/media"
    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.post(
            url,
            headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}"},
            files={"file": (filename, file_bytes, content_type)},
            data={"messaging_product": "whatsapp"},
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
    url = f"{GRAPH}/{settings.WA_PHONE_NUMBER_ID}/messages"
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(
            url,
            headers={"Authorization": f"Bearer {settings.WA_ACCESS_TOKEN}",
                     "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()
