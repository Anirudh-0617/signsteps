# Evaluation

This document separates **automated checks verified in this repository** from **live evaluations requiring a webcam and a Gemini API key**.

## 1. Verified Automated Checks (Observed)

| Check | Command | Result | Scope & Notes |
| --- | --- | --- | --- |
| **Backend unit & API suite** | `cd backend && .venv/bin/pytest -q` | **129 passed** (`0.42 s`) | Covers validator rules (`A`–`Z`, lengths `3`–`6` L1/L2 and `3`–`8` L3, double letters, `J`/`Z`, blocklist, story checks), retry backoff, permanent error fail-fast (`400`/`401`/`403`/`404`), time-budget cutoff, warning isolation across drafts, trace separation of network retries vs. regenerations, fallback validity across all 8 themes × 3 levels × 4 counts, FastAPI `/health` and `/lessons/generate`. Uses injected fake models (no live Gemini key). |
| **Recognizer golden test** | `npm run golden` (`node tools/golden.ts --check`) | **Passed** (`18 runs, 1,125 frames, no drift`) | Runs the real `Recognizer`, `Classifier`, `Smoother`, and `normalize` across `A`, `B`, `C`, `D`, `HELLO`, `DRINK` in `fingerspell`, `words`, and `both` modes against reference clips. |
| **SignSteps frontend unit tests** | `npm test` (`node --test tools/signsteps.test.ts`) | **13 passed** (3 suites) | Verifies `spell.ts` state transitions and `queueRetry`, `lessonApi.ts` word/sentence/story validation parity, `matchesTargetWord` plural/possessive highlighting, `generateLesson` `60 s` timeout > `35 s` backend budget, `progressStore.ts` Leitner ordering, session persistence across tab switches, per-word timing/accuracy tracking, and `hardestLetters`. |
| **TypeScript & production build** | `npm run build` (`tsc -b && vite build`) | **Passed** (`57 modules`, `217 ms`) | Clean type-check and production bundle. |
| **Linter** | `npm run lint` (`oxlint`) | **0 warnings, 0 errors** | Checked 33 files. |

---

## 2. Live Lesson Generator Evaluation (`eval_lessons.py`)

**Status:** Completed (`24` lessons across 8 themes × 3 levels, 5 words each). Full per-lesson log is in [EVALUATION_LESSONS.md](EVALUATION_LESSONS.md). `eval_lessons.py` reads `create_lesson` trace telemetry so transient network retries are counted separately from validation-driven regenerations, and every drop reason, draft rejection reason, and API error is recorded.

- **Command:** `cd backend && .venv/bin/python eval_lessons.py --per-level 1 --count 5`
- **Model & temperature:** `gemini-3.5-flash-lite`, temperature `0.3`
  *(Note: `gemini-flash-latest` and `gemini-2.5-flash` returned `404 NOT_FOUND` on this key, and `gemini-3.8-flash` timed out at 20 s; `gemini-3.5-flash-lite` was configured in `backend/.env` and `backend/app/config.py`.)*

| Outcome | Lessons | Share |
| --- | --- | --- |
| First try | 19 | 79% |
| Regenerated | 0 | 0% |
| Fallback | 5 | 21% |

- **Latency:** median `3186 ms`, p95 `6649 ms` (includes regeneration and transient retry backoff).
- **Word drop reasons (validator):**
  - `has a double letter, which is hard at level 1`: `8`
  - `contains J or Z, which need motion and are kept for level 3`: `2`
- **Draft rejection reasons:**
  - `Too few valid words left after filtering`: `10` (5 lessons × 2 drafts rejected: `Food` L2, `School` L1, `Colors` L1, `Nature` L1, `Home` L1 — each fell back safely to `fallback.py`).
- **Transient API / network errors (retried separately):**
  - `503 UNAVAILABLE`: `2` (`Family` L2 recovered on retry and still passed on its 1st draft).

Every returned lesson passed `validate_lesson`.

---

## 3. Live Recognizer Evaluation (Webcam)

**Status:** One informal run observed from a screen recording. The planned 45-attempt test below has not been run.

SignSpeak's `public/models/fingerspell_asl` model achieved **98.3% on the Kaggle holdout**, while live webcam accuracy is expected to be lower—especially on lookalike handshapes (`M`/`N`/`S`/`T` and `U`/`V`/`R`).

**Earlier testing in SignSpeak:** the author also tried this recognizer by hand while building SignSpeak. No attempt counts or timings were recorded, so no figures are reported, and it was not a test of SignSteps.

### Protocol (planned, not yet run)
- **Environment:** State room lighting (e.g., daylight / overhead lamp), camera distance, and signing hand (left/right). SignSteps records per-word elapsed time and clean-spelling rate in the **Progress** tab (`Avg time`, `Tries`, `Signed cleanly`) so you can read the numbers directly after running the test.
- **Test set:** 3 words per level × 5 attempts each (`45` word attempts total):
  - Level 1 (3–6 letters, no double letters, no `J`/`Z`): e.g., `CAT`, `DOG`, `FISH`
  - Level 2 (3–6 letters, no `J`/`Z`): e.g., `APPLE`, `BREAD`, `GREEN`
  - Level 3 (3–8 letters, includes `J`/`Z` or double letters): e.g., `JAZZ`, `ZEBRA`, `SCHOOL`

### Observed run (one signer: the author; one word; one attempt)

Settings shown on screen: hold time 0.8 s, confidence 60%, mirror camera on, indoor room. Times are approximate, read from the recording.

| Level | Word | Result |
| --- | --- | --- |
| 1 | `COW` | All three letters were eventually signed and accepted. `C` took about 44 s from the start of the recording and was repeatedly read as `D` or `X`, with the amber hint shown. `O` and `W` followed within about 10 s. |

This is not an accuracy measurement. It shows one real failure (`C` confused with `D` and `X`) and that the child can still finish the word.

---

## 4. Edge-Case Verification Checklist (for Demo & QA)

1. **No hand in frame:** Display shows `"Show your hand to the camera"`, confidence `0%`, no spurious letter commits (`recognizer.ts` short-circuits when `handsDetected === 0`).
2. **Two hands in frame / poor lighting:** Observe MediaPipe landmark overlay; if recognition stalls, `"Type a letter"` and `"Skip letter"` remain usable.
3. **Wrong or confused letter:** Shows soft amber hint `"That looked like X. Try Y."` without red crosses or timers; after 3 wrong tries, label shifts to `"Hard one? Type it instead"`.
4. **Unsupported/invalid teacher edit:** Editing a Level 1 word to `JAZZ` or `BOOK` highlights the input border in `--g-danger`, displays the rule reason inline, and disables **Approve and assign to practice**.
5. **Simulated Gemini timeout / backend down:**
   - Stop the backend and click **Generate draft** → clear error alert shown; Practice tab still works using `STARTER_LESSON`.
   - Set `GEMINI_TIMEOUT_S=0.001` or empty `GEMINI_API_KEY` in `backend/.env` → backend returns a valid reviewed fallback lesson with an explicit `warnings` banner.
6. **Invalid Gemini JSON / rule failure:** Tested automatically in `backend/tests/test_backend.py` (`test_bad_json_then_good_regenerates`, `test_always_invalid_falls_back`, `test_model_down_falls_back`).
