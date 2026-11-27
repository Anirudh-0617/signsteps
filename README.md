# SignSteps

**Sign-first English vocabulary practice for Deaf and hard-of-hearing (DHH) children.**

SignSteps reuses SignSpeak's in-browser ASL fingerspelling recognizer so a signing child (ages 7–12) can practise spelling English words letter by letter to a webcam—with zero sound dependency, no countdowns, and all video kept on the child's device—while teachers generate and review level-appropriate lessons and short stories.

> **Language scope:** This prototype recognizes **ASL fingerspelling** (`public/models/fingerspell_asl`). Children in India mostly use **Indian Sign Language (ISL)**, which uses two-handed fingerspelling. SignSteps does not claim ISL support; training an ISL model with Deaf educators is the primary next step.

## Demo video

[Watch on Google Drive](https://drive.google.com/file/d/1pAwk2xQ_i7S9wklyN3Fb9knkWVeF6zhe/view?usp=drivesdk) (2:53, with voice-over and captions)

**Reasoning challenge:** [docs/reasoning-challenge.pdf](docs/reasoning-challenge.pdf)

---

## Key Features

- **Sign-a-Word Practice (`/`):** Large letter boxes, emoji picture cue, live webcam landmark overlay, smooth hold bar, adjustable hold time (`0.4`–`1.5 s`, default `0.8 s`), adjustable confidence (`40%`–`85%`), mirror-camera toggle, soft amber hints on mismatches, **Type a letter**, **Skip letter**, in-round retry for missed words, and preserved tab progress, followed by a 3-sentence story with practised words (including plurals/possessives) highlighted.
- **Teacher Lesson Generator & Review:** Dropdown-only inputs (8 themes, levels `1`–`3`, `5`–`8` words) call FastAPI + Gemini (`google-genai`), validated deterministically before the teacher edits words, sentences, or the story and approves. Built-in fallback lists work even when AI is unconfigured or unavailable (with accurate fallback banners and bounded backend time budget).
- **Adaptive Practice & Progress View:** Child profile with nickname (no real names) and emoji avatar, Leitner-box (`1`–`4`) spaced repetition in `localStorage`, plus a parent/teacher view showing attempts, clean spellings, per-word and letter accuracy, average time per word (excluding model load), mastery box, and the 3 hardest letters.

## Setup and Run

### Prerequisites
- Node.js 22+ (tested on Node `v25.6.1`)
- Python 3.11+ (tested on Python `3.13` in `backend/.venv`)
- A Gemini API key for live AI lesson generation (optional—fallback word lists work without a key)

### 1. Frontend (Terminal 1)

```bash
npm ci
npm run dev   # http://localhost:5173
```

### 2. Backend (Terminal 2)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add GEMINI_API_KEY=...
uvicorn app.main:app --reload --port 8000
```

- Swagger API docs: `http://localhost:8000/docs`
- Vite proxies `/api/*` to `http://localhost:8000` in dev (`vite.config.ts`).

---

## Tests & Checks

```bash
# Backend unit + API tests (129 passed, no API key needed)
cd backend && .venv/bin/pytest -q

# Frontend SignSteps logic & validation tests (13 passed)
npm test

# Recognizer golden characterization test (18 runs, 1,125 frames, no drift)
npm run golden

# Type-check, build, and lint
npm run build
npm run lint
```

## Evaluation & Documentation

- [docs/PROBLEM.md](docs/PROBLEM.md) — Problem statement, users, barriers, user journey, and accessibility rules
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — User-flow and technical architecture Mermaid diagrams, recognition pipeline, and privacy boundary
- [docs/DECISIONS.md](docs/DECISIONS.md) — Engineering decisions with alternatives and answers to the 8 PS4 reasoning questions
- [docs/EVALUATION.md](docs/EVALUATION.md) — Verified automated test results, live `eval_lessons.py` results (`gemini-3.5-flash-lite`, 24 lessons: 79% first try, 0% regenerated, 21% fallback), and webcam evaluation template
- [docs/EVALUATION_LESSONS.md](docs/EVALUATION_LESSONS.md) — Full 24-lesson output table from `backend/eval_lessons.py`

---

## Known Limitations

- Live recognition accuracy varies with lighting, camera angle, and handshape similarity (`M`/`N`/`S`/`T` and `U`/`V`/`R` are commonly confused) and is lower than SignSpeak's `98.3%` Kaggle holdout score.
- ASL fingerspelling only; two-handed ISL is not yet supported (though the 178-dim feature vector already reserves 126 dimensions for both hands).
- Progress is stored in `localStorage` on a single device with no teacher accounts or cloud sync.
- The safety blocklist is a small static list; teacher review is the primary safety gate.
- Evaluation so far is automated/synthetic; testing with Deaf educators and signing children has not yet been conducted.

## AI Tool Disclosure

> SignSteps reuses my own SignSpeak recognizer (built before this assessment). The SignSteps-specific frontend files, the FastAPI backend, and its tests were drafted with Claude (Anthropic) from my specification, then reviewed, fixed, run, and tested by me. Google Antigravity was used for project assembly, validation parity fixes, frontend unit tests, verification, and documentation.
