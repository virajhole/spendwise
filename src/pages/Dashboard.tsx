import { useState } from "react";
import { motion } from "framer-motion";
import Header from "../components/Header";
import SummaryCard from "../components/SummaryCard";
import AlertBanner from "../components/AlertBanner";
import FilterBar from "../components/FilterBar";
import TransactionList from "../components/TransactionList";
import InputPad from "../components/InputPad";
import EditDialog from "../components/EditDialog";
import { useCategories, useStore, useTransactions, useBudget, saveExpense, updateExpense, deleteExpense, restoreExpense } from "../store/store";
import { repo } from "../db/repo";
import { budgetUsedPct, inMonth, remainingBalance } from "../utils/calc";
import { currentTime, todayISO } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";

export default function Dashboard() {
  const { month, currency, collapsed, toggleCollapsed, editing, setEditing, dateFrom, dateTo } = useStore();
  const transactions = useTransactions();
  const categories = useCategories();
  const budget = useBudget(month);
  const [flash, setFlash] = useState(false);
  const haptic = useHaptics();

  const monthTxs = (transactions ?? []).filter((t) => t.date.startsWith(month));
  const b = budget ?? 0;
  const pct = budgetUsedPct(b, monthTxs);
  const over = b > 0 && remainingBalance(b, monthTxs) < 0;

  const handleSubmit = async (input: { amount: number; note: string; categoryId: string }) => {
    await saveExpense({ ...input, date: todayISO(), time: currentTime() });
    setFlash(true);
    haptic([15, 30]);
    setTimeout(() => setFlash(false), 400);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header month={month} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <SummaryCard
          month={month}
          budget={budget}
          transactions={transactions}
          currency={currency}
          onSetBudget={(amount) => void repo.setBudget(month, amount)}
        />
        <AlertBanner pct={pct} over={over} />
        <FilterBar categories={categories} />
        <TransactionList
          transactions={dateFrom || dateTo ? transactions : monthTxs}
          categories={categories}
          currency={currency}
          onDelete={async (t) => {
            await deleteExpense(t.id);
          }}
          onRestore={(t) => void restoreExpense(t)}
        />
      </div>
      <InputPad
        categories={categories}
        currency={currency}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onSubmit={handleSubmit}
      />

      <EditDialog
        tx={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (editing) void updateExpense(editing.id, patch);
        }}
        onDelete={() => {
          if (editing) void deleteExpense(editing.id);
        }}
      />

      {/* subtle flash animation on the summary when a new expense is added */}
      <AnimateFlash flash={flash} />
    </div>
  );
}

function AnimateFlash({ flash }: { flash: boolean }) {
  return flash ? (
    <motion.div
      initial={{ opacity: 0.35 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="pointer-events-none fixed inset-0 z-30 bg-teal-400"
      aria-hidden
    />
  ) : null;
}
