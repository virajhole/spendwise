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
function Highlight({ text, query }: { text: string; query: string }) {
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
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ txs: Transaction[]; timer: number } | null>(null);
  const haptic = useHaptics();
  const toastRef = useRef<{ txs: Transaction[]; timer: number } | null>(null);
  toastRef.current = toast;

  // Reset transient state whenever the view changes (month, filters, search).
  useEffect(() => {
    setSelection(new Set());
  }, [month, transactions]);

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

  // @tanstack/react-virtual is imperative — the hook rule can't model this
  // usage (measured rows, stable keys), so silence just that rule here.
  // eslint-disable-next-line react-hooks/incompatible-library
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

  const toggleSelect = useCallback(
    (id: string) => {
      haptic(8);
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [haptic],
  );

  const startSelection = useCallback(
    (t: Transaction) => {
      haptic([10, 20, 10]);
      setSelection(new Set([t.id]));
    },
    [haptic],
  );

  const exitSelection = useCallback(() => setSelection(new Set()), []);
  const selectedTxs = useMemo(() => sorted.filter((t) => selection.has(t.id)), [sorted, selection]);
  const selectionMode = selection.size > 0;

  const renderRow = useCallback(
    (t: Transaction) => (
      <Row
        key={t.id}
        t={t}
        cat={catMap.get(t.categoryId)}
        currency={currency}
        search={search}
        selectionMode={selectionMode}
        selected={selection.has(t.id)}
        onDelete={handleDelete}
        onEdit={() => setEditing(t)}
        onToggleSelect={toggleSelect}
        onStartSelection={startSelection}
      />
    ),
    [catMap, currency, search, selectionMode, selection, handleDelete, setEditing, toggleSelect, startSelection],
  );

  return (
    <div className="relative min-h-[120px] overflow-x-hidden pb-8" aria-label="Transactions">
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
                      <div className="px-3 pb-0.5">
                        <ul className="rounded-2xl bg-white shadow-sm dark:bg-slate-900">{renderRow(row.tx!)}</ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ---------- grouped: one card per day ---------- */
            groups.map((g) => (
              <section key={g.date} aria-label={g.label} className="mt-4 first:mt-3">
                <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {g.label}
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.items.map((t) => renderRow(t))}
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

interface RowProps {
  t: Transaction;
  cat: Category | undefined;
  currency: string;
  search: string;
  selectionMode: boolean;
  selected: boolean;
  onDelete: (t: Transaction) => void;
  onEdit: () => void;
  onToggleSelect: (id: string) => void;
  onStartSelection: (t: Transaction) => void;
}

/**
 * One transaction row. Tapping anywhere on the row (except the trash button)
 * opens the edit sheet via a native click — no pointer gestures, no tap
 * timing. The trash button deletes immediately (optimistic) and never
 * triggers edit. Long-press (500ms) starts multi-select.
 */
const Row = memo(function Row({ t, cat, currency, search, selectionMode, selected, onDelete, onEdit, onToggleSelect, onStartSelection }: RowProps) {
  const suppressClick = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });

  // Long-press starts multi-select; any movement >10px or release cancels it.
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      suppressClick.current = true;
      onStartSelection(t);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = (e?: React.PointerEvent) => {
    if (longPressTimer.current === null) return;
    if (e && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < 10) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const onRowClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false; // the click that followed a long-press
      return;
    }
    if (selectionMode) onToggleSelect(t.id);
    else onEdit();
  };

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // never open edit
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onDelete(t);
  };

  return (
    <li
      data-swipe-row
      className={`relative first:rounded-t-2xl last:rounded-b-2xl ${selected ? "bg-teal-600/10" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${selectionMode ? "Select" : "Edit"} ${t.note || "expense"}, ${formatAmount(t.amount, currency)}`}
        onClick={onRowClick}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => cancelLongPress(e)}
        onPointerUp={() => cancelLongPress()}
        onPointerCancel={() => cancelLongPress()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRowClick();
          }
        }}
        className="flex min-h-16 w-full cursor-pointer select-none items-center gap-3 py-3 pl-4 pr-14 text-left active:bg-slate-50 dark:active:bg-slate-800"
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

      {/* One-tap delete — separate touch target, never opens edit */}
      <button
        type="button"
        onClick={onDeleteClick}
        aria-label={`Delete ${t.note || "expense"}`}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-100 dark:text-slate-600 dark:hover:bg-red-950/40"
      >
        {selectionMode ? (
          <span aria-hidden className={`text-sm font-bold ${selected ? "text-teal-600 dark:text-teal-400" : ""}`}>
            {selected ? "✓" : "○"}
          </span>
        ) : (
          <Trash2 size={18} aria-hidden />
        )}
      </button>
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
