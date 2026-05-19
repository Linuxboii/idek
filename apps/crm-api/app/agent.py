import io
from openai import AsyncOpenAI
from .config import settings
from .prompts import SYSTEM_TEMPLATE

_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def format_history(messages: list[dict]) -> str:
    return "\n".join(f"{m['role']}: {m['message_text']}" for m in messages)


def build_system(ctx: dict) -> str:
    return SYSTEM_TEMPLATE.format(
        name=ctx.get("name") or "unknown",
        size_preference=ctx.get("size_preference") or "unknown",
        preferred_locations=ctx.get("preferred_locations") or "unknown",
        facing=ctx.get("facing") or "unknown",
        budget_min=ctx.get("budget_min") or "unknown",
        scoreDelta=ctx.get("scoreDelta") or 0,
        current_date=ctx.get("current_date") or "",
        formatted_history=ctx.get("formatted_history") or "",
        message_text=ctx.get("message_text") or "",
    )


async def chat(ctx: dict) -> str:
    system = build_system(ctx)
    user_msg = ctx.get("message_text") or ""
    resp = await _client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        max_tokens=settings.OPENAI_MAX_TOKENS,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
    )
    return resp.choices[0].message.content or ""


async def transcribe(audio_bytes: bytes, filename: str = "audio.ogg") -> str:
    bio = io.BytesIO(audio_bytes)
    bio.name = filename
    resp = await _client.audio.transcriptions.create(
        model=settings.OPENAI_TRANSCRIBE_MODEL,
        file=bio,
    )
    return resp.text or ""
