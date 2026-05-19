import asyncio
import re
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import db, whatsapp
from .config import settings

router = APIRouter(prefix="/api", tags=["templates"])


class SendTemplateIn(BaseModel):
    numbers: list[str] = Field(..., description="E.164 phone numbers, country code included")
    template_name: str
    language_code: str = "en_US"
    body_params: list[str] = []


class SendResult(BaseModel):
    to: str
    ok: bool
    status_code: int | None = None
    error: Optional[str] = None
    wamid: Optional[str] = None
    response: dict | None = None


class SendTemplateOut(BaseModel):
    job_id: str
    total: int
    succeeded: int
    failed: int
    results: list[SendResult]


def _auth(token: Optional[str]) -> None:
    if not token or not token.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    if token.removeprefix("Bearer ").strip() != settings.ADMIN_TOKEN:
        raise HTTPException(403, "invalid token")


def _clean_phone(p: str) -> Optional[str]:
    digits = re.sub(r"\D", "", p or "")
    return digits if 8 <= len(digits) <= 15 else None


async def _send_one(job_id: str, phone: str, name: str, lang: str, params: list[str]) -> SendResult:
    try:
        resp = await whatsapp.send_template(phone, name, lang, params)
        ok = 200 <= resp["status_code"] < 300
        body = resp["body"] or {}
        wamid = None
        if ok and body.get("messages"):
            wamid = body["messages"][0].get("id")

        if ok:
            await db.insert_template_send(job_id, phone, wamid, "accepted")
            return SendResult(to=phone, ok=True, status_code=resp["status_code"],
                              wamid=wamid, response=body)
        err = body.get("error") or {}
        await db.insert_template_send(
            job_id, phone, None, "failed",
            error_code=err.get("code"),
            error_title=err.get("error_subcode") and str(err.get("error_subcode")),
            error_message=err.get("message"),
        )
        return SendResult(to=phone, ok=False, status_code=resp["status_code"],
                          error=err.get("message", "unknown"), response=body)
    except Exception as e:
        await db.insert_template_send(job_id, phone, None, "failed", error_message=str(e))
        return SendResult(to=phone, ok=False, error=str(e))


@router.post("/send-template", response_model=SendTemplateOut)
async def send_template_bulk(
    body: SendTemplateIn,
    authorization: Optional[str] = Header(None),
):
    _auth(authorization)
    cleaned = [c for c in (_clean_phone(n) for n in body.numbers) if c]
    if not cleaned:
        raise HTTPException(400, "no valid numbers")

    job_id = await db.create_template_job(
        body.template_name, body.language_code, body.body_params, len(cleaned),
    )

    sem = asyncio.Semaphore(5)

    async def guarded(p: str) -> SendResult:
        async with sem:
            return await _send_one(job_id, p, body.template_name, body.language_code, body.body_params)

    results = await asyncio.gather(*(guarded(p) for p in cleaned))
    return SendTemplateOut(
        job_id=job_id,
        total=len(results),
        succeeded=sum(1 for r in results if r.ok),
        failed=sum(1 for r in results if not r.ok),
        results=results,
    )


@router.get("/templates")
async def list_templates(authorization: Optional[str] = Header(None)):
    _auth(authorization)
    templates = await whatsapp.get_templates()
    return {"templates": templates}


@router.get("/jobs")
async def list_jobs(authorization: Optional[str] = Header(None), limit: int = 25):
    _auth(authorization)
    return {"jobs": await db.list_jobs(limit)}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, authorization: Optional[str] = Header(None)):
    _auth(authorization)
    j = await db.get_job(job_id)
    if not j:
        raise HTTPException(404, "job not found")
    return j
