import { useState } from 'react';
import { Alert } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';
import { generateLesson, sentenceProblem, storyProblems, THEMES, wordProblem } from './lessonApi';
import type { Lesson, Theme } from './lessonApi';
import { useProgressStore } from './progressStore';

// Teacher-side lesson creation. The AI only drafts; the teacher reviews every
// word and the story before saving. Nothing reaches the child unreviewed.
// Inputs are dropdowns (theme, level, count), so there is no free-text prompt
// for anyone to inject instructions into.

export function TeacherPanel({ onAssigned }: { onAssigned: () => void }) {
  const saveLesson = useProgressStore((s) => s.saveLesson);
  const [theme, setTheme] = useState<Theme>('Animals');
  const [level, setLevel] = useState(1);
  const [count, setCount] = useState(5);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      setDraft(await generateLesson(theme, level, count));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const editWord = (i: number, value: string) => {
    if (!draft) return;
    const words = draft.words.slice();
    words[i] = { ...words[i], word: value.toUpperCase().replace(/[^A-Z]/g, '') };
    setDraft({ ...draft, words });
  };
  const editSentence = (i: number, value: string) => {
    if (!draft) return;
    const words = draft.words.slice();
    words[i] = { ...words[i], sentence: value };
    setDraft({ ...draft, words });
  };
  const editStory = (i: number, value: string) => {
    if (!draft) return;
    const story = draft.story.slice();
    story[i] = value;
    setDraft({ ...draft, story });
  };
  const removeWord = (i: number) => {
    if (!draft) return;
    setDraft({ ...draft, words: draft.words.filter((_, j) => j !== i) });
  };

  const wordCounts = new Map<string, number>();
  if (draft) {
    for (const w of draft.words) {
      wordCounts.set(w.word, (wordCounts.get(w.word) ?? 0) + 1);
    }
  }
  const problemFor = (word: string, level: number): string | null =>
    wordProblem(word, level) ?? ((wordCounts.get(word) ?? 0) > 1 ? 'Duplicate word.' : null);

  const storyErrors = draft ? storyProblems(draft.story, draft.words.map((w) => w.word)) : [];

  const allValid =
    draft !== null &&
    draft.words.length > 0 &&
    draft.words.every((w) => problemFor(w.word, draft.level) === null && sentenceProblem(w.sentence, w.word) === null) &&
    storyErrors.length === 0;

  return (
    <section className="mx-auto grid max-w-3xl gap-6" aria-labelledby="teacher-title">
      <h2 id="teacher-title" className="font-display text-2xl">Create a lesson</h2>

      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm">
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} className="h-11 rounded-lg border border-rule-strong bg-plate px-3 text-ink">
            {THEMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Level
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="h-11 rounded-lg border border-rule-strong bg-plate px-3 text-ink">
            <option value={1}>1 (short words)</option>
            <option value={2}>2</option>
            <option value={3}>3 (longer words)</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Words
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-11 rounded-lg border border-rule-strong bg-plate px-3 text-ink">
            {[5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={generate} disabled={loading} className="h-11 rounded-lg bg-inverse text-on-inverse px-5 disabled:opacity-50">
          {loading ? 'Generating...' : 'Generate draft'}
        </button>
      </div>

      {loading && <Spinner label="Asking the lesson generator" />}
      {error && (
        <Alert
          title="Could not create a lesson"
          body={error.includes('timed out') ? error : `${error}. Check that the backend is running on port 8000.`}
        />
      )}

      {draft && (
        <div className="grid gap-4">
          {draft.source === 'fallback' && (
            <Alert
              variant="warn"
              title="Using a built-in word list"
              body={
                draft.warnings.some((w) => w.includes('not set up') || w.includes('GEMINI_API_KEY'))
                  ? 'AI is not configured on the backend (missing GEMINI_API_KEY), so a reviewed built-in list was used instead.'
                  : draft.warnings.some((w) => w.includes('unavailable'))
                    ? 'The AI service was unavailable or timed out, so a reviewed built-in list was used instead.'
                    : 'The AI draft did not pass the quality and safety checks twice, so a reviewed built-in list was used instead.'
              }
            />
          )}
          {draft.warnings.length > 0 && (
            <ul className="text-sm text-ink-2 list-disc pl-5">
              {draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <h3 className="font-semibold">Review the words and sentences</h3>
          <ul className="grid gap-3">
            {draft.words.map((w, i) => {
              const wordErr = problemFor(w.word, draft.level);
              const sentErr = sentenceProblem(w.sentence, w.word);
              return (
                <li key={i} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-3xl" aria-hidden="true">{w.emoji}</span>
                    <input
                      value={w.word}
                      onChange={(e) => editWord(i, e.target.value)}
                      aria-label={`Word ${i + 1}`}
                      aria-invalid={wordErr !== null}
                      aria-describedby={wordErr ? `word-error-${i}` : undefined}
                      className={`h-10 w-36 rounded-lg border-2 bg-plate px-2 text-lg text-ink ${wordErr === null ? 'border-rule-strong' : 'border-danger'}`}
                    />
                    <input
                      value={w.sentence}
                      onChange={(e) => editSentence(i, e.target.value)}
                      aria-label={`Sentence for word ${i + 1}`}
                      aria-invalid={sentErr !== null}
                      aria-describedby={sentErr ? `sentence-error-${i}` : undefined}
                      className={`h-10 flex-1 min-w-56 rounded-lg border-2 bg-plate px-2 text-sm text-ink ${sentErr === null ? 'border-rule-strong' : 'border-danger'}`}
                    />
                    <button type="button" onClick={() => removeWord(i)} className="text-sm underline text-ink-2">
                      Remove
                    </button>
                  </div>
                  {(wordErr || sentErr) && (
                    <div className="pl-12 text-xs text-danger">
                      {wordErr && <span id={`word-error-${i}`} className="mr-3">{wordErr}</span>}
                      {sentErr && <span id={`sentence-error-${i}`}>{sentErr}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <h3 className="font-semibold">Story (3 short sentences using all words)</h3>
          <div className="grid gap-2">
            {draft.story.map((s, i) => (
              <input
                key={i}
                value={s}
                onChange={(e) => editStory(i, e.target.value)}
                aria-label={`Story sentence ${i + 1}`}
                aria-invalid={storyErrors.length > 0}
                className={`h-10 w-full rounded-lg border-2 bg-plate px-3 text-base text-ink ${storyErrors.length === 0 ? 'border-rule-strong' : 'border-danger'}`}
              />
            ))}
            {storyErrors.length > 0 && (
              <ul className="text-xs text-danger list-disc pl-5">
                {storyErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            disabled={!allValid}
            onClick={() => {
              saveLesson(draft);
              onAssigned();
            }}
            className="justify-self-start h-11 rounded-lg bg-inverse text-on-inverse px-5 disabled:opacity-50"
          >
            Approve and assign to practice
          </button>
        </div>
      )}
    </section>
  );
}
