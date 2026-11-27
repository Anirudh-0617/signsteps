import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lesson } from './lessonApi';
import type { SpellState } from './spell';

// Progress and saved lessons, persisted in localStorage (prototype only; a real
// deployment would use teacher accounts and encrypted server storage).
//
// Spaced repetition is a Leitner box per word: a clean spelling (every letter
// signed, nothing typed or skipped) moves the word up one box, anything else
// sends it back to box 1. Practice order = lowest box first, then the word
// seen longest ago. Simple enough to explain in one sentence in an interview.

export const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦋', '🚀', '⭐'] as const;

export type WordStat = {
  attempts: number;
  clean: number;
  box: number; // 1..4
  lastSeen: number;
  totalMs?: number;
  lastMs?: number;
  signedLetters?: number;
  wordMisses?: number;
};

export type PracticeSession = {
  lessonId: string;
  order: string[];
  pos: number;
  spell: SpellState;
  retried: string[];
  finished: boolean;
};

type ProgressState = {
  nickname: string;
  avatar: string;
  holdMs: number;
  minConfidence: number;
  mirrored: boolean;
  words: Record<string, WordStat>;
  letterMisses: Record<string, number>;
  lessons: Lesson[];
  activeLessonId: string | null;
  session: PracticeSession | null;
  setNickname: (n: string) => void;
  setAvatar: (a: string) => void;
  setHoldMs: (ms: number) => void;
  setMinConfidence: (c: number) => void;
  setMirrored: (m: boolean) => void;
  saveLesson: (lesson: Lesson) => void;
  setActiveLesson: (id: string | null) => void;
  setSession: (session: PracticeSession | null) => void;
  recordWord: (
    word: string,
    clean: boolean,
    misses: Record<string, number>,
    durationMs?: number,
    signedLetters?: number,
  ) => void;
  resetProgress: () => void;
};

export const MAX_BOX = 4;

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      nickname: '',
      avatar: AVATARS[0],
      holdMs: 800,
      minConfidence: 0.6,
      mirrored: true,
      words: {},
      letterMisses: {},
      lessons: [],
      activeLessonId: null,
      session: null,
      setNickname: (nickname) => set({ nickname }),
      setAvatar: (avatar) => set({ avatar }),
      setHoldMs: (holdMs) => set({ holdMs }),
      setMinConfidence: (minConfidence) => set({ minConfidence }),
      setMirrored: (mirrored) => set({ mirrored }),
      saveLesson: (lesson) =>
        set({
          lessons: [lesson, ...get().lessons.filter((l) => l.id !== lesson.id)].slice(0, 20),
          activeLessonId: lesson.id,
          session: null,
        }),
      setActiveLesson: (activeLessonId) => set({ activeLessonId, session: null }),
      setSession: (session) => set({ session }),
      recordWord: (word, clean, misses, durationMs = 0, signedLetters = 0) => {
        const prev = get().words[word] ?? {
          attempts: 0,
          clean: 0,
          box: 1,
          lastSeen: 0,
          totalMs: 0,
          lastMs: 0,
          signedLetters: 0,
          wordMisses: 0,
        };
        const letterMisses = { ...get().letterMisses };
        let wordMissCount = 0;
        for (const [letter, n] of Object.entries(misses)) {
          letterMisses[letter] = (letterMisses[letter] ?? 0) + n;
          wordMissCount += n;
        }
        const safeMs = Math.max(0, Math.round(durationMs));
        set({
          letterMisses,
          words: {
            ...get().words,
            [word]: {
              attempts: prev.attempts + 1,
              clean: prev.clean + (clean ? 1 : 0),
              box: clean ? Math.min(MAX_BOX, prev.box + 1) : 1,
              lastSeen: Date.now(),
              totalMs: (prev.totalMs ?? 0) + safeMs,
              lastMs: safeMs,
              signedLetters: (prev.signedLetters ?? 0) + signedLetters,
              wordMisses: (prev.wordMisses ?? 0) + wordMissCount,
            },
          },
        });
      },
      resetProgress: () => set({ words: {}, letterMisses: {}, session: null }),
    }),
    { name: 'signsteps:progress:v1' },
  ),
);

/** Words needing practice come first. Pure, so it is easy to unit test. */
export function practiceOrder(words: string[], stats: Record<string, WordStat>): string[] {
  return words.slice().sort((a, b) => {
    const sa = stats[a];
    const sb = stats[b];
    const boxA = sa?.box ?? 0; // never practised = most urgent
    const boxB = sb?.box ?? 0;
    if (boxA !== boxB) return boxA - boxB;
    return (sa?.lastSeen ?? 0) - (sb?.lastSeen ?? 0);
  });
}

/** The letters with the most wrong attempts, for the teacher/parent view. */
export function hardestLetters(misses: Record<string, number>, n = 3): [string, number][] {
  return Object.entries(misses)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
