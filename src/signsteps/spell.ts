// Pure word-spelling state machine. No React, no DOM, so it is easy to test
// and easy to explain: the recognizer commits letters, this decides what each
// committed letter means for the word the child is spelling.

export type LetterState = 'pending' | 'signed' | 'typed' | 'skipped';
export type InputVia = 'signed' | 'typed';

export type SpellState = {
  word: string;
  index: number; // position of the letter the child is on now
  letters: LetterState[];
  wrongTries: number; // wrong letters on the CURRENT position
  lastWrong: string | null; // what the recognizer saw, for the gentle hint
  misses: Record<string, number>; // target letter -> wrong attempts, for progress
  done: boolean;
};

// After this many wrong letters on one position, the UI offers typing it.
export const OFFER_TYPE_AFTER = 3;

export function startWord(word: string): SpellState {
  const w = word.toUpperCase();
  return {
    word: w,
    index: 0,
    letters: w.split('').map(() => 'pending'),
    wrongTries: 0,
    lastWrong: null,
    misses: {},
    done: w.length === 0,
  };
}

function advance(s: SpellState, mark: LetterState): SpellState {
  const letters = s.letters.slice();
  letters[s.index] = mark;
  const index = s.index + 1;
  return {
    ...s,
    letters,
    index,
    wrongTries: 0,
    lastWrong: null,
    done: index >= s.word.length,
  };
}

export function applyLetter(s: SpellState, letter: string, via: InputVia): SpellState {
  if (s.done) return s;
  const target = s.word[s.index];
  const got = letter.toUpperCase();
  if (got === target) return advance(s, via);
  return {
    ...s,
    wrongTries: s.wrongTries + 1,
    lastWrong: got,
    misses: { ...s.misses, [target]: (s.misses[target] ?? 0) + 1 },
  };
}

export function skipLetter(s: SpellState): SpellState {
  if (s.done) return s;
  return advance(s, 'skipped');
}

/** Clean = every letter signed, no typing, no skips. Drives spaced repetition. */
export function isClean(s: SpellState): boolean {
  return s.done && s.letters.every((l) => l === 'signed');
}

export function countSignedLetters(s: SpellState): number {
  return s.letters.filter((l) => l === 'signed').length;
}

/** Re-queue a missed word once at the end of the current round. */
export function queueRetry(
  order: string[],
  word: string,
  clean: boolean,
  retried: string[],
): { order: string[]; retried: string[]; queued: boolean } {
  if (clean || retried.includes(word)) {
    return { order, retried, queued: false };
  }
  return {
    order: [...order, word],
    retried: [...retried, word],
    queued: true,
  };
}
