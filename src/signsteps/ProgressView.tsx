import { AVATARS, hardestLetters, MAX_BOX, useProgressStore } from './progressStore';

// Teacher / parent view. Shows what the child practised and where they
// struggle, without labels, scores out of 100 or comparisons to other children.

export function ProgressView() {
  const nickname = useProgressStore((s) => s.nickname);
  const avatar = useProgressStore((s) => s.avatar);
  const setNickname = useProgressStore((s) => s.setNickname);
  const setAvatar = useProgressStore((s) => s.setAvatar);
  const words = useProgressStore((s) => s.words);
  const letterMisses = useProgressStore((s) => s.letterMisses);
  const resetProgress = useProgressStore((s) => s.resetProgress);

  const rows = Object.entries(words).sort((a, b) => a[1].box - b[1].box);
  const hard = hardestLetters(letterMisses);

  const totalAttempts = rows.reduce((sum, [, s]) => sum + s.attempts, 0);
  const totalClean = rows.reduce((sum, [, s]) => sum + s.clean, 0);
  const totalMs = rows.reduce((sum, [, s]) => sum + (s.totalMs ?? 0), 0);
  const totalSigned = rows.reduce((sum, [, s]) => sum + (s.signedLetters ?? 0), 0);
  const totalWordMisses = rows.reduce((sum, [, s]) => sum + (s.wordMisses ?? 0), 0);
  const totalLetterTries = totalSigned + totalWordMisses;
  const wordAcc = totalAttempts > 0 ? Math.round((totalClean / totalAttempts) * 100) : 0;
  const letterAcc = totalLetterTries > 0 ? Math.round((totalSigned / totalLetterTries) * 100) : null;
  const avgSec = totalAttempts > 0 ? (totalMs / totalAttempts / 1000).toFixed(1) : '0.0';

  return (
    <section className="mx-auto grid max-w-3xl gap-6" aria-labelledby="progress-title">
      <h2 id="progress-title" className="font-display text-2xl">Progress</h2>

      <div className="grid gap-3 rounded-lg border border-rule bg-plate p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-sm">
            Child nickname (no real names)
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 24))}
              placeholder="e.g. Sunny"
              className="h-10 w-48 rounded-lg border border-rule-strong bg-page px-3 text-ink"
            />
          </label>
          <div className="grid gap-1 text-sm">
            <span>Avatar</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose avatar">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={avatar === a}
                  onClick={() => setAvatar(a)}
                  className={`grid h-10 w-10 place-items-center rounded-lg border text-xl ${
                    avatar === a ? 'border-mark bg-mark/20' : 'border-rule bg-page'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-2">No practice yet. Progress appears here after the first word.</p>
      ) : (
        <>
          <p className="text-sm text-ink-2">
            Total tries: <strong className="text-ink">{totalAttempts}</strong> · Word accuracy:{' '}
            <strong className="text-ink">{wordAcc}%</strong> ({totalClean}/{totalAttempts})
            {letterAcc !== null && (
              <>
                {' '}· Letter accuracy: <strong className="text-ink">{letterAcc}%</strong>
              </>
            )}{' '}
            · Avg time per word: <strong className="text-ink">{avgSec} s</strong>
          </p>

          {hard.length > 0 && (
            <p>
              Letters to practise more:{' '}
              {hard.map(([l, n]) => (
                <span key={l} className="mr-3 rounded bg-mark text-on-mark px-2 py-0.5 font-semibold">
                  {l} <span className="font-normal">({n})</span>
                </span>
              ))}
            </p>
          )}

          <table className="w-full text-left">
            <caption className="sr-only">Practice per word</caption>
            <thead className="text-sm text-ink-2 border-b border-rule">
              <tr>
                <th className="py-2">Word</th>
                <th>Tries</th>
                <th>Signed cleanly</th>
                <th>Accuracy</th>
                <th>Avg time</th>
                <th>Mastery</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([word, s]) => {
                const wAcc = s.attempts > 0 ? Math.round((s.clean / s.attempts) * 100) : 0;
                const lTries = (s.signedLetters ?? 0) + (s.wordMisses ?? 0);
                const lAcc = lTries > 0 ? Math.round(((s.signedLetters ?? 0) / lTries) * 100) : null;
                return (
                  <tr key={word} className="border-b border-rule">
                    <td className="py-2 font-semibold">{word}</td>
                    <td>{s.attempts}</td>
                    <td>{s.clean}</td>
                    <td>
                      {wAcc}%{lAcc !== null ? <span className="text-xs text-ink-3"> ({lAcc}% letters)</span> : null}
                    </td>
                    <td>{s.attempts > 0 ? `${((s.totalMs ?? 0) / s.attempts / 1000).toFixed(1)} s` : '—'}</td>
                    <td>
                      {s.box} of {MAX_BOX}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button type="button" onClick={resetProgress} className="justify-self-start text-sm underline text-ink-2">
            Reset progress
          </button>
        </>
      )}
    </section>
  );
}
