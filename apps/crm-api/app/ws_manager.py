import asyncio
import logging
from collections import defaultdict
from typing import Any
from fastapi import WebSocket

log = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, lead_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.channels[lead_id].add(ws)

    async def disconnect(self, lead_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self.channels[lead_id].discard(ws)
            if not self.channels[lead_id]:
                self.channels.pop(lead_id, None)

    async def broadcast(self, lead_id: str, data: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self.channels.get(lead_id, set()))
        dead: set[WebSocket] = set()
        for ws in targets:
            try:
                await ws.send_json(data)
            except Exception as exc:
                log.debug("ws dead lead_id=%s: %s", lead_id, exc)
                dead.add(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self.channels[lead_id].discard(ws)
                if not self.channels.get(lead_id):
                    self.channels.pop(lead_id, None)

    async def broadcast_all(self, data: dict[str, Any]) -> None:
        async with self._lock:
            lead_ids = list(self.channels.keys())
        for lead_id in lead_ids:
            await self.broadcast(lead_id, data)


# Singleton — imported by pipeline.py and crm_api.py
ws_manager = WebSocketManager()
