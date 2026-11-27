import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLetter, countSignedLetters, isClean, OFFER_TYPE_AFTER, queueRetry, skipLetter, startWord } from '../src/signsteps/spell.ts';
import { DEFAULT_GENERATE_TIMEOUT_MS, generateLesson, isValidWord, matchesTargetWord, sentenceProblem, STARTER_LESSON, storyProblems, wordProblem } from '../src/signsteps/lessonApi.ts';
import { hardestLetters, practiceOrder, useProgressStore, type WordStat } from '../src/signsteps/progressStore.ts';

describe('spell state machine', () => {
  it('advances on matching signed letters and marks clean', () => {
    let s = startWord('cat');
    assert.equal(s.word, 'CAT');
    s = applyLetter(s, 'C', 'signed');
    s = applyLetter(s, 'A', 'signed');
    s = applyLetter(s, 'T', 'signed');
    assert.equal(s.done, true);
    assert.equal(isClean(s), true);
  });

  it('tracks wrong tries, misses, and non-clean completion when typed or skipped', () => {
    let s = startWord('DOG');
    for (let i = 0; i < OFFER_TYPE_AFTER; i++) {
      s = applyLetter(s, 'S', 'signed');
    }
    assert.equal(s.wrongTries, OFFER_TYPE_AFTER);
    assert.equal(s.lastWrong, 'S');
    assert.equal(s.misses.D, OFFER_TYPE_AFTER);

    s = applyLetter(s, 'D', 'typed');
    assert.equal(s.wrongTries, 0);
    assert.equal(s.lastWrong, null);

    s = skipLetter(s);
    s = applyLetter(s, 'G', 'signed');
    assert.equal(s.done, true);
    assert.deepEqual(s.letters, ['typed', 'skipped', 'signed']);
    assert.equal(isClean(s), false);
    assert.equal(countSignedLetters(s), 1);
  });

  it('re-queues a missed word once in the same round', () => {
    const r1 = queueRetry(['CAT', 'DOG'], 'CAT', false, []);
    assert.equal(r1.queued, true);
    assert.deepEqual(r1.order, ['CAT', 'DOG', 'CAT']);
    assert.deepEqual(r1.retried, ['CAT']);

    const r2 = queueRetry(r1.order, 'CAT', false, r1.retried);
    assert.equal(r2.queued, false);
    assert.deepEqual(r2.order, ['CAT', 'DOG', 'CAT']);

    const r3 = queueRetry(['CAT', 'DOG'], 'DOG', true, []);
    assert.equal(r3.queued, false);
  });
});

describe('frontend word validation rules (parity with backend validator)', () => {
  it('rejects J/Z below level 3 and double letters at level 1', () => {
    assert.equal(isValidWord('JAZZ', 1), false);
    assert.match(wordProblem('JAZZ', 1) ?? '', /J or Z/);
    assert.equal(isValidWord('ZEBRA', 2), false);
    assert.equal(isValidWord('ZEBRA', 3), true);

    assert.equal(isValidWord('BOOK', 1), false);
    assert.match(wordProblem('BOOK', 1) ?? '', /double letters/);
    assert.equal(isValidWord('BOOK', 2), true);
  });

  it('enforces min length 3, level max length (6 at L1/L2, 8 at L3), A-Z, and blocklist', () => {
    assert.equal(isValidWord('HI', 1), false);
    assert.equal(isValidWord('CAT', 1), true);
    assert.equal(isValidWord('ANIMAL', 1), true);
    assert.equal(isValidWord('GIRAFFE', 1), false);
    assert.equal(isValidWord('ELEPHANT', 3), true);
    assert.equal(isValidWord('GUN', 1), false);
  });

  it('catches stale sentences and stories when teacher changes CAT to HEN', () => {
    assert.match(sentenceProblem('The cat is small.', 'HEN') ?? '', /HEN/);
    assert.equal(sentenceProblem('The hen is small.', 'HEN'), null);
    const errs = storyProblems(
      ['A cat and a dog play.', 'The cow and the pig watch.', 'The red fox says hello.'],
      ['HEN', 'DOG', 'COW', 'PIG', 'FOX'],
    );
    assert.equal(errs.length, 1);
    assert.match(errs[0], /missing: HEN/);
  });

  it('validates starter lesson words at level 1', () => {
    for (const w of STARTER_LESSON.words) {
      assert.equal(wordProblem(w.word, STARTER_LESSON.level), null);
    }
  });

  it('matches target words including plurals and possessives in story highlights', () => {
    const targets = new Set(['cat', 'dog', 'fox', 'baby']);
    assert.equal(matchesTargetWord('cats.', targets), true);
    assert.equal(matchesTargetWord("cat's", targets), true);
    assert.equal(matchesTargetWord("dogs'", targets), true);
    assert.equal(matchesTargetWord('foxes,', targets), true);
    assert.equal(matchesTargetWord('babies!', targets), true);
    assert.equal(matchesTargetWord('hello', targets), false);
  });

  it('keeps browser timeout well above backend 35s budget', () => {
    assert.ok(DEFAULT_GENERATE_TIMEOUT_MS >= 60_000);
  });

  it('aborts generateLesson when the request exceeds timeoutMs', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as typeof fetch;
    try {
      await assert.rejects(() => generateLesson('Animals', 1, 5, 20), /timed out/i);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('spaced repetition, timing, and hardest letters', () => {
  it('orders unseen and lowest-box words first', () => {
    const stats: Record<string, WordStat> = {
      CAT: { attempts: 3, clean: 3, box: 3, lastSeen: 100 },
      DOG: { attempts: 2, clean: 1, box: 1, lastSeen: 200 },
      COW: { attempts: 2, clean: 1, box: 1, lastSeen: 50 },
    };
    assert.deepEqual(practiceOrder(['CAT', 'DOG', 'COW', 'FOX'], stats), ['FOX', 'COW', 'DOG', 'CAT']);
  });

  it('records elapsed time, signed letters, and misses per word, and preserves session across tabs', () => {
    useProgressStore.getState().resetProgress();
    useProgressStore.getState().recordWord('CAT', true, {}, 3200, 3);
    useProgressStore.getState().recordWord('CAT', false, { T: 1 }, 4800, 2);
    const cat = useProgressStore.getState().words.CAT;
    assert.equal(cat.attempts, 2);
    assert.equal(cat.clean, 1);
    assert.equal(cat.totalMs, 8000);
    assert.equal(cat.lastMs, 4800);
    assert.equal(cat.signedLetters, 5);
    assert.equal(cat.wordMisses, 1);

    useProgressStore.getState().setSession({
      lessonId: 'starter',
      order: ['CAT', 'DOG'],
      pos: 1,
      spell: startWord('DOG'),
      retried: ['CAT'],
      finished: false,
    });
    assert.equal(useProgressStore.getState().session?.pos, 1);
    useProgressStore.getState().saveLesson(STARTER_LESSON);
    assert.equal(useProgressStore.getState().session, null);
  });

  it('returns top 3 missed letters', () => {
    assert.deepEqual(hardestLetters({ M: 4, N: 1, S: 6, T: 3, A: 0 }), [
      ['S', 6],
      ['M', 4],
      ['T', 3],
    ]);
  });
});
