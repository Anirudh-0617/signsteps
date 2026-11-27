// Client for the FastAPI lesson backend (backend/). Vite proxies /api/lessons
// and /api/health to http://localhost:8000 in dev, see vite.config.ts.
//
// Only the theme, level and word count ever leave the browser. No video, no
// child data.

export type LessonWord = { word: string; emoji: string; sentence: string };

export type Lesson = {
  id: string;
  theme: string;
  level: number;
  words: LessonWord[];
  story: string[];
  source: 'ai' | 'fallback';
  warnings: string[];
};

export const THEMES = ['Animals', 'Food', 'Family', 'School', 'Colors', 'Nature', 'Home', 'Body'] as const;
export type Theme = (typeof THEMES)[number];

// Must exceed the backend's 35 s generation budget so the browser never cuts off a fallback response.
export const DEFAULT_GENERATE_TIMEOUT_MS = 60_000;

export async function generateLesson(
  theme: Theme,
  level: number,
  count: number,
  timeoutMs = DEFAULT_GENERATE_TIMEOUT_MS,
): Promise<Lesson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('/api/lessons/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, level, count }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Lesson request timed out after ${Math.round(timeoutMs / 1000)} s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = `Server error ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // keep the status text
    }
    throw new Error(detail);
  }
  return (await res.json()) as Lesson;
}

const MIN_LEN = 3;
const MAX_SENTENCE_WORDS = 10;

// Mirrors backend/app/validator.py BLOCKLIST so teacher edits catch blocked words immediately.
const BLOCKLIST = new Set([
  'kill', 'killed', 'dead', 'die', 'death', 'blood', 'gun', 'guns', 'knife', 'war',
  'hate', 'stupid', 'dumb', 'ugly', 'idiot', 'fat', 'sex', 'sexy', 'drug', 'drugs',
  'beer', 'wine', 'drunk', 'smoke', 'cigarette', 'bomb', 'fight', 'hurt', 'scary',
]);

function tokens(text: string): string[] {
  return (text.match(/[a-zA-Z']+/g) ?? []).map((t) => t.replace(/^'+|'+$/g, '').toLowerCase()).filter(Boolean);
}

/** Same rules the backend validator applies, used when a teacher edits a word. */
export function wordProblem(word: string, level: number): string | null {
  const max = level === 1 ? 6 : level === 2 ? 6 : 8;
  if (!/^[A-Z]+$/.test(word)) return 'Use letters A to Z only.';
  if (word.length < MIN_LEN || word.length > max) {
    return `Must be ${MIN_LEN} to ${max} letters at level ${level}.`;
  }
  if (level < 3 && /[JZ]/.test(word)) {
    return 'No J or Z before level 3 (motion letters).';
  }
  if (level === 1 && /(.)\1/.test(word)) {
    return 'No double letters at level 1.';
  }
  if (BLOCKLIST.has(word.toLowerCase())) {
    return 'Word is on the safety blocklist.';
  }
  return null;
}

export function sentenceProblem(sentence: string, word: string): string | null {
  const toks = tokens(sentence);
  if (toks.length === 0) return 'Sentence is empty.';
  if (toks.length > MAX_SENTENCE_WORDS) return `Sentence must be ${MAX_SENTENCE_WORDS} words or fewer.`;
  if (word && !toks.includes(word.toLowerCase())) return `Sentence does not use ${word}.`;
  if (toks.some((t) => BLOCKLIST.has(t))) return 'Sentence contains a blocked word.';
  return null;
}

export function storyProblems(story: string[], words: string[]): string[] {
  const errors: string[] = [];
  const active = story.map((s) => s.trim()).filter(Boolean);
  if (active.length !== 3) errors.push('Story must have 3 non-empty sentences.');
  const storyTokens = new Set<string>();
  for (let i = 0; i < story.length; i++) {
    const toks = tokens(story[i]);
    if (toks.length === 0) continue;
    if (toks.length > MAX_SENTENCE_WORDS) {
      errors.push(`Story sentence ${i + 1} must be ${MAX_SENTENCE_WORDS} words or fewer.`);
    }
    if (toks.some((t) => BLOCKLIST.has(t))) {
      errors.push(`Story sentence ${i + 1} contains a blocked word.`);
    }
    for (const t of toks) storyTokens.add(t);
  }
  const missing = words.filter((w) => w && !storyTokens.has(w.toLowerCase()));
  if (missing.length > 0) {
    errors.push(`Story must use every word; missing: ${missing.join(', ')}.`);
  }
  return errors;
}

export function isValidWord(word: string, level: number): boolean {
  return wordProblem(word, level) === null;
}

/** Match story tokens against target words, including common plurals and possessives. */
export function matchesTargetWord(tok: string, targets: Set<string>): boolean {
  const cleaned = tok.replace(/^[^a-zA-Z]+|[^a-zA-Z']+$/g, '').toLowerCase();
  if (!cleaned) return false;
  // Strip trailing possessive: "cat's", "cat’s", "dogs'"
  const stem = cleaned.replace(/(?:'s|')$/, '');
  if (targets.has(stem)) return true;
  if (stem.endsWith('s') && targets.has(stem.slice(0, -1))) return true;
  if (stem.endsWith('es') && targets.has(stem.slice(0, -2))) return true;
  if (stem.endsWith('ies') && targets.has(stem.slice(0, -3) + 'y')) return true;
  return false;
}

// Used when no lesson has been saved yet, so the practice page always works
// even with the backend off.
export const STARTER_LESSON: Lesson = {
  id: 'starter',
  theme: 'Animals',
  level: 1,
  words: [
    { word: 'CAT', emoji: '🐱', sentence: 'The cat is small.' },
    { word: 'DOG', emoji: '🐶', sentence: 'The dog can run.' },
    { word: 'COW', emoji: '🐮', sentence: 'A cow eats grass.' },
    { word: 'PIG', emoji: '🐷', sentence: 'The pig is pink.' },
    { word: 'FOX', emoji: '🦊', sentence: 'A fox is red.' },
  ],
  story: ['A cat and a dog play.', 'The cow and the pig watch.', 'The red fox says hello.'],
  source: 'fallback',
  warnings: [],
};
