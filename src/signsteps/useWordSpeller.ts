import { useCallback, useEffect, useRef, useState } from 'react';
import { Recognizer } from '../recognition/recognizer';
import type { FeatureFrame } from '../input/InputSource';

// React binding for spelling words. Reuses SignSpeak's Recognizer unchanged, in
// fingerspell mode and NOT silent, so its smoother decides when a letter is
// committed (vote window + dwell + release). We only route those commits to
// `onLetter` instead of the transcript store that useLiveLetter writes to.
//
// Fingerspell-only mode also matters for J and Z: they are drawn with motion,
// and the recognizer only suppresses them when it runs letters and words
// together ('both' mode).

export type SpellerState = {
  handleFrame: (f: FeatureFrame) => void;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  handsPresent: boolean;
  top: string | null; // current best guess, not yet committed
  confidence: number;
  hold: number; // 0..1 progress toward committing `top`
};

export type SpellerOptions = {
  dwellMs?: number;
  minConfidence?: number;
};

export function useWordSpeller(
  onLetter: (letter: string, confidence: number) => void,
  opts: SpellerOptions = {},
): SpellerState {
  const dwellMs = opts.dwellMs ?? 800;
  const minConfidence = opts.minConfidence ?? 0.6;
  const recognizerRef = useRef<Recognizer | null>(null);
  const onLetterRef = useRef(onLetter);
  const handsRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [handsPresent, setHandsPresent] = useState(false);
  const [top, setTop] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [hold, setHold] = useState(0);

  useEffect(() => {
    onLetterRef.current = onLetter;
  }, [onLetter]);

  useEffect(() => {
    const recognizer = new Recognizer({ mode: 'fingerspell', silent: false, dwellMs, minConfidence });
    recognizerRef.current = recognizer;
    recognizer
      .load()
      .then(() => setStatus('ready'))
      .catch((e: unknown) => {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      recognizer.dispose();
      recognizerRef.current = null;
    };
    // Mount once; threshold updates go through configure() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    recognizerRef.current?.configure({ dwellMs, minConfidence });
  }, [dwellMs, minConfidence]);

  // Identity-stable so CameraView never restarts the camera.
  const handleFrame = useCallback((frame: FeatureFrame) => {
    const update = recognizerRef.current?.handleFrame(frame);
    if (!update) return;

    if (update.handsPresent !== handsRef.current) {
      handsRef.current = update.handsPresent;
      setHandsPresent(update.handsPresent);
    }
    if (!update.handsPresent) {
      setTop(null);
      setConfidence(0);
      setHold(0);
      return;
    }
    if (update.pending || !update.display) return;

    setTop(update.display.top);
    setConfidence(update.display.confidence);
    setHold(update.display.hold);

    for (const commit of update.commits) {
      if ('autoSpace' in commit) continue; // spaces mean nothing inside one word
      onLetterRef.current(commit.label, commit.confidence);
    }
  }, []);

  return { handleFrame, status, error, handsPresent, top, confidence, hold };
}
