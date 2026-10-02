import { useEffect, useState } from "react";

/** Tracks matchMedia; used for reduced-motion and dark preference. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  // Re-sync during render when the query itself changes (sanctioned pattern).
  const current = typeof window !== "undefined" ? window.matchMedia(query).matches : false;
  if (current !== matches) setMatches(current);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");
