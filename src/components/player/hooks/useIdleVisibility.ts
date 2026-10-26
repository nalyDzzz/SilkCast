import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the pointer has been active recently, so overlay controls
 * can fade out during playback and reappear on movement.
 */
export function useIdleVisibility(idleMs = 3000) {
  const [active, setActive] = useState(true);
  const timerRef = useRef<number | null>(null);

  const poke = useCallback(() => {
    setActive(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setActive(false);
    }, idleMs);
  }, [idleMs]);

  const hide = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActive(false);
  }, []);

  useEffect(() => {
    poke();
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [poke]);

  return { active, poke, hide };
}
