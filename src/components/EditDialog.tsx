import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { NOTE_MAX_LENGTH, type Category, type Transaction } from "../db/types";

interface Props {
  tx: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSave: (patch: Partial<Transaction>) => void;
  onDelete: () => void;
}

/**
 * Edit expense bottom sheet: slides up, capped at 85dvh with rounded top
 * corners and a backdrop. Content scrolls inside; the action row stays pinned
 * above the safe area. Body scroll is locked while open and the Android back
 * button closes it. Inputs are ≥16px so the mobile keyboard never zooms.
 */
export default function EditDialog({ tx, categories, onClose, onSave, onDelete }: Props) {
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [note, setNote] = useState(tx?.note ?? "");
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? "");
  const [date, setDate] = useState(tx?.date ?? "");
  const [time, setTime] = useState(tx?.time ?? "");
  const [key, setKey] = useState(tx?.id ?? "");
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset local state when a different transaction is opened
  if (tx && tx.id !== key) {
    setKey(tx.id);
    setAmount(String(tx.amount));
    setNote(tx.note);
    setCategoryId(tx.categoryId);
    setDate(tx.date);
    setTime(tx.time);
  }

  const open = tx !== null;

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Android back button closes the sheet: push an entry on open; if the sheet
  // closes through the UI instead, consume that entry.
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ spendwiseSheet: true }, "");
    const onPopState = () => onCloseRef.current();
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if ((window.history.state as { spendwiseSheet?: boolean } | null)?.spendwiseSheet) {
        window.history.back();
      }
    };
  }, [open]);

  // Keep the focused field visible above the on-screen keyboard.
  const revealOnFocus = (e: React.FocusEvent<HTMLElement>) => {
    window.setTimeout(() => {
      e.target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250); // wait for the keyboard to start appearing
  };

  return (
    <AnimatePresence>
      {tx ? (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Edit expense"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white dark:bg-slate-900"
            style={{ maxHeight: "85dvh" }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="text-lg font-bold">Edit expense</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={20} aria-hidden />
              </button>
            </div>

            {/* Scrollable content — everything fits in 85dvh; long content scrolls here */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
              <label htmlFor="edit-amount" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Amount</label>
              <input
                id="edit-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onFocus={revealOnFocus}
                className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-lg font-bold outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
              />

              <label htmlFor="edit-note" className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">Note</label>
              <input
                id="edit-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onFocus={revealOnFocus}
                maxLength={NOTE_MAX_LENGTH}
                className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
              />

              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">Category</label>
              <div className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Category">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    role="radio"
                    onClick={() => setCategoryId(c.id)}
                    aria-checked={categoryId === c.id}
                    className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      categoryId === c.id ? "border-transparent text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    }`}
                    style={categoryId === c.id ? { backgroundColor: c.color } : undefined}
                  >
                    <span aria-hidden>{c.icon}</span>
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <label htmlFor="edit-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Date</label>
                  <input
                    id="edit-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onFocus={revealOnFocus}
                    className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
                  />
                </div>
                <div className="w-32">
                  <label htmlFor="edit-time" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Time</label>
                  <input
                    id="edit-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    onFocus={revealOnFocus}
                    className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Pinned actions — never hidden behind the keyboard (85dvh sheet) */}
            <div className="flex gap-2 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3">
              <button
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                aria-label="Delete expense"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
              >
                <Trash2 size={20} aria-hidden />
              </button>
              <button
                onClick={onClose}
                className="h-12 shrink-0 rounded-2xl bg-slate-100 px-5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const amt = Number(amount);
                  onSave({
                    amount: amt > 0 ? amt : tx.amount,
                    note: note.trim(),
                    categoryId,
                    date,
                    time,
                  });
                  onClose();
                }}
                className="h-12 flex-1 rounded-2xl bg-teal-600 font-bold text-white active:bg-teal-700"
              >
                Save changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
