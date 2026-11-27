"""Evaluation for the lesson generator (needs GEMINI_API_KEY in backend/.env).

Generates lessons across themes and levels and reports how often the AI draft
passed validation on the first draft, needed a regeneration (separate from
transient network retries), or fell back, plus every word-drop reason,
validation failure reason, and API error. Writes docs/EVALUATION_LESSONS.md.

Run from backend/:  python eval_lessons.py --per-level 1
"""

import argparse
import collections
import logging
import pathlib
import time

from app.config import get_settings
from app.generator import create_lesson, gemini_model
from app.schemas import LessonRequest, LLMLesson
from app.validator import validate_lesson

THEMES = ["Animals", "Food", "Family", "School", "Colors", "Nature", "Home", "Body"]


def _normalize_failure(msg: str) -> str:
    if msg.startswith("Only "):
        return "Too few valid words left after filtering"
    if msg.startswith("Story must use every word"):
        return "Story missing one or more target words"
    if msg.startswith("Story must have exactly"):
        return "Story wrong sentence count"
    if msg.startswith("Story sentence too long"):
        return "Story sentence > 10 words"
    return msg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-level", type=int, default=1)
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--sleep", type=float, default=4.5, help="Seconds between lessons to stay under free-tier RPM")
    args = ap.parse_args()

    settings = get_settings()
    if not settings.gemini_api_key:
        raise SystemExit("Set GEMINI_API_KEY in backend/.env first.")
    logging.basicConfig(level=logging.WARNING)
    base = gemini_model(settings)

    rows = []
    drop_reasons: collections.Counter[str] = collections.Counter()
    val_failures: collections.Counter[str] = collections.Counter()
    api_errors: collections.Counter[str] = collections.Counter()

    for theme in THEMES:
        for level in (1, 2, 3):
            for _ in range(args.per_level):
                req = LessonRequest(theme=theme, level=level, count=args.count)
                trace: dict = {}
                t0 = time.perf_counter()
                lesson = create_lesson(req, base, retries=settings.retries, trace=trace)
                ms = (time.perf_counter() - t0) * 1000

                if lesson.source == "fallback":
                    outcome = "fallback"
                elif trace.get("draft_attempts", 0) <= 1:
                    outcome = "first try"
                else:
                    outcome = "regenerated"

                for r in trace.get("drop_reasons", []):
                    drop_reasons[r] += 1
                for f in trace.get("validation_failures", []):
                    val_failures[_normalize_failure(f)] += 1
                for e in trace.get("api_errors", []):
                    api_errors[e] += 1

                # Sanity: anything we return must pass our own rules.
                assert validate_lesson(LLMLesson(words=lesson.words, story=lesson.story), req).ok
                rows.append((
                    theme,
                    level,
                    outcome,
                    trace.get("draft_attempts", 0),
                    trace.get("api_calls", 0),
                    trace.get("network_retries", 0),
                    round(ms),
                    ", ".join(w.word for w in lesson.words),
                ))
                print(rows[-1])
                time.sleep(args.sleep)

    total = len(rows)
    by = collections.Counter(r[2] for r in rows)
    lat = sorted(r[6] for r in rows)
    p95 = lat[max(0, int(0.95 * total) - 1)]
    out = [
        "# Lesson generator evaluation",
        "",
        f"Model: `{settings.gemini_model}`, temperature {settings.temperature}, {total} lessons of {args.count} words.",
        "",
        "| Outcome | Lessons | Share |",
        "| --- | --- | --- |",
        *[f"| {k} | {by[k]} | {by[k] / total:.0%} |" for k in ("first try", "regenerated", "fallback")],
        "",
        f"Latency: median {lat[total // 2]} ms, p95 {p95} ms (includes regeneration and transient retry backoff).",
        "",
        "## Word drop reasons (validator)",
        "",
        "| Reason | Count |",
        "| --- | --- |",
        *([f"| {r} | {c} |" for r, c in drop_reasons.most_common()] or ["| (none) | 0 |"]),
        "",
        "## Draft rejection reasons (triggered regeneration or fallback)",
        "",
        "| Reason | Count |",
        "| --- | --- |",
        *([f"| {r} | {c} |" for r, c in val_failures.most_common()] or ["| (none) | 0 |"]),
        "",
        "## Transient API / network errors (retried separately from regenerations)",
        "",
        "| Error | Count |",
        "| --- | --- |",
        *([f"| {e} | {c} |" for e, c in api_errors.most_common()] or ["| (none) | 0 |"]),
        "",
        "## Every lesson",
        "",
        "| Theme | Level | Outcome | Drafts | API calls | Net retries | ms | Words |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        *[
            f"| {t} | {lv} | {o} | {d} | {a} | {nr} | {ms} | {w} |"
            for t, lv, o, d, a, nr, ms, w in rows
        ],
    ]
    path = pathlib.Path(__file__).resolve().parent.parent / "docs" / "EVALUATION_LESSONS.md"
    path.parent.mkdir(exist_ok=True)
    path.write_text("\n".join(out) + "\n")
    print(f"\nWrote {path}")


if __name__ == "__main__":
    main()
