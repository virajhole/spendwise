import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import type { Category, Transaction } from "../db/db";

interface Props {
  tx: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSave: (patch: Partial<Transaction>) => void;
  onDelete: () => void;
}

export default function EditDialog({ tx, categories, onClose, onSave, onDelete }: Props) {
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [note, setNote] = useState(tx?.note ?? "");
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? "other");
  const [date, setDate] = useState(tx?.date ?? "");
  const [time, setTime] = useState(tx?.time ?? "");
  const [key, setKey] = useState(tx?.id ?? "");

  // Reset local state when a different transaction is opened
  if (tx && tx.id !== key) {
    setKey(tx.id);
    setAmount(String(tx.amount));
    setNote(tx.note);
    setCategoryId(tx.categoryId);
    setDate(tx.date);
    setTime(tx.time);
  }

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
            aria-label="Edit expense"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-full max-w-[480px] rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit expense</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={20} aria-hidden />
              </button>
            </div>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Amount</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-lg font-bold outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
            />

            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
            />

            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">Category</label>
            <div className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
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
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
                />
              </div>
              <div className="w-32">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                aria-label="Delete expense"
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
              >
                <Trash2 size={20} aria-hidden />
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
