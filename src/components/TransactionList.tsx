import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDragControls, type PanInfo } from "framer-motion";
import { ReceiptText } from "lucide-react";
import type { Category, Transaction } from "../db/db";
import { groupByDate, sortByNewest } from "../utils/calc";
import { formatAmount, formatTime } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";
import { useStore } from "../store/store";

interface Props {
  transactions: Transaction[] | undefined;
  categories: Category[];
  currency: string;
  onDelete: (t: Transaction) => void;
  onRestore: (t: Transaction) => void;
}

export default function TransactionList({ transactions, categories, currency, onDelete, onRestore }: Props) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const { search, filterCategory, dateFrom, dateTo, setEditing } = useStore();
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

  const handleDelete = (t: Transaction) => {
    haptic(12);
    onDelete(t);
    if (toast) window.clearTimeout(toast.timer);
    const timer = window.setTimeout(() => setToast(null), 5000);
    setToast({ tx: t, timer });
  };

  return (
    <div className="relative min-h-[120px] px-4 pb-4" aria-label="Transactions">
      {groups.length === 0 && (transactions ?? []).length === 0 ? (
        <EmptyState filtered={Boolean(search || filterCategory || dateFrom || dateTo)} />
      ) : (
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.section
              key={g.date}
              layout
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
                    <Row key={t.id} t={t} cat={catMap.get(t.categoryId)} currency={currency} onDelete={handleDelete} onEdit={() => setEditing(t)} />
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
              onClick={() => {
                onRestore(toast.tx);
                window.clearTimeout(toast.timer);
                setToast(null);
              }}
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

function Row({
  t,
  cat,
  currency,
  onDelete,
  onEdit,
}: {
  t: Transaction;
  cat: Category | undefined;
  currency: string;
  onDelete: (t: Transaction) => void;
  onEdit: () => void;
}) {
  const controls = useDragControls();
  const haptic = useHaptics();

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } }}
      drag="x"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ left: -100, right: 0 }}
      dragElastic={{ left: 0.1, right: 0 }}
      onDragEnd={(_, info: PanInfo) => {
        if (info.offset.x < -70) onDelete(t);
      }}
      exit={{
        x: -320,
        opacity: 0,
        height: 0,
        marginTop: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        transition: { x: { duration: 0.22, ease: "easeIn" }, opacity: { duration: 0.16 }, height: { duration: 0.24, delay: 0.06, ease: "easeInOut" } },
      }}
      className="relative flex items-stretch overflow-hidden"
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800"
        aria-label={`Edit ${t.note || "expense"}, ${formatAmount(t.amount, currency)}`}
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
      </button>
      <button
        onClick={() => onDelete(t)}
        className="flex w-16 items-center justify-center bg-red-500 text-white"
        aria-label={`Delete ${t.note || "expense"}`}
      >
        ✕
      </button>
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
