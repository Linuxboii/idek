import re
from typing import Any


LOCATION_MAP = {
    "manikonda": ["manikonda"],
    "puppalaguda": ["puppalaguda", "puppalguda", "pupplagudda", "puplaguda"],
    "gachibowli": ["gachibowli", "gachiboli"],
    "kondapur": ["kondapur"],
    "kokapet": ["kokapet"],
    "narsingi": ["narsingi"],
    "madhapur": ["madhapur"],
    "financial district": ["financial district", "fin dist"],
}

FACING_PATTERNS = [
    "north east", "north west", "south east", "south west",
    "east", "west", "north", "south",
]


def extract(message: str) -> dict[str, Any]:
    raw = (message or "").lower()
    msg = re.sub(r"[,₹]", " ", raw)
    msg = re.sub(r"crores?", "cr", msg)
    msg = re.sub(r"rs\.?", "", msg)
    msg = re.sub(r"\s+", " ", msg).strip()

    size_preference = None
    preferred_locations = None
    facing = None
    budget_min = None
    budget_max = None
    budget_estimate = None
    score_delta = 0
    size_q = facing_q = loc_q = budget_q = False

    # SIZE
    size_text = msg.replace("to", "-")
    sr = re.search(r"(\d{2,4})\s*-\s*(\d{2,4})", size_text)
    if sr:
        mn, mx = int(sr.group(1)), int(sr.group(2))
        if mn < 100: mn *= 100
        if mx < 100: mx *= 100
        if mn > mx: mn, mx = mx, mn
        size_preference = f"{mn}-{mx}"
        if 2365 <= mn and mx <= 3105:
            size_q = True; score_delta += 25
        else:
            score_delta -= 10
    else:
        ss = re.search(r"\b(\d{2,4})\b", size_text)
        if ss:
            v = int(ss.group(1))
            if v < 100: v *= 100
            size_preference = v
            if 2365 <= v <= 3105:
                size_q = True; score_delta += 25
            else:
                score_delta -= 10

    # FACING
    for f in FACING_PATTERNS:
        if f in msg:
            facing = f.replace(" ", "-")
            if f in ("east", "west"):
                facing_q = True; score_delta += 15
            else:
                score_delta -= 5
            break

    # BUDGET
    rm = re.search(r"(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*cr", msg)
    sm = re.search(r"(\d+(?:\.\d+)?)\s*cr", msg)
    lm = re.search(r"(\d+(?:\.\d+)?)\s*lakh", msg)
    if rm:
        budget_min = float(rm.group(1))
        budget_max = float(rm.group(2))
        budget_estimate = (budget_min + budget_max) / 2
        if budget_max >= 2.25:
            budget_q = True; score_delta += 25
        else:
            score_delta -= 15
    elif sm:
        budget_estimate = float(sm.group(1))
        if budget_estimate >= 2.25:
            budget_q = True; score_delta += 25
        else:
            score_delta -= 15
    elif lm:
        budget_estimate = round(float(lm.group(1)) / 100, 2)
        if budget_estimate >= 2.25:
            budget_q = True; score_delta += 25
        else:
            score_delta -= 15

    # LOCATION
    loc_text = re.sub(r"[^a-z\s]", " ", msg)
    loc_text = re.sub(r"\s+", " ", loc_text).strip()
    for canonical, variants in LOCATION_MAP.items():
        if any(v in loc_text for v in variants):
            preferred_locations = canonical
            break
    if not preferred_locations:
        if "any" in loc_text or "open" in loc_text:
            preferred_locations = "flexible"
    if not preferred_locations and loc_text and len(loc_text.split()) <= 3:
        preferred_locations = loc_text

    if preferred_locations == "manikonda":
        loc_q = True; score_delta += 20
    elif preferred_locations:
        score_delta -= 10

    score_delta = max(0, min(100, score_delta))

    return {
        "message_text": raw,
        "size_preference": size_preference,
        "preferred_locations": preferred_locations,
        "facing": facing,
        "budget_min": budget_min,
        "budget_max": budget_max,
        "budget_estimate": budget_estimate,
        "scoreDelta": score_delta,
        "qualification": {
            "sizeQualified": size_q,
            "facingQualified": facing_q,
            "locationQualified": loc_q,
            "budgetQualified": budget_q,
        },
    }
