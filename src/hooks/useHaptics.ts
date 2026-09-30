import { useCallback } from "react";

/** Haptic feedback where supported. */
export function useHaptics() {
  return useCallback((pattern: number | number[] = 10) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  }, []);
}
