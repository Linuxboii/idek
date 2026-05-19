import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import app.pipeline  # ensure module is loaded before @patch runs  # noqa: F401
from app.pipeline import handle_message

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
