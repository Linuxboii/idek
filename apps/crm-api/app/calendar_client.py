import uuid
from datetime import datetime, timedelta
from typing import Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build

from .config import settings

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _service():
    if not settings.GCAL_SERVICE_ACCOUNT_FILE:
        raise RuntimeError("GCAL_SERVICE_ACCOUNT_FILE not configured")
    creds = service_account.Credentials.from_service_account_file(
        settings.GCAL_SERVICE_ACCOUNT_FILE, scopes=SCOPES,
    )
    if settings.GCAL_DELEGATED_USER:
        creds = creds.with_subject(settings.GCAL_DELEGATED_USER)
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def build_iso_range(date_str: str, time_str: str) -> tuple[str, str]:
    if len(time_str) == 5:
        time_str = f"{time_str}:00"
    tz = settings.TIMEZONE_OFFSET
    start_iso = f"{date_str}T{time_str}{tz}"
    start_dt = datetime.fromisoformat(start_iso)
    end_dt = start_dt + timedelta(minutes=30)
    end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%S") + tz
    return start_iso, end_iso


def create_event(start_iso: str, end_iso: str, summary: str = "Level Up — Discussion") -> dict:
    svc = _service()
    body = {
        "summary": summary,
        "start": {"dateTime": start_iso, "timeZone": "Asia/Kolkata"},
        "end": {"dateTime": end_iso, "timeZone": "Asia/Kolkata"},
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    event = (
        svc.events()
        .insert(
            calendarId=settings.GCAL_CALENDAR_ID,
            body=body,
            conferenceDataVersion=1,
        )
        .execute()
    )
    return event


def hangout_link(event: dict) -> Optional[str]:
    return event.get("hangoutLink") or (
        event.get("conferenceData", {})
        .get("entryPoints", [{}])[0]
        .get("uri")
    )
