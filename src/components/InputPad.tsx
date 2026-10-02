import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Category } from "../db/types";
import { suggestCategoryName } from "../utils/calc";
import { formatAmount } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";

interface Props {
  categories: Category[];
  currency: string;
  collapsed: boolean;
  onSetCollapsed: (c: boolean) => void;
  onSubmit: (input: { amount: number; note: string; categoryId: string }) => void;
}

const DEFAULT_CATEGORY = "other";
const KEY_HEIGHT = "clamp(44px, 6.4dvh, 56px)";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];
const LONG_PRESS_MS = 450;

/**
 * Input dock for a 360x780 screen. The dock never scrolls.
 *
 * - Collapsed (default): compact bar — amount | note | round +.
 * - Expanded: the same bar, category chips, then a plain 4-row × 3-column
 *   keypad (1–9, 00, 0, ⌫) with the round + as a tall right-hand column.
 * - Note focused (system keyboard open): the number keys hide so the note
 *   input, chips and the bar's + stay above the keyboard.
 * - The amount is a plain number: digits only, no leading zeros, max 9
 *   digits, no decimals. Long-press ⌫ clears the whole amount.
 */
export default function InputPad({ categories, currency, collapsed, onSetCollapsed, onSubmit }: Props) {
  const [display, setDisplay] = useState(""); // plain digits only
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [error, setError] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const manualCategory = useRef(false); // user picked a chip → stop auto-suggesting
  const backTimer = useRef<number | null>(null);
  const haptic = useHaptics();

  const expanded = !collapsed && !noteFocused;
  const amount = Number(display || "0");
  const amountText = formatAmount(amount, currency);
  const errorState = error;

  // Keep the selection on a real category (cloud ids are UUIDs; the legacy
  // "other" literal resolves by name). Render-phase adjust — React re-renders
  // immediately with the resolved id.
  if (!categories.some((c) => c.id === categoryId)) {
    const resolved =
      categories.find((c) => c.name.toLowerCase() === DEFAULT_CATEGORY)?.id ?? categories[0]?.id;
    if (resolved && categoryId !== resolved) setCategoryId(resolved);
  }

  const press = (key: string) => {
    haptic(10);
    setError(false);
    if (key === "back") {
      setDisplay((d) => d.slice(0, -1));
      return;
    }
    setDisplay((d) => {
      // Plain number: no leading zeros, max 9 significant digits.
      const significant = d.replace(/^0+/, "");
      if (significant.length >= 9) return d;
      if (key === "00") return d === "" || d === "0" ? d : d + "00";
      if (d === "0") return key === "0" ? d : key; // replace a lone leading 0
      return d + key;
    });
  };

  /** Long-press ⌫ clears the whole amount (single taps backspace). */
  const backDown = () => {
    haptic(10);
    setError(false);
    backTimer.current = window.setTimeout(() => {
      backTimer.current = null;
      setDisplay("");
      haptic([10, 20, 10]);
    }, LONG_PRESS_MS);
  };
  const backUp = () => {
    if (backTimer.current !== null) {
      window.clearTimeout(backTimer.current);
      backTimer.current = null;
      setDisplay((d) => d.slice(0, -1)); // short tap → backspace one digit
    }
  };

  const onNoteChange = (value: string) => {
    setNote(value);
    // Auto-suggest the category from the note until the user picks one.
    if (!manualCategory.current) {
      const name = suggestCategoryName(value);
      if (name) {
        const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (match) setCategoryId(match.id);
      }
    }
  };

  const submit = () => {
    if (!amount || amount <= 0) {
      setError(true);
      haptic([10, 30, 10]);
      setTimeout(() => setError(false), 600);
      return;
    }
    haptic(10);
    onSubmit({ amount, note: note.trim(), categoryId });
    setDisplay("");
    setNote("");
    setCategoryId(DEFAULT_CATEGORY);
    manualCategory.current = false;
    // Re-expand after adding: blur the note (closes the system keyboard) and
    // clear the typing state, then bring the keypad back.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setNoteFocused(false);
    onSetCollapsed(false);
  };

  const noteFocusProps = {
    onFocus: () => {
      setNoteFocused(true);
      onSetCollapsed(true);
    },
    onBlur: () => {
      setNoteFocused(false);
      onSetCollapsed(false);
    },
  };

  return (
    <section
      aria-label="Add expense"
      style={{ maxHeight: "calc(var(--vh, 1vh) * 52)" }}
      className="z-10 flex flex-none flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Amount | note | + — always visible */}
      <div className={`flex h-14 shrink-0 items-center gap-2 ${errorState ? "animate-pop" : ""}`}>
        <button
          type="button"
          onClick={() => onSetCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Amount ${amountText}. Tap to open keypad` : `Amount ${amountText}. Tap to close keypad`}
          className={`flex h-12 min-w-[104px] shrink-0 flex-col items-center justify-center rounded-xl px-2 tabular-nums transition-colors ${
            errorState ? "bg-red-500 text-white" : "bg-slate-100 dark:bg-slate-800"
          }`}
        >
          <span className="text-lg font-extrabold leading-5">{amountText}</span>
          <span className="text-[9px] leading-3 text-slate-400">{collapsed ? "tap to type" : "tap to close"}</span>
        </button>
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          {...noteFocusProps}
          placeholder="Note (optional)"
          aria-label="Note"
          maxLength={60}
          className="h-12 min-w-0 flex-1 rounded-xl bg-slate-100 px-3 text-base outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
        />
        {/* The round + is the only action button (always reachable, even with
            the system keyboard open — the keypad column is hidden then). */}
        {collapsed || noteFocused ? (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              submit();
            }}
            aria-label="Add expense"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-colors ${
              errorState ? "animate-pop bg-red-500 shadow-red-500/40" : "bg-teal-600 shadow-teal-600/40 active:bg-teal-700"
            }`}
          >
            <Plus size={26} strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Category chips — visible expanded and while typing */}
      {expanded || noteFocused ? (
        <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto pb-2" role="radiogroup" aria-label="Category">
          {categories.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={categoryId === c.id}
              onClick={() => {
                setCategoryId(c.id);
                manualCategory.current = true;
                haptic(8);
              }}
              className={`flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-all ${
                categoryId === c.id
                  ? "border-transparent text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
              style={categoryId === c.id ? { backgroundColor: c.color } : undefined}
            >
              <span aria-hidden>{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Keypad — 1..9 / 00 0 ⌫ with the + as a tall right column. No scrolling. */}
      {expanded ? (
        <div
          className="grid shrink-0 grid-cols-4 gap-2 pt-1"
          style={{ gridTemplateRows: "repeat(4, minmax(44px, 1fr))" }}
          role="group"
          aria-label="Keypad"
        >
          {KEYS.map((k) =>
            k === "back" ? (
              <button
                key={k}
                onPointerDown={backDown}
                onPointerUp={backUp}
                onPointerLeave={backUp}
                onPointerCancel={backUp}
                onContextMenu={(e) => e.preventDefault()} // long-press shouldn't open the menu
                aria-label="Backspace. Long press clears the amount"
                style={{ height: KEY_HEIGHT }}
                className="rounded-xl bg-slate-100 text-[22px] font-semibold text-slate-700 transition-transform active:scale-[0.96] dark:bg-slate-800 dark:text-slate-100"
              >
                ⌫
              </button>
            ) : (
              <button
                key={k}
                onClick={() => press(k)}
                aria-label={`Key ${k}`}
                style={{ height: KEY_HEIGHT }}
                className="rounded-xl bg-slate-100 text-[22px] font-semibold text-slate-700 transition-transform active:scale-[0.96] dark:bg-slate-800 dark:text-slate-100"
              >
                {k}
              </button>
            ),
          )}
          {/* Tall + column — the only action key */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              submit();
            }}
            aria-label="Add expense"
            className="col-start-4 row-start-1 row-span-4 flex items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/40 transition-transform active:scale-[0.98]"
          >
            <Plus size={32} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
