import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from '../ui/CameraView';
import { Alert } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';
import { useWordSpeller } from './useWordSpeller';
import { applyLetter, countSignedLetters, isClean, OFFER_TYPE_AFTER, queueRetry, skipLetter, startWord } from './spell';
import type { LetterState } from './spell';
import { practiceOrder, useProgressStore } from './progressStore';
import type { PracticeSession } from './progressStore';
import { matchesTargetWord, STARTER_LESSON } from './lessonApi';
import type { Lesson } from './lessonApi';

// The child-facing practice page. Design rules:
// - nothing depends on sound; every state change is visual and announced via
//   an aria-live region for screen readers
// - no countdowns and no failure state; a wrong letter shows a soft amber hint
// - "Type it" and "Skip" are always reachable for children who cannot form a
//   letter physically or when recognition is struggling

const LETTER_STYLE: Record<LetterState, string> = {
  pending: 'border-rule-strong text-ink-3',
  signed: 'border-emerald-500 bg-emerald-500/15 text-ink',
  typed: 'border-sky-500 bg-sky-500/15 text-ink',
  skipped: 'border-rule text-ink-3 line-through',
};

function useActiveLesson(): Lesson {
  const lessons = useProgressStore((s) => s.lessons);
  const activeId = useProgressStore((s) => s.activeLessonId);
  return lessons.find((l) => l.id === activeId) ?? STARTER_LESSON;
}

function createSession(lesson: Lesson): PracticeSession {
  const order = practiceOrder(
    lesson.words.map((w) => w.word),
    useProgressStore.getState().words,
  );
  return {
    lessonId: lesson.id,
    order,
    pos: 0,
    spell: startWord(order[0] ?? ''),
    retried: [],
    finished: false,
  };
}

export function WordPractice() {
  const lesson = useActiveLesson();
  const storedSession = useProgressStore((s) => s.session);
  const setSession = useProgressStore((s) => s.setSession);
  const recordWord = useProgressStore((s) => s.recordWord);
  const holdMs = useProgressStore((s) => s.holdMs);
  const minConfidence = useProgressStore((s) => s.minConfidence);
  const mirrored = useProgressStore((s) => s.mirrored);
  const setHoldMs = useProgressStore((s) => s.setHoldMs);
  const setMinConfidence = useProgressStore((s) => s.setMinConfidence);
  const setMirrored = useProgressStore((s) => s.setMirrored);

  const [typed, setTyped] = useState('');
  const wordStartedAtRef = useRef<number | null>(null);

  const session = useMemo(
    () => (storedSession && storedSession.lessonId === lesson.id ? storedSession : createSession(lesson)),
    [storedSession, lesson],
  );

  // Persist freshly initialized session when lesson changes or on first load.
  useEffect(() => {
    if (!storedSession || storedSession.lessonId !== lesson.id) {
      setSession(session);
      wordStartedAtRef.current = null;
    }
  }, [storedSession, lesson.id, session, setSession]);

  const { order, pos, spell, retried, finished } = session;

  const current = useMemo(
    () => lesson.words.find((w) => w.word === order[pos]),
    [lesson, order, pos],
  );

  const onLetter = useCallback((letter: string) => {
    const state = useProgressStore.getState();
    const cur = state.session;
    if (!cur || cur.finished) return;
    if (wordStartedAtRef.current === null) wordStartedAtRef.current = Date.now();
    state.setSession({ ...cur, spell: applyLetter(cur.spell, letter, 'signed') });
  }, []);

  const speller = useWordSpeller(onLetter, { dwellMs: holdMs, minConfidence });

  // Exclude model load time from the first word's elapsed time.
  useEffect(() => {
    if (speller.status === 'ready' && wordStartedAtRef.current === null && !finished) {
      wordStartedAtRef.current = Date.now();
    }
  }, [speller.status, finished, pos, lesson.id]);

  const nextWord = () => {
    const elapsedMs = wordStartedAtRef.current === null ? 0 : Math.max(0, Date.now() - wordStartedAtRef.current);
    const clean = isClean(spell);
    recordWord(spell.word, clean, spell.misses, elapsedMs, countSignedLetters(spell));

    const { order: nextOrder, retried: nextRetried } = queueRetry(order, spell.word, clean, retried);
    if (pos + 1 >= nextOrder.length) {
      setSession({ ...session, order: nextOrder, retried: nextRetried, finished: true });
      wordStartedAtRef.current = null;
      return;
    }
    const nextPos = pos + 1;
    setSession({
      ...session,
      order: nextOrder,
      retried: nextRetried,
      pos: nextPos,
      spell: startWord(nextOrder[nextPos]),
      finished: false,
    });
    setTyped('');
    wordStartedAtRef.current = speller.status === 'ready' ? Date.now() : null;
  };

  const restart = () => {
    setSession(createSession(lesson));
    setTyped('');
    wordStartedAtRef.current = speller.status === 'ready' ? Date.now() : null;
  };

  const submitTyped = () => {
    if (!typed) return;
    if (wordStartedAtRef.current === null) wordStartedAtRef.current = Date.now();
    setSession({ ...session, spell: applyLetter(spell, typed, 'typed') });
    setTyped('');
  };

  const onSkipLetter = () => {
    if (wordStartedAtRef.current === null) wordStartedAtRef.current = Date.now();
    setSession({ ...session, spell: skipLetter(spell) });
  };

  if (finished) {
    const words = new Set(lesson.words.map((w) => w.word.toLowerCase()));
    return (
      <section aria-labelledby="story-title" className="mx-auto max-w-3xl grid gap-6 py-6">
        <h2 id="story-title" className="font-display text-3xl">
          You spelled every word. Now read the story.
        </h2>
        <div className="grid gap-3 text-2xl leading-relaxed">
          {lesson.story.map((sentence, i) => (
            <p key={i}>
              {sentence.split(' ').map((tok, j) => (
                <span key={j}>
                  {matchesTargetWord(tok, words) ? (
                    <mark className="bg-mark text-on-mark rounded px-1">{tok}</mark>
                  ) : (
                    tok
                  )}{' '}
                </span>
              ))}
            </p>
          ))}
        </div>
        <button type="button" onClick={restart} className="justify-self-start rounded-lg bg-inverse text-on-inverse px-5 py-3 text-lg">
          Practice again
        </button>
      </section>
    );
  }

  const isRetrySlot = pos >= lesson.words.length;
  const hint =
    spell.lastWrong && !spell.done
      ? `That looked like ${spell.lastWrong}. Try ${spell.word[spell.index]}.`
      : null;
  const announce = spell.done
    ? `Great, you spelled ${spell.word}.`
    : hint ?? `Next letter: ${spell.word[spell.index] ?? ''}`;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Word practice">
      <div className="grid gap-4 content-start">
        <p className="text-ink-2 text-sm">
          {lesson.theme} · Level {lesson.level} · Word {pos + 1} of {order.length}
          {isRetrySlot && (
            <span className="ml-2 rounded bg-mark/30 px-2 py-0.5 text-ink">Retry round</span>
          )}
        </p>

        <div className="flex items-center gap-5">
          <span className="text-7xl" aria-hidden="true">
            {current?.emoji ?? '⭐'}
          </span>
          <ol className="flex flex-wrap gap-2" aria-label={`Spell ${spell.word}`}>
            {spell.word.split('').map((ch, i) => (
              <li
                key={i}
                className={`grid h-16 w-14 place-items-center rounded-lg border-2 text-4xl font-semibold ${LETTER_STYLE[spell.letters[i]]} ${
                  i === spell.index && !spell.done ? 'ring-4 ring-mark' : ''
                }`}
              >
                {ch}
              </li>
            ))}
          </ol>
        </div>

        {/* Screen readers hear the same feedback the child sees. */}
        <p aria-live="polite" className="min-h-8 text-xl">
          {spell.done ? (
            <span className="font-semibold">{announce}</span>
          ) : hint ? (
            <span className="rounded bg-amber-400/20 px-2 py-1 text-ink">{hint}</span>
          ) : (
            <span className="text-ink-2">{announce}</span>
          )}
        </p>

        {spell.done && current && <p className="text-2xl">{current.sentence}</p>}

        <div className="flex flex-wrap items-end gap-3">
          {spell.done ? (
            <button type="button" onClick={nextWord} className="rounded-lg bg-inverse text-on-inverse px-5 py-3 text-lg">
              {pos + 1 >= order.length ? 'Read the story' : 'Next word'}
            </button>
          ) : (
            <>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTyped();
                }}
              >
                <label className="grid gap-1 text-sm text-ink-2">
                  {spell.wrongTries >= OFFER_TYPE_AFTER ? 'Hard one? Type it instead' : 'Type a letter'}
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value.replace(/[^a-zA-Z]/g, '').slice(-1).toUpperCase())}
                    maxLength={1}
                    className="h-12 w-16 rounded-lg border-2 border-rule-strong bg-plate text-center text-2xl text-ink"
                    aria-label="Type the current letter"
                  />
                </label>
                <button type="submit" className="h-12 rounded-lg border-2 border-rule-strong px-4">
                  Enter
                </button>
              </form>
              <button type="button" onClick={onSkipLetter} className="h-12 rounded-lg border-2 border-rule px-4 text-ink-2">
                Skip letter
              </button>
            </>
          )}
        </div>

        <p className="text-sm text-ink-3">
          Tip: for double letters like the OO in BOOK, move your hand a little between them.
        </p>
      </div>

      <div className="grid gap-3 content-start">
        {speller.status === 'loading' && <Spinner label="Loading the letter model" />}
        {speller.status === 'error' && (
          <Alert title="The letter model did not load" body={speller.error ?? undefined} />
        )}
        <CameraView onFrame={speller.handleFrame} mirrored={mirrored} />
        <div className="grid gap-1" aria-hidden="true">
          <div className="flex justify-between text-sm text-ink-2">
            <span>{speller.handsPresent ? `I see: ${speller.top ?? '...'}` : 'Show your hand to the camera'}</span>
            <span>{Math.round(speller.confidence * 100)}%</span>
          </div>
          <div className="h-3 rounded-full bg-plate border border-rule overflow-hidden">
            <div className="h-full bg-mark transition-[width] duration-100" style={{ width: `${Math.round(speller.hold * 100)}%` }} />
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border border-rule bg-plate p-3 text-sm sm:grid-cols-3">
          <label className="grid gap-1">
            <span className="flex justify-between text-ink-2">
              <span>Hold time</span>
              <span className="g-mono text-ink">{(holdMs / 1000).toFixed(1)} s</span>
            </span>
            <input
              type="range"
              min={400}
              max={1500}
              step={100}
              value={holdMs}
              onChange={(e) => setHoldMs(Number(e.target.value))}
              aria-label="Hold time per letter in seconds"
            />
          </label>
          <label className="grid gap-1">
            <span className="flex justify-between text-ink-2">
              <span>Confidence</span>
              <span className="g-mono text-ink">{Math.round(minConfidence * 100)}%</span>
            </span>
            <input
              type="range"
              min={40}
              max={85}
              step={5}
              value={Math.round(minConfidence * 100)}
              onChange={(e) => setMinConfidence(Number(e.target.value) / 100)}
              aria-label="Minimum recognition confidence percentage"
            />
          </label>
          <div className="flex items-center sm:justify-end">
            <button
              type="button"
              aria-pressed={mirrored}
              onClick={() => setMirrored(!mirrored)}
              className="h-10 rounded-lg border border-rule-strong px-3 text-ink hover:bg-page"
            >
              Mirror camera: {mirrored ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-3">Your camera video stays on this device. Nothing is recorded or uploaded.</p>
      </div>
    </section>
  );
}
