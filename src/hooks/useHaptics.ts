import { useCallback } from "react";

/**
 * Haptic feedback where supported.
 * All patterns are clamped to short, subtle ticks — never long buzzes.
 */
export function useHaptics() {
  return useCallback((pattern: number | number[] = 10) => {
    try {
      const arr = (Array.isArray(pattern) ? pattern : [pattern])
        .map((ms, i) => (i % 2 === 0 ? Math.min(ms, 20) : Math.min(ms, 40))) // vibrate ≤20ms, pause ≤40ms
        .slice(0, 3); // at most a quick double-tick, never a long buzz
      navigator.vibrate?.(arr);
    } catch {
      /* not supported */
    }
  }, []);
}
