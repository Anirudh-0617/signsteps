"""Lesson generation: prompt -> Gemini -> parse -> validate -> retry -> fallback.

The model is passed in as a plain function (prompt -> JSON text). In production
that function calls Gemini; in tests it is a fake. That is what lets every
failure path (timeout, bad JSON, rule violations) be tested without an API key.
"""

import logging
import re
import time
import uuid
from collections.abc import Callable

from pydantic import ValidationError

from .config import Settings
from .fallback import fallback_lesson
from .schemas import Lesson, LessonRequest, LLMLesson
from .validator import MAX_LEN, MIN_LEN, validate_lesson

log = logging.getLogger("signsteps.generator")

LessonModel = Callable[[str], str]


class ModelUnavailable(Exception):
    """The model could not be reached after all retries."""


PROMPT = """You write tiny spelling lessons for Deaf children aged 7 to 12 who are
learning English words by fingerspelling them in American Sign Language.

Theme: {theme}
Level: {level} of 3
Number of words: {count}

Rules for every word:
- a common, concrete, child-friendly English noun about the theme
- {min_len} to {max_len} letters, letters A to Z only, written in CAPITALS
{level_rules}- one emoji that shows the word
- one simple sentence of at most 10 words that uses the word

Rules for the story:
- exactly 3 short sentences, each at most 10 words
- together they must use every word in the list
- warm, simple, safe for young children

Return only JSON that matches the schema."""


def build_prompt(req: LessonRequest, feedback: str | None = None) -> str:
    level_rules = ""
    if req.level < 3:
        level_rules += "- no letter J and no letter Z\n"
    if req.level == 1:
        level_rules += "- no double letters next to each other (not BOOK, not TREE)\n"
    prompt = PROMPT.format(
        theme=req.theme,
        level=req.level,
        count=req.count,
        min_len=MIN_LEN,
        max_len=MAX_LEN[req.level],
        level_rules=level_rules,
    )
    if feedback:
        prompt += f"\n\nYour previous answer was rejected: {feedback}\nFix these problems."
    return prompt


_PERMANENT_STATUS = re.compile(r"\b(400|401|403|404)\b")
_PERMANENT_MARKERS = (
    "INVALID_ARGUMENT",
    "UNAUTHENTICATED",
    "PERMISSION_DENIED",
    "NOT_FOUND",
    "API_KEY_INVALID",
    "API key not valid",
)


def _is_permanent_api_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code in {400, 401, 403, 404}:
        return True
    msg = str(exc)
    return bool(_PERMANENT_STATUS.search(msg) or any(m in msg for m in _PERMANENT_MARKERS))


def _summarize_api_error(exc: Exception) -> str:
    msg = str(exc)
    for code in (
        "400 INVALID_ARGUMENT",
        "401 UNAUTHENTICATED",
        "403 PERMISSION_DENIED",
        "404 NOT_FOUND",
        "429 RESOURCE_EXHAUSTED",
        "503 UNAVAILABLE",
        "504 DEADLINE_EXCEEDED",
    ):
        if code in msg:
            return code
    if "API key not valid" in msg or "API_KEY_INVALID" in msg:
        return "400 API_KEY_INVALID"
    return type(exc).__name__


def call_with_retry(
    model: LessonModel,
    prompt: str,
    retries: int = 2,
    base_delay: float = 1.0,
    sleep: Callable[[float], None] = time.sleep,
    trace: dict | None = None,
    deadline: float | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> str:
    """Exponential backoff on transient errors; permanent errors fail immediately."""
    last: Exception | None = None
    for attempt in range(retries + 1):
        if deadline is not None and attempt > 0 and clock() >= deadline:
            raise ModelUnavailable("time budget exceeded before retry")
        if trace is not None:
            trace["api_calls"] = trace.get("api_calls", 0) + 1
        try:
            return model(prompt)
        except Exception as e:  # network errors, 429, 5xx, timeouts, or 4xx config errors
            last = e
            log.warning("model call failed (attempt %d): %s", attempt + 1, e)
            if trace is not None:
                trace.setdefault("api_errors", []).append(_summarize_api_error(e))
            if _is_permanent_api_error(e):
                log.error("permanent API error (not retrying): %s", e)
                raise ModelUnavailable(str(e)) from e
            if attempt < retries:
                delay = base_delay * 2**attempt
                if deadline is not None and clock() + delay >= deadline:
                    raise ModelUnavailable("time budget exceeded before backoff") from e
                if trace is not None:
                    trace["network_retries"] = trace.get("network_retries", 0) + 1
                sleep(delay)
    raise ModelUnavailable(str(last))


def create_lesson(
    req: LessonRequest,
    model: LessonModel | None,
    retries: int = 2,
    sleep: Callable[[float], None] = time.sleep,
    trace: dict | None = None,
    budget_s: float = 35.0,
    clock: Callable[[], float] = time.perf_counter,
) -> Lesson:
    started = clock()
    deadline = started + budget_s
    if trace is not None:
        trace.setdefault("draft_attempts", 0)
        trace.setdefault("api_calls", 0)
        trace.setdefault("network_retries", 0)
        trace.setdefault("validation_failures", [])
        trace.setdefault("drop_reasons", [])
        trace.setdefault("api_errors", [])

    if model is None:
        return fallback_lesson(req, ["AI is not set up (no GEMINI_API_KEY), so a built-in list was used."])

    last_warnings: list[str] = []
    feedback: str | None = None
    for attempt in (1, 2):  # first draft + one regeneration with feedback
        if attempt > 1 and clock() >= deadline:
            log.warning("time budget exceeded before regeneration; using fallback")
            break
        try:
            text = call_with_retry(
                model,
                build_prompt(req, feedback),
                retries=retries,
                sleep=sleep,
                trace=trace,
                deadline=deadline,
                clock=clock,
            )
        except ModelUnavailable as e:
            log.error("model unavailable, using fallback: %s", e)
            msg = (
                "The AI service is unavailable (check GEMINI_API_KEY or GEMINI_MODEL), so a built-in list was used."
                if _is_permanent_api_error(e)
                else "The AI service was unavailable, so a built-in list was used."
            )
            return fallback_lesson(req, [msg])

        if trace is not None:
            trace["draft_attempts"] += 1

        try:
            draft = LLMLesson.model_validate_json(text)
        except ValidationError as e:
            log.warning("attempt %d: output did not match schema: %s", attempt, e.errors()[:3])
            if trace is not None:
                trace["validation_failures"].append("Invalid JSON / schema mismatch")
            feedback = "your reply was not valid JSON for the required schema."
            continue

        result = validate_lesson(draft, req)
        last_warnings = result.warnings
        if trace is not None:
            for w in result.warnings:
                if ": " in w:
                    trace["drop_reasons"].append(w.split(": ", 1)[1].rstrip("."))
                elif w.startswith("Dropped duplicate"):
                    trace["drop_reasons"].append("duplicate word")
                else:
                    trace["drop_reasons"].append(w)
        if result.ok:
            log.info(
                "lesson ok theme=%s level=%s attempt=%d ms=%d",
                req.theme, req.level, attempt, (clock() - started) * 1000,
            )
            return Lesson(
                id=str(uuid.uuid4()),
                theme=req.theme,
                level=req.level,
                words=result.words,
                story=result.story,
                source="ai",
                warnings=result.warnings,
            )
        if trace is not None:
            trace["validation_failures"].extend(result.errors)
        feedback = " ".join(result.errors)
        log.warning("attempt %d failed validation: %s", attempt, feedback)

    return fallback_lesson(req, last_warnings + ["The AI draft failed the checks twice, so a built-in list was used."])


def gemini_model(settings: Settings) -> LessonModel:
    """Real model. Imported lazily so tests never need the SDK or a key."""
    from google import genai
    from google.genai import types

    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=int(settings.timeout_s * 1000)),
    )
    config = types.GenerateContentConfig(
        temperature=settings.temperature,
        response_mime_type="application/json",
        response_schema=LLMLesson,
    )

    def call(prompt: str) -> str:
        resp = client.models.generate_content(model=settings.gemini_model, contents=prompt, config=config)
        if not resp.text:
            raise RuntimeError("empty response from model")
        return resp.text

    return call
