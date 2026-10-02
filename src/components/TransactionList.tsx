import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ReceiptText, Trash2, X } from "lucide-react";
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
const LONG_PRESS_MS = 500;
const VIRTUALIZE_OVER = 100;

interface Props {
  /** Already filtered + sorted upstream (Dashboard). */
  transactions: Transaction[] | undefined;
  categories: Category[];
  currency: string;
  search: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onDelete: (t: Transaction) => void;
  onRestore: (t: Transaction) => void;
  onDeleteMany: (txs: Transaction[]) => void;
}

/** Highlight the search match inside a note. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="hl">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function TransactionList({ transactions, categories, currency, search, scrollRef, onDelete, onRestore, onDeleteMany }: Props) {
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const { month, setEditing } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ txs: Transaction[]; timer: number } | null>(null);
  const haptic = useHaptics();
  const toastRef = useRef<{ txs: Transaction[]; timer: number } | null>(null);
  toastRef.current = toast;

  // Reset transient state whenever the view changes (month, filters, search).
  useEffect(() => {
    setOpenId(null);
    setSelection(new Set());
  }, [month, transactions]);

  // Scrolling anywhere closes the open row.
  useEffect(() => {
    if (!openId) return;
    const onScroll = () => setOpenId(null);
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [openId]);

  // Dismiss the open row when tapping anywhere outside a row.
  useEffect(() => {
    if (!openId) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-swipe-row]")) return;
      setOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openId]);

  const sorted = useMemo(() => sortByNewest(transactions ?? []), [transactions]);
  const groups = useMemo(() => groupByDate(sorted), [sorted]);

  // Flatten once for the virtualized variant (>100 items).
  const flat = useMemo(() => {
    const rows: { type: "header" | "row"; key: string; label?: string; tx?: Transaction }[] = [];
    for (const g of groups) {
      rows.push({ type: "header", key: `h:${g.date}`, label: g.label });
      for (const t of g.items) rows.push({ type: "row", key: t.id, tx: t });
    }
    return rows;
  }, [groups]);
  const virtualize = flat.length > VIRTUALIZE_OVER;

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: (i) => (flat[i]?.type === "header" ? 32 : 76),
    overscan: 6,
    getItemKey: (i) => flat[i]?.key ?? String(i),
  });

  const showToast = useCallback((txs: Transaction[]) => {
    if (toastRef.current) window.clearTimeout(toastRef.current.timer);
    const timer = window.setTimeout(() => setToast(null), 5000);
    setToast({ txs, timer });
  }, []);

  const handleDelete = useCallback(
    (t: Transaction) => {
      haptic(12);
      setOpenId(null);
      onDelete(t);
      showToast([t]);
    },
    [onDelete, showToast, haptic],
  );

  const handleRestore = useCallback(
    (txs: Transaction[]) => {
      for (const t of txs) onRestore(t);
      if (toastRef.current) window.clearTimeout(toastRef.current.timer);
      setToast(null);
    },
    [onRestore],
  );

  const handleDeleteMany = useCallback(
    (txs: Transaction[]) => {
      haptic([10, 20, 10]);
      onDeleteMany(txs);
      showToast(txs);
      setSelection(new Set());
    },
    [onDeleteMany, showToast, haptic],
  );

  const toggleSelect = useCallback((id: string) => {
    haptic(8);
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [haptic]);

  const startSelection = useCallback(
    (t: Transaction) => {
      haptic([10, 20, 10]);
      setOpenId(null);
      setSelection(new Set([t.id]));
    },
    [haptic],
  );

  const exitSelection = useCallback(() => setSelection(new Set()), []);
  const selectedTxs = useMemo(() => sorted.filter((t) => selection.has(t.id)), [sorted, selection]);
  const selectionMode = selection.size > 0;

  return (
    <div className="relative min-h-[120px] overflow-x-hidden px-3 pb-8" aria-label="Transactions">
      {transactions === undefined ? (
        <SkeletonRows rows={3} />
      ) : (
        <>
          {/* Bulk-selection action bar */}
          {selectionMode ? (
            <div
              className="fixed inset-x-0 top-2 z-40 mx-auto flex max-w-[420px] items-center gap-2 rounded-2xl bg-slate-800 px-3 py-2 text-white shadow-xl dark:bg-slate-700"
              role="toolbar"
              aria-label="Bulk actions"
            >
              <button onClick={exitSelection} aria-label="Cancel selection" className="rounded-full p-1.5 hover:bg-white/10">
                <X size={16} aria-hidden />
              </button>
              <span className="flex-1 text-sm font-semibold">{selection.size} selected</span>
              <button
                onClick={() => handleDeleteMany(selectedTxs)}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-sm font-bold active:bg-red-600"
              >
                <Trash2 size={14} aria-hidden /> Delete
              </button>
            </div>
          ) : null}

          {groups.length === 0 && sorted.length === 0 ? (
            <EmptyState filtered={Boolean(search)} />
          ) : virtualize ? (
            /* ---------- virtualized (very large lists) ---------- */
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const row = flat[vi.index];
                return (
                  <div
                    key={row.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                  >
                    {row.type === "header" ? (
                      <h3 className="mb-2 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {row.label}
                      </h3>
                    ) : (
                      <div className="rounded-2xl bg-white shadow-sm dark:bg-slate-900">
                        <SwipeableRow
                          t={row.tx!}
                          cat={catMap.get(row.tx!.categoryId)}
                          currency={currency}
                          search={search}
                          isOpen={openId === row.tx!.id}
                          anyOpen={openId !== null}
                          selectionMode={selectionMode}
                          selected={selection.has(row.tx!.id)}
                          onOpenChange={setOpenId}
                          onDelete={handleDelete}
                          onEdit={() => setEditing(row.tx!)}
                          onToggleSelect={toggleSelect}
                          onStartSelection={startSelection}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ---------- grouped: plain headers + ONE card per day ---------- */
            groups.map((g) => (
              <section key={g.date} aria-label={g.label} className="mt-4 first:mt-3">
                <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {g.label}
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.items.map((t) => (
                    <SwipeableRow
                      key={t.id}
                      t={t}
                      cat={catMap.get(t.categoryId)}
                      currency={currency}
                      search={search}
                      isOpen={openId === t.id}
                      anyOpen={openId !== null}
                      selectionMode={selectionMode}
                      selected={selection.has(t.id)}
                      onOpenChange={setOpenId}
                      onDelete={handleDelete}
                      onEdit={() => setEditing(t)}
                      onToggleSelect={toggleSelect}
                      onStartSelection={startSelection}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+72px)] z-30 mx-auto flex max-w-[420px] items-center justify-between gap-3 rounded-2xl bg-slate-800 px-4 py-3 text-white shadow-xl dark:bg-slate-700"
            role="status"
          >
            <span className="text-sm">
              {toast.txs.length === 1
                ? `Deleted “${toast.txs[0].note || "expense"}” · ${formatAmount(toast.txs[0].amount, currency)}`
                : `Deleted ${toast.txs.length} expenses`}
            </span>
            <button onClick={() => handleRestore(toast.txs)} className="text-sm font-bold text-teal-300">
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
  search: string;
  isOpen: boolean;
  anyOpen: boolean;
  selectionMode: boolean;
  selected: boolean;
  onOpenChange: (id: string | null) => void;
  onDelete: (t: Transaction) => void;
  onEdit: () => void;
  onToggleSelect: (id: string) => void;
  onStartSelection: (t: Transaction) => void;
}

/**
 * One transaction row. This <li> is the swipe wrapper: the ONLY element with
 * overflow hidden, wrapping exactly one row and matching the group card's
 * radius (first/last row). Rows sit in one card per day with thin dividers —
 * no fixed heights, no absolute group containers, no sticky headers.
 */
const SwipeableRow = memo(function SwipeableRow({
  t, cat, currency, search, isOpen, anyOpen, selectionMode, selected, onOpenChange, onDelete, onEdit, onToggleSelect, onStartSelection,
}: SwipeProps) {
  const [offset, setOffset] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const offsetRef = useRef(0);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const longPressRef = useRef(false);
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
    if (removeListenersRef.current) return;
    const gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: Date.now(),
      base: offsetRef.current,
      axis: "none" as "none" | "x" | "y",
    };

    // Long-press starts multi-select (only from a resting finger).
    const longPress = window.setTimeout(() => {
      if (gesture.axis === "none" && !selectionMode) {
        longPressRef.current = true;
        onStartSelection(t);
      }
    }, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== gesture.pointerId) return;
      const dx = ev.clientX - gesture.startX;
      const dy = ev.clientY - gesture.startY;
      if (gesture.axis === "none") {
        if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
        window.clearTimeout(longPress);
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (gesture.axis === "x") haptic(4);
      }
      if (gesture.axis !== "x" || selectionMode) return;
      setX(Math.max(-SWIPE_WIDTH, Math.min(0, gesture.base + dx)), false);
    };

    const cleanup = () => {
      window.clearTimeout(longPress);
      removeListenersRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
    };

    const finish = (ev: PointerEvent, cancelled: boolean) => {
      if (ev.pointerId !== gesture.pointerId) return;
      cleanup();
      if (gesture.axis === "x") {
        const open = offsetRef.current <= OPEN_AT;
        setX(open ? -SWIPE_WIDTH : 0, true);
        onOpenChange(open ? t.id : null);
        if (open) haptic(8);
      } else if (!cancelled && !longPressRef.current && Date.now() - gesture.startT < TAP_MS) {
        if (selectionMode) onToggleSelect(t.id);
        else if (anyOpen) onOpenChange(null);
        else onEdit();
      }
      longPressRef.current = false;
    };
    const onUp = (ev: PointerEvent) => finish(ev, false);
    const cancel = (ev: PointerEvent) => finish(ev, true);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    removeListenersRef.current = cleanup;
  };

  return (
    <li
      data-swipe-row
      className={`relative overflow-hidden first:rounded-t-2xl last:rounded-b-2xl ${selected ? "bg-teal-600/10" : ""}`}
    >
      {selectionMode ? (
        <button
          type="button"
          onClick={() => onToggleSelect(t.id)}
          aria-label={`${selected ? "Deselect" : "Select"} ${t.note || "expense"}`}
          aria-pressed={selected}
          className="absolute inset-y-0 left-0 z-20 flex w-12 items-center justify-center text-lg font-bold"
          style={{ backgroundColor: selected ? "#0ea5a4" : undefined, color: selected ? "#fff" : undefined }}
        >
          {selected ? "✓" : ""}
        </button>
      ) : (
        /* Delete action — BEHIND the row, revealed as it slides left. */
        <button
          type="button"
          onClick={() => onDelete(t)}
          aria-label={`Delete ${t.note || "expense"}`}
          className="absolute inset-y-0 right-0 z-0 flex w-20 touch-none items-center justify-center bg-red-500 text-xl text-white active:bg-red-600"
        >
          ✕
        </button>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={`${selectionMode ? "Select" : "Edit"} ${t.note || "expense"}, ${formatAmount(t.amount, currency)}`}
        onPointerDown={handlePointerDown}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (selectionMode) onToggleSelect(t.id);
            else onEdit();
          }
        }}
        style={{
          transform: `translateX(${selectionMode ? 48 : offset}px)`,
          transition: snapping ? "transform 180ms ease-out" : "none",
        }}
        className="relative z-10 flex min-h-16 w-full touch-pan-y select-none items-center gap-3 bg-white px-4 py-3 text-left active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: (cat?.color ?? "#64748b") + "22" }}
          aria-hidden
        >
          {cat?.icon ?? "📦"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">
            <Highlight text={t.note || cat?.name || "Expense"} query={search} />
          </span>
          <span className="block text-xs text-slate-400 dark:text-slate-500">{formatTime(t.time)}</span>
        </span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums">{formatAmount(t.amount, currency)}</span>
      </div>
    </li>
  );
});

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-800">
        <ReceiptText size={36} className="text-slate-400" aria-hidden />
      </div>
      <p className="font-semibold">{filtered ? "No matching expenses" : "No expenses yet"}</p>
      <p className="text-sm text-slate-400">
        {filtered
          ? "Try different words, or clear the filters from the search bar above."
          : "Tap the amount box below, punch in the amount and hit the big + to log your first expense."}
      </p>
    </div>
  );
}
