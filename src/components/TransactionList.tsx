import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ReceiptText } from "lucide-react";
import type { Category, Transaction } from "../db/types";
import { groupByDate, sortByNewest } from "../utils/calc";
import { formatAmount, formatTime } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";
import { useStore } from "../store/store";
import { SkeletonRows } from "./Skeletons";

const SWIPE_WIDTH = 80; // px — travel limit and the delete button width
const OPEN_AT = -40;    // release past this → snap open to -80
const TAP_SLOP = 8;     // px — movement below this counts as a tap
const TAP_MS = 250;     // ms — a tap must be shorter than this

interface Props {
  transactions: Transaction[] | undefined;
  categories: Category[];
  currency: string;
  onDelete: (t: Transaction) => void;
  onRestore: (t: Transaction) => void;
}

export default function TransactionList({ transactions, categories, currency, onDelete, onRestore }: Props) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const { month, search, filterCategory, dateFrom, dateTo, setEditing } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tx: Transaction; timer: number } | null>(null);
  const haptic = useHaptics();

  const filtered = (transactions ?? []).filter((t) => {
    if (filterCategory && t.categoryId !== filterCategory) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    if (search && !t.note.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const sorted = sortByNewest(filtered);
  const groups = groupByDate(sorted);

  // Reset swipe state whenever the view changes (month, filters, search).
  useEffect(() => {
    setOpenId(null);
  }, [month, search, filterCategory, dateFrom, dateTo]);

  // Scrolling anywhere closes the open row.
  useEffect(() => {
    if (!openId) return;
    const onScroll = () => setOpenId(null);
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [openId]);

  // Tapping anywhere outside a row closes the open one.
  useEffect(() => {
    if (!openId) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-swipe-row]")) return; // rows close themselves on tap
      setOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openId]);

  const handleDelete = (t: Transaction) => {
    haptic(12);
    setOpenId(null); // reset swipe state — the row re-mounts closed after undo
    onDelete(t);
    if (toast) window.clearTimeout(toast.timer);
    const timer = window.setTimeout(() => setToast(null), 5000);
    setToast({ tx: t, timer });
  };

  const handleRestore = (t: Transaction) => {
    setOpenId(null);
    onRestore(t);
    window.clearTimeout(toast?.timer);
    setToast(null);
  };

  return (
    <div className="relative min-h-[120px] overflow-x-hidden px-4 pb-4" aria-label="Transactions">
      {transactions === undefined ? (
        <SkeletonRows rows={3} />
      ) : groups.length === 0 && transactions.length === 0 ? (
        <EmptyState filtered={Boolean(search || filterCategory || dateFrom || dateTo)} />
      ) : (
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.section
              key={g.date}
              aria-label={g.label}
              className="mt-3 overflow-hidden"
              exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.22, ease: "easeInOut" } }}
            >
              <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {g.label}
              </h3>
              <ul className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
                <AnimatePresence initial={false}>
                  {g.items.map((t) => (
                    <SwipeableRow
                      key={t.id} // stable key = expense id
                      t={t}
                      cat={catMap.get(t.categoryId)}
                      currency={currency}
                      isOpen={openId === t.id}
                      anyOpen={openId !== null}
                      onOpenChange={setOpenId}
                      onDelete={handleDelete}
                      onEdit={() => setEditing(t)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </motion.section>
          ))}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+80px)] z-30 mx-auto flex max-w-[420px] items-center justify-between gap-3 rounded-2xl bg-slate-800 px-4 py-3 text-white shadow-xl dark:bg-slate-700"
            role="status"
          >
            <span className="text-sm">
              Deleted “{toast.tx.note || "expense"}” · {formatAmount(toast.tx.amount, currency)}
            </span>
            <button
              onClick={() => handleRestore(toast.tx)}
              className="text-sm font-bold text-teal-300"
            >
              UNDO
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface SwipeProps {
  t: Transaction;
  cat: Category | undefined;
  currency: string;
  isOpen: boolean;
  anyOpen: boolean;
  onOpenChange: (id: string | null) => void;
  onDelete: (t: Transaction) => void;
  onEdit: () => void;
}

/**
 * Swipeable row: a full-width foreground that slides over a fixed 80px delete
 * button. Pointer events with axis locking (horizontal only), clamped to
 * [-80, 0], and it always settles at exactly 0 or -80 — never in between.
 * Taps (movement < 8px, duration < 250ms) open the edit sheet; if any row is
 * open, a tap closes it instead.
 */
function SwipeableRow({ t, cat, currency, isOpen, anyOpen, onOpenChange, onDelete, onEdit }: SwipeProps) {
  const [offset, setOffset] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const offsetRef = useRef(0);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const haptic = useHaptics();

  const setX = (x: number, animate: boolean) => {
    offsetRef.current = x;
    setSnapping(animate);
    setOffset(x);
  };

  // Parent-driven close (another row opened, view changed, tapped elsewhere).
  useEffect(() => {
    if (!isOpen && offsetRef.current !== 0) setX(0, true);
  }, [isOpen]);

  // Never leak window listeners if the row unmounts mid-gesture.
  useEffect(() => () => removeListenersRef.current?.(), []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (removeListenersRef.current) return; // a gesture is already running
    const gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: Date.now(),
      base: offsetRef.current,
      axis: "none" as "none" | "x" | "y",
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== gesture.pointerId) return;
      const dx = ev.clientX - gesture.startX;
      const dy = ev.clientY - gesture.startY;
      if (gesture.axis === "none") {
        if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return; // ignore tiny movements
        // Lock the axis once: swipe only when horizontal dominates, so
        // vertical scrolling (touch-action: pan-y) is untouched.
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (gesture.axis === "x") haptic(4);
      }
      if (gesture.axis !== "x") return;
      // Swipe left only: clamp between -SWIPE_WIDTH and 0.
      setX(Math.max(-SWIPE_WIDTH, Math.min(0, gesture.base + dx)), false);
    };

    const finish = (ev: PointerEvent, cancelled: boolean) => {
      if (ev.pointerId !== gesture.pointerId) return;
      removeListenersRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);

      if (gesture.axis === "x") {
        // Snap: open at -80 or closed at 0 — never an in-between offset.
        const open = offsetRef.current <= OPEN_AT;
        setX(open ? -SWIPE_WIDTH : 0, true);
        onOpenChange(open ? t.id : null);
        if (open) haptic(8);
      } else if (!cancelled && Date.now() - gesture.startT < TAP_MS) {
        // Tap: an open row closes first; edit opens only from a clean tap.
        if (anyOpen) onOpenChange(null);
        else onEdit();
      }
    };
    const onUp = (ev: PointerEvent) => finish(ev, false);
    const cancel = (ev: PointerEvent) => finish(ev, true);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    removeListenersRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
    };
  };

  return (
    <motion.li
      data-swipe-row
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18, ease: "easeInOut" } }}
      className="relative overflow-hidden"
    >
      {/* Delete action — BEHIND the row (z-0), revealed as the row slides left.
          touch-action: none stops the browser from turning a slightly-moving
          tap into a scroll (which would swallow the click on real phones). */}
      <button
        type="button"
        onClick={() => onDelete(t)}
        aria-label={`Delete ${t.note || "expense"}`}
        className="absolute inset-y-0 right-0 z-0 flex w-20 touch-none items-center justify-center bg-red-500 text-xl text-white active:bg-red-600"
      >
        ✕
      </button>

      {/* Foreground — the only element that moves (transform: translateX). */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit ${t.note || "expense"}, ${formatAmount(t.amount, currency)}`}
        onPointerDown={handlePointerDown}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit();
          }
        }}
        className="relative z-10 flex w-full touch-pan-y select-none items-center gap-3 bg-white px-4 py-3 text-left active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800"
        style={{
          transform: `translateX(${offset}px)`,
          transition: snapping ? "transform 180ms ease-out" : "none",
        }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: (cat?.color ?? "#64748b") + "22" }}
          aria-hidden
        >
          {cat?.icon ?? "📦"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{t.note || cat?.name || "Expense"}</span>
          <span className="block text-xs text-slate-400 dark:text-slate-500">{formatTime(t.time)}</span>
        </span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums">{formatAmount(t.amount, currency)}</span>
      </div>
    </motion.li>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-800">
        <ReceiptText size={36} className="text-slate-400" aria-hidden />
      </div>
      <p className="font-semibold">{filtered ? "No matching expenses" : "No expenses yet"}</p>
      <p className="max-w-[240px] text-sm text-slate-400">
        {filtered ? "Try clearing filters or changing your search." : "Tap the + button below to add your first expense."}
      </p>
    </div>
  );
}
