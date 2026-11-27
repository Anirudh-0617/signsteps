# Problem and Users

## 1. The Challenge

Deaf and hard-of-hearing (DHH) children who use sign language often learn written English vocabulary as a second language. Most early reading and spelling applications assume the learner can hear: they rely on audio prompts, phonics, letter-sound decoding, and spoken or sound-effect feedback.

A signing child gets little value from audio-first tools. Meanwhile, teachers of the deaf and special educators have few tools that let a child practise English words using their own visual language (fingerspelling) and receive instant, calm visual feedback independently without an adult sitting beside them.

**Honest scope note (ASL vs. ISL):** SignSteps reuses the **SignSpeak** ASL fingerspelling recognizer (`public/models/fingerspell_asl`). Children in India mostly use **Indian Sign Language (ISL)**, which uses two-handed fingerspelling. This prototype targets **ASL fingerspelling** and does not claim to recognize ISL; training an ISL model with Deaf educators is the most important next step.

## 2. Target Users

| User | Role in SignSteps | Core Need |
| --- | --- | --- |
| **Child (ages 7–12)** | Primary learner who knows basic fingerspelling and is building English vocabulary | Practise spelling words independently at their own pace with clear visual feedback |
| **Teacher of the deaf / Special educator** | Selects theme, level, and word count; reviews AI-drafted lessons before assigning | Generate level-appropriate word lists and short stories quickly without risking unsafe or impossible words |
| **Parent / Caregiver** | Reviews progress at home | See which words were practised, how many were signed cleanly, and which letters need extra support |

## 3. Accessibility Barriers Addressed

Existing literacy apps create five common barriers for DHH children:

1. **Audio-dependent instructions and feedback:** Sounds, chimes, or spoken hints exclude signing children.
2. **Phonics-first pedagogy:** Mapping letters to spoken phonemes does not match how signing children acquire written vocabulary.
3. **Timed tasks and failure states:** Countdowns, red crosses, buzzers, and numeric scores create stress and discourage practice.
4. **Busy screens and small text:** Cluttered layouts and small letters make reading harder for young learners.
5. **Adult-dependent practice:** Without automated visual feedback, a child cannot verify a fingerspelled letter unless an adult watches every attempt.

## 4. Features and Purpose

| Feature | Purpose | In Prototype? |
| --- | --- | --- |
| **Sign-a-Word practice** | Child sees a picture (emoji) and word in large text, fingerspells letter-by-letter to the webcam, and gets immediate visual feedback | **Yes (core feature)** |
| **AI lesson generator + teacher review** | Teacher selects theme, level (1–3), and word count (5–8); Gemini drafts a word list and 3-sentence story; deterministic rules validate it before teacher approval | **Yes** |
| **Type-instead and Skip** | Child can type a letter (prompted automatically after 3 wrong tries, always visible) or skip a letter if signing is physically difficult or recognition struggles | **Yes** |
| **Adaptive practice (Leitner box)** | Words with misses or typed/skipped letters return to box 1 and appear earlier in future rounds | **Yes (basic)** |
| **Progress view** | Teacher or parent sees word attempts, clean spellings, mastery box (`1 of 4` to `4 of 4`), and the 3 hardest letters | **Yes (simple)** |
| **Sign video library** | Short clips showing whole-word signs (not only fingerspelling) | No (future work) |
| **ISL support** | Two-handed Indian Sign Language fingerspelling recognizer | No (future work) |

## 5. User Journey

1. **Create lesson (Teacher):** The teacher opens the **Teacher** tab, picks a theme (one of 8 fixed themes), a level (`1` to `3`), and a word count (`5` to `8`), then clicks **Generate draft**.
2. **Validate and review (Teacher):** The FastAPI backend requests structured JSON from Gemini, runs deterministic rule checks (`backend/app/validator.py`), retries once with error feedback if needed, and falls back to a reviewed built-in list (`backend/app/fallback.py`) if AI is down or fails twice. The teacher can edit or remove any word, edit each word's example sentence, and edit the 3-sentence story—with live client-side validation ensuring sentences and story still match every word—before clicking **Approve and assign to practice**. **Nothing reaches the child unreviewed.**
3. **Practice words (Child):** The **Practice** tab loads the assigned lesson (or a built-in starter Animals lesson when offline). The child sees one emoji, the target word in large letter boxes, the sentence after completing the word, and the webcam feed with a live hold bar plus adjustable hold time (`0.8 s` default), confidence threshold, and mirror-camera toggle.
4. **Letter-by-letter visual feedback (Child):**
   - Each matching signed letter highlights the box green (`signed`).
   - A wrong letter shows a soft amber hint (`"That looked like S. Try T."`)—never a red cross, buzzer, or countdown.
   - After 3 wrong tries on a letter, the input prompt gently offers `"Hard one? Type it instead"`; both **Type a letter** and **Skip letter** are always visible.
   - Any word that was missed, typed, or skipped comes back once at the end of the same round for another try, and switching tabs preserves the child's current place.
5. **Read the story (Child):** After finishing all words in the lesson, the child reads the 3-sentence story with every practised word (including plurals and possessives) highlighted.
6. **Review progress (Teacher / Parent):** The **Progress** tab lets the family set a nickname (no real names) and emoji avatar, and shows the top 3 letters with the most misses plus a per-word table of tries, clean spellings, word and letter accuracy, average time per word, and Leitner mastery box (`1` to `4`).

## 6. How Accessibility and Privacy Are Built In

- **Visual-first, zero sound dependency:** No audio cues are used; every feedback state is visual and paired with an `aria-live="polite"` region for assistive tech.
- **Calm, untimed pacing:** No countdown timers or numeric failure scores. The hold bar reflects the child's adjustable dwell time (`0.4 s`–`1.5 s`, default `0.8 s`) so the child sees steady progress.
- **Adjustable camera & recognition controls:** Mirror-camera toggle supports left-handed or unmirrored preference; hold time and minimum confidence (`40%`–`85%`) adapt to the child's signing speed and lighting.
- **High contrast and large typography:** Reuses SignSpeak's Gloss design tokens (`--g-text` / `--g-bg`, WCAG-checked in light and dark modes) and large letter tiles (`text-4xl`).
- **Level rules shaped around motor and recognizer limits:** Level 1 excludes double letters (which require a deliberate hand release) and motion letters `J` and `Z`; Level 2 excludes `J` and `Z`; Level 3 allows all letters `A`–`Z`.
- **No disability labels:** Personalization relies solely on observed accuracy and teacher settings—no diagnosis is asked for or stored.
- **On-device video privacy:** All MediaPipe landmark extraction and MLP inference run in the browser. Only `(theme, level, count)` dropdown values are ever sent to the backend.
