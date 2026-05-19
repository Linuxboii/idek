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
    await mgr.disconnect("lead-1", ws)
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
