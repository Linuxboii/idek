import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Query, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from . import db, pipeline, templates_api, crm_api
from .ws_manager import ws_manager
from .auth import get_ws_user

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

logging.basicConfig(level=settings.LOG_LEVEL)
log = logging.getLogger("wa-webhook")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    yield
    await db.close_pool()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "https://wa-slilg.avlokai.com",
        "http://wa-slilg.avlokai.com",
    ],
    allow_origin_regex=(
        r"https://.*\.devtunnels\.ms"
        r"|https://.*\.github\.io"
        r"|https://.*\.vercel\.app"
        r"|https://.*\.ngrok-free\.app"
        r"|https://.*\.ngrok\.io"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(templates_api.router)
app.include_router(crm_api.router)

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/admin", include_in_schema=False)
    async def admin_ui():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
else:
    log.warning("Static dir %s not found — /admin UI disabled", STATIC_DIR)


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
                async with ws_manager._lock:
                    ws_manager.channels[lead_id].add(ws)
            elif action == "unsubscribe" and lead_id:
                async with ws_manager._lock:
                    ws_manager.channels[lead_id].discard(ws)
    except WebSocketDisconnect:
        await ws_manager.disconnect("__global__", ws)
        async with ws_manager._lock:
            for channel in list(ws_manager.channels.values()):
                channel.discard(ws)


@app.get("/healthz")
async def health():
    return {"status": "ok"}


@app.get("/webhook", response_class=PlainTextResponse)
async def verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.WA_VERIFY_TOKEN:
        return hub_challenge or ""
    raise HTTPException(status_code=403, detail="verification failed")


@app.post("/webhook")
async def receive(req: Request, bg: BackgroundTasks):
    body = await req.json()
    for entry in body.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value") or {}
            if value.get("messages"):
                bg.add_task(_safe_handle, value)
            if value.get("statuses"):
                bg.add_task(_safe_statuses, value.get("statuses"))
    return {"status": "received"}


async def _safe_statuses(statuses: list) -> None:
    for st in statuses or []:
        try:
            wamid = st.get("id")
            status = st.get("status")  # sent | delivered | read | failed
            if not wamid or not status:
                continue
            err_code = err_title = err_msg = None
            errs = st.get("errors") or []
            if errs:
                e = errs[0]
                err_code = e.get("code")
                err_title = e.get("title")
                err_msg = e.get("message") or (e.get("error_data") or {}).get("details")
            await db.update_status_by_wamid(wamid, status, err_code, err_title, err_msg)
        except Exception:
            log.exception("status update failed")


async def _safe_handle(value: dict) -> None:
    try:
        await pipeline.handle_message(value)
    except Exception:
        log.exception("pipeline failed")
