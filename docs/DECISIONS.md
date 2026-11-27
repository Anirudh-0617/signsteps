# Design Decisions and PS4 Reasoning

## 1. Key Engineering Decisions

| Decision | Why | Alternatives Considered |
| --- | --- | --- |
| **Fingerspelling practice as the problem (vs. a general accessibility chatbot)** | DHH children ages 7–12 building English vocabulary need visual, hands-on practice rooted in their own signing language with immediate letter-by-letter feedback. A chatbot assumes reading/writing fluency they are still learning and cannot see their signing. | General AI accessibility chatbot / text tutor (requires baseline literacy, adds hallucination risk, does not validate fingerspelling). |
| **Reuse SignSpeak recognizer unchanged in `fingerspell`-only mode** | Already validated (`98.3%` on Kaggle holdout in SignSpeak; golden test protects pipeline behavior). In `fingerspell` mode, `J` and `Z` still work because motion arbitration is disabled. | Retrain a new model from scratch (no time, no dataset gain); run `both` mode (suppresses `J`/`Z` and adds word-model confusion). |
| **Run recognition in the browser** | Webcam video never leaves the child's device, preserving privacy; zero per-frame network latency; practice works offline with the starter lesson. | Server-side vision API (privacy risk for minors, round-trip latency, bandwidth cost). |
| **Use the LLM only on the teacher side, behind mandatory review** | An LLM hallucination or awkward word reaches a teacher, never a child. Live feedback during practice is 100% deterministic. | LLM chat tutor giving live feedback to the child (unpredictable, high latency, cannot see video). |
| **Dropdown-only inputs (`theme`, `level`, `count`) to the generator** | Eliminates free-text prompt injection paths in the prototype and keeps requests tightly scoped. | Free-text topic prompt box (allows off-topic or adversarial prompts). |
| **Deterministic rule validator + 1 regeneration + static fallback** | Instant, free, unit-testable, and reproducible. Built-in fallback is proven valid for every `(theme, level, count)` by automated tests. | LLM-as-judge (extra cost/latency and still non-deterministic). |
| **Level rules derived from recognizer mechanics** | No `J`/`Z` at Levels 1–2 (motion letters are harder for a static-frame MLP) and no double letters at Level 1 (requires deliberate hand release for `300 ms`). | Unconstrained word selection (beginners immediately hit the hardest recognizer edge cases). |
| **Visual-only, untimed feedback with amber hints, Type-it, and Skip** | Deaf children do not depend on audio; no countdown anxiety; children with motor difficulties or recognition struggles never get stuck. | Countdown timers, numeric scores out of 100, sound effects, red failure crosses. |
| **Leitner-box spaced repetition (boxes 1–4)** | Clean spellings advance one box; any miss, typed letter, or skip resets to box 1 so harder words surface first. Easy to explain and inspect. | SM-2 algorithm (unnecessary complexity for a small prototype). |

---

## 2. Answers to the 8 PS4 Reasoning Questions

### 1. Why this challenge?
Deaf and hard-of-hearing children learning written English face a mismatch: nearly all mainstream spelling apps teach through sound and phonics. By building on my existing SignSpeak ASL fingerspelling recognizer, I could create a working visual-first prototype where fingerspelling—not hearing—drives practice, and where a teacher can prepare short themed lessons safely.

### 2. Why AI, and what does a non-AI approach cover?
- **What non-AI covers:** Fixed word lists (`fallback.py`), deterministic spelling state checks (`spell.ts`), Leitner-box scheduling (`progressStore.ts`), and static rule validation (`validator.py`) already cover safe lesson delivery, progress tracking, and exact letter-by-letter feedback without AI.
- **Where AI is genuinely needed:**
  1. *Computer vision / ML (`MediaPipe` + `MLP classifier`)* to turn live webcam hand landmarks into A–Z fingerspelling predictions in real time.
  2. *Generative AI (`Gemini`)* to draft varied, theme-appropriate word lists, example sentences, and cohesive 3-sentence stories using all target words so teachers are not stuck with one static list.

### 3. Why these technologies?
- **React + TypeScript + Vite + Tailwind + Zustand:** Reuses SignSpeak's existing frontend stack and accessible Gloss design system with zero porting overhead.
- **MediaPipe Tasks-Vision + hand-written TypeScript MLP:** Runs at ~30 fps on-device with a tiny model (`~770 KB`), avoiding heavy runtime downloads and keeping video local.
- **Python 3 + FastAPI + Pydantic v2 + `google-genai`:** Enforces structured JSON output via `response_schema`, clean validation errors (`422` on invalid input), and straightforward `pytest` testing with injected fake models.

### 4. What accessibility barriers exist in my own solution?
Being honest about current gaps:
1. **Requires a webcam and decent lighting:** Landmark detection degrades in dim or backlit rooms.
2. **Assumes steady one-handed fingerspelling:** Children with motor tremors or limb differences may struggle even with adjustable hold time (`0.4`–`1.5 s`, default `0.8 s`) and confidence (`40%`–`85%`) controls (mitigated partly by always-visible **Type a letter** and **Skip letter** buttons).
3. **ASL only, not ISL:** Children in India predominantly use two-handed ISL fingerspelling; SignSpeak's trained model is ASL-only.
4. **Story reading requires baseline literacy:** The 3-sentence reward story has no sign-video glosses yet.

### 5. How do you personalize without making disability-based assumptions?
SignSteps stores no medical diagnosis, hearing level, or disability label. All adaptation comes strictly from **observed performance and explicit settings**:
- Words missed, typed, or skipped reset to Leitner box `1` and appear first next round.
- The Progress view highlights the top 3 letters with the most wrong attempts so a teacher or parent knows what to practise.
- The teacher selects the word difficulty level (`1`–`3`), and the child can switch seamlessly between signing, typing, and skipping on any letter.

### 6. What happens when AI output is incorrect?
Four safety layers protect the child:
1. **Constrained input & structured schema:** Only dropdowns reach the prompt; Gemini must match `LLMLesson`.
2. **Deterministic validator (`validator.py`):** Drops malformed, out-of-level, duplicate, or blocklisted words and checks story length (`3` sentences `<= 10` words each) and word coverage.
3. **Regeneration with feedback + bounded fallback:** If validation fails, the backend passes the exact error message back to Gemini once; permanent API errors (`400`/`401`/`403`/`404`) fail fast without retries, a `35 s` backend budget ensures fallback completes well before the `60 s` browser request timeout, and rejected-draft warnings never leak onto accepted lessons. When fallback triggers, `TeacherPanel` states the exact cause (missing key, unavailable service, or failed checks).
4. **Teacher review gate:** Even valid AI drafts require teacher review (with live client-side validation when editing) before being assigned to Practice.

### 7. What are the privacy, safety, and reliability risks?
- **Privacy:** Sending children's webcam video to a cloud server would create serious biometric/child-privacy risk. Running MediaPipe + the MLP completely in the browser eliminates video egress. Progress is stored locally in `localStorage` with no real names required (production would add teacher auth, parental consent, encrypted storage, and deletion controls).
- **Safety:** A small static blocklist cannot catch every nuanced inappropriate word or sentence, so mandatory teacher review remains the primary safety gate.
- **Reliability:** Live lighting/angle differences and lookalike handshapes (`M`/`N`/`S`/`T`, `U`/`V`/`R`) reduce live accuracy compared to holdout benchmarks; **Type a letter** and **Skip letter** prevent the child from ever getting blocked.

### 8. How would you validate this with real users?
1. Partner with 1–2 teachers of the deaf and 3–5 signing children (with informed parental consent and educator supervision).
2. Observe real sessions across typical classroom lighting without intervening: measure word completion rate, reliance on Type/Skip, confusion points on the Practice/Story screens, and whether teachers find the draft-review workflow faster than manual prep.
3. Co-design improvements with Deaf educators (especially ISL support, sign-video references, and tuning default hold/confidence presets for young learners) before expanding features.
