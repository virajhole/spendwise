import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import type { Category } from "../db/types";
import { formatAmount } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";

interface Props {
  categories: Category[];
  currency: string;
  collapsed: boolean;
  onSetCollapsed: (c: boolean) => void;
  onSubmit: (input: {
    amount: number;
    note: string;
    categoryId: string;
  }) => void;
}

/**
 * Input dock, designed for a 360x780 viewport.
 *
 * Collapsed (default): one 64px bar — amount display | note input | round +.
 * Tapping the amount area expands the keypad (≤45% of the viewport height).
 * Expanded: amount row, note row, category chips, then a 4x4 key grid with the
 * + button as a tall right-hand column. Keys are 44px with 6px gaps.
 *
 * The amount display is readOnly with inputMode="none" — the system keyboard
 * never opens for it. Focusing the note input collapses the keypad so the
 * system keyboard has room; blurring or adding an expense re-expands it.
 */
export default function InputPad({
  categories,
  currency,
  collapsed,
  onSetCollapsed,
  onSubmit,
}: Props) {
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  // Neutral default category — stable regardless of when the category list loads.
  const DEFAULT_CATEGORY = "other";
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [error, setError] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const haptic = useHaptics();
  const amountText = display
    ? formatAmount(Number(display), currency)
    : `${currency}0`;

  // Once categories are available, move the selection onto the real
  // "Other" category (cloud ids are UUIDs, not the legacy "other" literal).
  // Render-phase adjustment: React re-renders immediately with the resolved id.
  if (!categories.some((c) => c.id === categoryId)) {
    const resolved =
      categories.find((c) => c.name.toLowerCase() === DEFAULT_CATEGORY)?.id ??
      categories[0]?.id;
    if (resolved && categoryId !== resolved) setCategoryId(resolved);
  }

  const press = (key: string) => {
    haptic(8);
    setError(false);
    if (key === "back") {
      setDisplay((d) => d.slice(0, -1));
      return;
    }
    setDisplay((d) => {
      if (d.replace(/^0+/, "").length >= 9) return d;
      if (key === "00") return d === "" ? d : d + "00";
      if (d === "0") return key;
      return d + key;
    });
  };

  const submit = () => {
    const amount = Number(display);
    if (!amount || amount <= 0) {
      setError(true);
      haptic([10, 30, 10]);
      setTimeout(() => setError(false), 600);
      return;
    }
    setError(false);
    haptic(10);
    onSubmit({ amount, note: note.trim(), categoryId });
    // Reset the whole pad — amount, note, and category chip — for the next entry.
    setDisplay("");
    setNote("");
    setCategoryId(DEFAULT_CATEGORY);
    onSetCollapsed(false); // keypad ready for the next entry
  };

  const noteFocusProps = {
    onFocus: () => {
      setNoteFocused(true);
      onSetCollapsed(true); // give the system keyboard the keypad's space
    },
    onBlur: () => {
      setNoteFocused(false);
      onSetCollapsed(false); // re-expand the keypad after blur
    },
  };

  const showChips = !collapsed || noteFocused;
  const showKeys = !collapsed && !noteFocused;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];

  return (
    <section
      aria-label="Add expense"
      // The WHOLE dock is capped at 45% of the real viewport height — the bar
      // stays put and the chips/keypad area scrolls if space runs out.
      style={{ maxHeight: "calc(var(--vh, 1vh) * 45)" }}
      className="flex max-h-[45vh] flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Compact bar — always visible: amount | note | + */}
      <div
        className={`flex h-16 shrink-0 items-center gap-2 ${error ? "animate-pop" : ""}`}
      >
        <button
          type="button"
          onClick={() => onSetCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? `Amount ${amountText}. Tap to open keypad`
              : `Amount ${amountText}. Tap to close keypad`
          }
          className={`flex h-12 min-w-[96px] shrink-0 flex-col items-center justify-center rounded-xl px-2 tabular-nums transition-colors ${
            error ? "bg-red-500 text-white" : "bg-slate-100 dark:bg-slate-800"
          }`}
        >
          <span className="text-lg font-extrabold leading-5">{amountText}</span>
          <span className="text-[9px] leading-3 text-slate-400">
            {collapsed ? "tap to type" : "tap to close"}
          </span>
        </button>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          {...noteFocusProps}
          placeholder="Note (optional)"
          aria-label="Note"
          maxLength={60}
          className="h-12 min-w-0 flex-1 rounded-xl bg-slate-100 px-3 text-base outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
        />
        {collapsed || noteFocused ? (
          <button
            type="button"
            // Submit on pointerdown + preventDefault: the tap can't move focus
            // away from the note (no blur) and can't be eaten by a re-render.
            onPointerDown={(e) => {
              e.preventDefault();
              submit();
            }}
            aria-label="Add expense"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-colors ${
              error
                ? "animate-pop bg-red-500 shadow-red-500/40"
                : "bg-teal-600 shadow-teal-600/40 active:bg-teal-700"
            }`}
          >
            <Plus size={26} strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Expanded: chips + keypad (hidden while the system keyboard is open) */}
      {showChips || showKeys ? (
        <div className="min-h-0 flex-1 overflow-y-auto pt-2">
          {showChips ? (
            <div
              className="no-scrollbar flex gap-1.5 overflow-x-auto pb-2"
              role="radiogroup"
              aria-label="Category"
            >
              {categories.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    haptic(8);
                  }}
                  className={`flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-all ${
                    categoryId === c.id
                      ? "border-transparent text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                  style={
                    categoryId === c.id
                      ? { backgroundColor: c.color }
                      : undefined
                  }
                >
                  <span aria-hidden>{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          {showKeys ? (
            <div
              className="grid grid-cols-4 grid-rows-4 gap-1.5 pt-1"
              role="group"
              aria-label="Keypad"
            >
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  aria-label={k === "back" ? "Backspace" : `Key ${k}`}
                  className="h-11 rounded-xl bg-slate-100 text-xl font-semibold text-slate-700 transition-transform active:scale-95 dark:bg-slate-800 dark:text-slate-100"
                >
                  {k === "back" ? "⌫" : k}
                </button>
              ))}
              {/* Tall + column — pinned to the grid's 4th column, spanning all rows */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  submit();
                }}
                aria-label="Add expense"
                className="col-start-4 row-start-1 row-span-4 flex items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/40 transition-colors active:bg-teal-700"
              >
                <Plus size={30} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!collapsed && !noteFocused ? (
        <button
          onClick={() => onSetCollapsed(true)}
          aria-label="Collapse keypad"
          className="mx-auto flex w-full shrink-0 items-center justify-center gap-1 py-1 text-[11px] font-medium text-slate-400"
        >
          <ChevronDown size={14} aria-hidden /> Close keypad
        </button>
      ) : null}
    </section>
  );
}
