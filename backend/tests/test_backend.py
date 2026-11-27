"""Backend tests. No API key needed: the model is a fake function."""

import json

import pytest
from fastapi.testclient import TestClient

from app.fallback import WORDS, fallback_lesson
from app.generator import ModelUnavailable, call_with_retry, create_lesson
from app.main import app, get_model
from app.schemas import LessonRequest, LLMLesson
from app.validator import validate_lesson, word_problem

NO_SLEEP = lambda _s: None  # noqa: E731


def good_reply(n: int = 5) -> str:
    words = ["CAT", "DOG", "COW", "PIG", "FOX", "HEN", "BEAR", "LION"][:n]
    return json.dumps(
        {
            "words": [{"word": w, "emoji": "🐾", "sentence": f"I see the {w.lower()}."} for w in words],
            "story": [
                f"The {words[0].lower()} and the {words[1].lower()} play.",
                " ".join(f"A {w.lower()}." for w in words[2:4]),
                " ".join(f"A {w.lower()}." for w in words[4:]),
            ],
        }
    )


REQ = LessonRequest(theme="Animals", level=1, count=5)


# ---------- word rules ----------

@pytest.mark.parametrize(
    "word,level,bad",
    [
        ("CAT", 1, False),
        ("ANIMAL", 1, False),  # 6 letters allowed at level 1 per spec
        ("GIRAFFE", 1, True),  # 7 letters too long for level 1
        ("BOOK", 1, True),  # double letter at level 1
        ("BOOK", 2, False),
        ("ZEBRA", 2, True),  # Z before level 3
        ("ZEBRA", 3, False),
        ("ELEPHANT", 1, True),  # too long
        ("C4T", 1, True),  # not letters only
        ("GUN", 1, True),  # blocklist
    ],
)
def test_word_rules(word, level, bad):
    assert (word_problem(word, level) is not None) == bad


def test_validator_accepts_good_lesson():
    result = validate_lesson(LLMLesson.model_validate_json(good_reply()), REQ)
    assert result.ok, result.errors
    assert len(result.words) == 5


def test_validator_rejects_story_missing_words():
    draft = json.loads(good_reply())
    draft["story"] = ["A cat.", "A dog.", "The end."]
    result = validate_lesson(LLMLesson.model_validate(draft), REQ)
    assert not result.ok
    assert any("missing" in e for e in result.errors)


def test_validator_drops_bad_words_and_needs_enough():
    draft = json.loads(good_reply())
    draft["words"][0]["word"] = "ZOO"  # Z and double O at level 1
    result = validate_lesson(LLMLesson.model_validate(draft), REQ)
    assert not result.ok  # only 4 valid words left, 5 needed
    assert any("ZOO" in w for w in result.warnings)


# ---------- generator paths ----------

def test_ai_path():
    lesson = create_lesson(REQ, lambda _p: good_reply(), sleep=NO_SLEEP)
    assert lesson.source == "ai"


def test_bad_json_then_good_regenerates():
    replies = iter(["not json", good_reply()])
    lesson = create_lesson(REQ, lambda _p: next(replies), sleep=NO_SLEEP)
    assert lesson.source == "ai"


def test_always_invalid_falls_back():
    lesson = create_lesson(REQ, lambda _p: '{"words": [], "story": []}', sleep=NO_SLEEP)
    assert lesson.source == "fallback"
    assert lesson.warnings


def test_model_down_falls_back():
    def broken(_p):
        raise TimeoutError("simulated timeout")

    lesson = create_lesson(REQ, broken, sleep=NO_SLEEP)
    assert lesson.source == "fallback"
    assert any("unavailable" in w for w in lesson.warnings)


def test_retry_backoff_then_success():
    calls = {"n": 0}
    waits = []

    def flaky(_p):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionError("503")
        return "ok"

    assert call_with_retry(flaky, "p", retries=2, sleep=waits.append) == "ok"
    assert waits == [1.0, 2.0]


def test_retry_gives_up():
    def broken(_p):
        raise ConnectionError("down")

    with pytest.raises(ModelUnavailable):
        call_with_retry(broken, "p", retries=2, sleep=NO_SLEEP)


def test_no_key_uses_fallback():
    assert create_lesson(REQ, None).source == "fallback"


def test_network_retry_not_counted_as_regeneration():
    calls = {"n": 0}
    trace: dict = {}

    def flaky(_p):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("503 UNAVAILABLE")
        return good_reply()

    lesson = create_lesson(REQ, flaky, sleep=NO_SLEEP, trace=trace)
    assert lesson.source == "ai"
    assert trace["draft_attempts"] == 1
    assert trace["api_calls"] == 2
    assert trace["network_retries"] == 1
    assert trace["api_errors"] == ["503 UNAVAILABLE"]


def test_trace_records_validation_failures_and_drop_reasons():
    bad = json.loads(good_reply())
    bad["words"][0]["word"] = "ZOO"
    bad["story"] = ["A dog.", "A cow.", "A pig."]
    replies = iter([json.dumps(bad), good_reply()])
    trace: dict = {}

    lesson = create_lesson(REQ, lambda _p: next(replies), sleep=NO_SLEEP, trace=trace)
    assert lesson.source == "ai"
    assert trace["draft_attempts"] == 2
    assert any("J or Z" in r for r in trace["drop_reasons"])
    assert any("Only 4 valid words" in f for f in trace["validation_failures"])


# ---------- fallback is always valid ----------

@pytest.mark.parametrize("theme", list(WORDS))
@pytest.mark.parametrize("level", [1, 2, 3])
@pytest.mark.parametrize("count", [5, 6, 7, 8])
def test_fallback_passes_validator(theme, level, count):
    req = LessonRequest(theme=theme, level=level, count=count)
    lesson = fallback_lesson(req, [])
    draft = LLMLesson(words=lesson.words, story=lesson.story)
    result = validate_lesson(draft, req)
    assert result.ok, result.errors


# ---------- API ----------

client = TestClient(app)


def test_api_generate_with_fake_model():
    app.dependency_overrides[get_model] = lambda: (lambda _p: good_reply())
    try:
        r = client.post("/lessons/generate", json={"theme": "Animals", "level": 1, "count": 5})
        assert r.status_code == 200
        assert r.json()["source"] == "ai"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "body",
    [
        {"theme": "Animals", "level": 1, "count": 9},  # too many words
        {"theme": "Weapons", "level": 1, "count": 5},  # not an allowed theme
        {"theme": "Animals", "level": 4, "count": 5},  # bad level
    ],
)
def test_api_rejects_bad_input(body):
    assert client.post("/lessons/generate", json=body).status_code == 422


def test_health():
    assert client.get("/health").json()["status"] == "ok"


@pytest.mark.parametrize(
    "err_msg",
    [
        "400 INVALID_ARGUMENT: API key not valid. Please pass a valid API key.",
        "401 UNAUTHENTICATED: Invalid credentials.",
        "403 PERMISSION_DENIED: Caller does not have permission.",
        "404 NOT_FOUND: models/missing is not found.",
    ],
)
def test_permanent_api_error_is_not_retried(err_msg):
    calls = {"n": 0}
    waits = []
    trace: dict = {}

    def broken(_p):
        calls["n"] += 1
        raise RuntimeError(err_msg)

    lesson = create_lesson(REQ, broken, retries=2, sleep=waits.append, trace=trace)
    assert lesson.source == "fallback"
    assert calls["n"] == 1
    assert waits == []
    assert trace["network_retries"] == 0
    assert any("unavailable" in w for w in lesson.warnings)


def test_rejected_draft_warnings_do_not_leak_onto_accepted_lesson():
    bad = json.loads(good_reply())
    bad["words"][0]["word"] = "ZOO"  # dropped at level 1 -> leaves 4 words, fails validation
    replies = iter([json.dumps(bad), good_reply()])

    lesson = create_lesson(REQ, lambda _p: next(replies), sleep=NO_SLEEP)
    assert lesson.source == "ai"
    assert lesson.warnings == []


def test_budget_cuts_off_slow_retries_and_falls_back():
    ticks = iter([0.0, 20.0, 36.0])  # started=0.0, then clock exceeds 35s budget on retry
    calls = {"n": 0}

    def slow(_p):
        calls["n"] += 1
        raise TimeoutError("slow")

    lesson = create_lesson(REQ, slow, retries=2, sleep=NO_SLEEP, budget_s=35.0, clock=lambda: next(ticks, 40.0))
    assert lesson.source == "fallback"
    assert calls["n"] == 1
