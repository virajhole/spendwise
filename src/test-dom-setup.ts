/**
 * Vitest setup for DOM component tests (jsdom via per-file docblock).
 * jsdom lacks matchMedia + ResizeObserver + requestIdleCallback, which the
 * components rely on. Loaded in every environment, guarded for node.
 */
import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!("ResizeObserver" in window)) {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = RO as unknown as typeof ResizeObserver;
  }

  if (!("requestIdleCallback" in window)) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback = (
      cb: () => void,
    ) => window.setTimeout(cb, 0) as unknown as number;
    (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback = (id: number) =>
      window.clearTimeout(id);
  }
}
