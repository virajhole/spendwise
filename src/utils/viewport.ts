/**
 * Keeps the CSS variable `--vh` at 1% of the REAL viewport height.
 *
 * `dvh` units alone don't react to the on-screen keyboard on every browser,
 * so we mirror `window.visualViewport.height` into `--vh` and size the input
 * dock with `calc(var(--vh, 1vh) * 45)` etc. — the layout then resizes when
 * the keyboard opens/closes. (index.html also sets
 * interactive-widget=resizes-content, which makes Chrome resize the layout
 * viewport itself.)
 */
export function initViewportHeight(): void {
  const set = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--vh", `${h / 100}px`);
  };
  set();
  window.visualViewport?.addEventListener("resize", set);
  window.addEventListener("orientationchange", set);
}
