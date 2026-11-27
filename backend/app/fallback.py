"""Reviewed built-in word lists, used when the AI is off, down, or fails checks.

Every word here passes the validator at every level (3 to 5 letters, no J or Z,
no double letters). tests/test_fallback.py proves that for every theme, level
and count, so a fallback can never be worse than the rules.
"""

import uuid

from .schemas import Lesson, LessonRequest, LessonWord

WORDS: dict[str, list[tuple[str, str]]] = {
    "Animals": [("CAT", "🐱"), ("DOG", "🐶"), ("COW", "🐮"), ("PIG", "🐷"), ("FOX", "🦊"), ("HEN", "🐔"), ("BEAR", "🐻"), ("LION", "🦁")],
    "Food": [("RICE", "🍚"), ("MILK", "🥛"), ("CAKE", "🍰"), ("PEAR", "🍐"), ("CORN", "🌽"), ("BREAD", "🍞"), ("MANGO", "🥭"), ("GRAPE", "🍇")],
    "Family": [("MOM", "👩"), ("DAD", "👨"), ("BABY", "👶"), ("SON", "👦"), ("AUNT", "👩"), ("GRAN", "👵"), ("UNCLE", "🧔"), ("KIDS", "🧒")],
    "School": [("PEN", "🖊️"), ("BAG", "🎒"), ("DESK", "🪑"), ("MAP", "🗺️"), ("RULER", "📏"), ("PAINT", "🎨"), ("CHAIR", "🪑"), ("BUS", "🚌")],
    "Colors": [("RED", "🔴"), ("BLUE", "🔵"), ("PINK", "🌸"), ("WHITE", "⚪"), ("BLACK", "⚫"), ("BROWN", "🟤"), ("GOLD", "🥇"), ("TAN", "🟫")],
    "Nature": [("SUN", "☀️"), ("LEAF", "🍃"), ("RAIN", "🌧️"), ("SNOW", "❄️"), ("STAR", "⭐"), ("ROCK", "🪨"), ("WIND", "💨"), ("SEA", "🌊")],
    "Home": [("BED", "🛏️"), ("CUP", "☕"), ("LAMP", "💡"), ("SOFA", "🛋️"), ("KEY", "🔑"), ("CLOCK", "🕰️"), ("BATH", "🛁"), ("SINK", "🚰")],
    "Body": [("ARM", "💪"), ("LEG", "🦵"), ("HAND", "✋"), ("NOSE", "👃"), ("EYE", "👁️"), ("EAR", "👂"), ("FACE", "🙂"), ("LIPS", "👄")],
}

SENTENCE = {
    "Animals": "I can see the {w}.",
    "Food": "I like {w}.",
    "Family": "I love my {w}.",
    "School": "I use my {w}.",
    "Colors": "I like the color {w}.",
    "Nature": "Look at the {w}.",
    "Home": "We have a {w}.",
    "Body": "This is my {w}.",
}

OPENERS = ["First we spelled", "Then we spelled", "Last we spelled"]


def _join(words: list[str]) -> str:
    if len(words) == 1:
        return words[0]
    return ", ".join(words[:-1]) + " and " + words[-1]


def _story(words: list[str]) -> list[str]:
    """Split the words over exactly 3 short sentences."""
    n = len(words)
    sizes = [n // 3 + (1 if i < n % 3 else 0) for i in range(3)]
    out, start = [], 0
    for opener, size in zip(OPENERS, sizes):
        chunk = [w.lower() for w in words[start : start + size]]
        start += size
        out.append(f"{opener} {_join(chunk)}.")
    return out


def fallback_lesson(req: LessonRequest, warnings: list[str]) -> Lesson:
    pairs = WORDS[req.theme][: req.count]
    words = [
        LessonWord(word=w, emoji=e, sentence=SENTENCE[req.theme].format(w=w.lower()))
        for w, e in pairs
    ]
    return Lesson(
        id=str(uuid.uuid4()),
        theme=req.theme,
        level=req.level,
        words=words,
        story=_story([w for w, _ in pairs]),
        source="fallback",
        warnings=warnings,
    )
