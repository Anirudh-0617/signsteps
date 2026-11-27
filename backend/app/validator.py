"""Deterministic checks on every AI-drafted lesson. No LLM involved here.

Why rules and not a second model: rules are free, instant, testable, and give
the same answer every time. The teacher review in the UI is the final gate.

Word rules come from what the SignSpeak recognizer can actually do:
- letters only (it recognises A to Z, nothing else)
- J and Z are drawn with motion and are the least reliable, so they are kept
  out of levels 1 and 2
- level 1 avoids double letters (BOOK, TREE): the recognizer needs the hand to
  move between repeats, which is hard for beginners
"""

import re
from dataclasses import dataclass, field

from .schemas import LessonRequest, LessonWord, LLMLesson

MAX_LEN = {1: 6, 2: 6, 3: 8}
MIN_LEN = 3
MOTION_LETTERS = {"J", "Z"}
MAX_SENTENCE_WORDS = 10
STORY_SENTENCES = 3
DEFAULT_EMOJI = "⭐"

# Small static blocklist for a children's product. Not exhaustive: the teacher
# review is the real safety net. Extend as needed.
BLOCKLIST = {
    "kill", "killed", "dead", "die", "death", "blood", "gun", "guns", "knife", "war",
    "hate", "stupid", "dumb", "ugly", "idiot", "fat", "sex", "sexy", "drug", "drugs",
    "beer", "wine", "drunk", "smoke", "cigarette", "bomb", "fight", "hurt", "scary",
}

_TOKEN = re.compile(r"[a-zA-Z']+")


def tokens(text: str) -> list[str]:
    return [t.lower().strip("'") for t in _TOKEN.findall(text)]


def has_double_letter(word: str) -> bool:
    return any(a == b for a, b in zip(word, word[1:]))


def word_problem(word: str, level: int) -> str | None:
    """Return why a word is not allowed at this level, or None if it is fine."""
    if not re.fullmatch(r"[A-Z]+", word):
        return "must be letters A to Z only"
    if not MIN_LEN <= len(word) <= MAX_LEN[level]:
        return f"must be {MIN_LEN} to {MAX_LEN[level]} letters at level {level}"
    if level < 3 and MOTION_LETTERS & set(word):
        return "contains J or Z, which need motion and are kept for level 3"
    if level == 1 and has_double_letter(word):
        return "has a double letter, which is hard at level 1"
    if word.lower() in BLOCKLIST:
        return "is on the blocklist"
    return None


def sentence_problem(sentence: str, word: str) -> str | None:
    toks = tokens(sentence)
    if not toks:
        return "sentence is empty"
    if len(toks) > MAX_SENTENCE_WORDS:
        return f"sentence is longer than {MAX_SENTENCE_WORDS} words"
    if word.lower() not in toks:
        return "sentence does not use the word"
    if BLOCKLIST & set(toks):
        return "sentence contains a blocked word"
    return None


@dataclass
class ValidationResult:
    ok: bool
    words: list[LessonWord] = field(default_factory=list)
    story: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)  # reasons to regenerate
    warnings: list[str] = field(default_factory=list)  # shown to the teacher


def validate_lesson(draft: LLMLesson, req: LessonRequest) -> ValidationResult:
    result = ValidationResult(ok=False)
    seen: set[str] = set()
    kept: list[LessonWord] = []

    for item in draft.words:
        word = item.word.strip().upper()
        if word in seen:
            result.warnings.append(f"Dropped duplicate word {word}.")
            continue
        seen.add(word)

        problem = word_problem(word, req.level)
        if problem is None:
            problem = sentence_problem(item.sentence.strip(), word)
        if problem:
            result.warnings.append(f"Dropped {word or '(empty)'}: {problem}.")
            continue

        emoji = item.emoji.strip()
        if not emoji or len(emoji) > 8:
            emoji = DEFAULT_EMOJI
        kept.append(LessonWord(word=word, emoji=emoji, sentence=item.sentence.strip()))

    if len(kept) < req.count:
        result.errors.append(
            f"Only {len(kept)} valid words, {req.count} needed. Rules: {MIN_LEN} to "
            f"{MAX_LEN[req.level]} letters A to Z"
            + (", no J or Z" if req.level < 3 else "")
            + (", no double letters" if req.level == 1 else "")
            + ", a short sentence using the word."
        )
        return result
    kept = kept[: req.count]

    story = [s.strip() for s in draft.story if s.strip()]
    if len(story) != STORY_SENTENCES:
        result.errors.append(f"Story must have exactly {STORY_SENTENCES} sentences, got {len(story)}.")
    for s in story:
        toks = tokens(s)
        if len(toks) > MAX_SENTENCE_WORDS:
            result.errors.append(f"Story sentence too long: '{s}'.")
        if BLOCKLIST & set(toks):
            result.errors.append("Story contains a blocked word.")
    story_tokens = {t for s in story for t in tokens(s)}
    missing = [w.word for w in kept if w.word.lower() not in story_tokens]
    if missing:
        result.errors.append(f"Story must use every word; missing: {', '.join(missing)}.")

    result.words = kept
    result.story = story
    result.ok = not result.errors
    return result
