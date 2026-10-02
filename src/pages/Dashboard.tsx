import { useCallback, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import SummaryCard, { SlimSummary } from "../components/SummaryCard";
import AlertBanner from "../components/AlertBanner";
import SearchBar from "../components/SearchBar";
import TransactionList from "../components/TransactionList";
import InputPad from "../components/InputPad";
import EditDialog from "../components/EditDialog";
import type { Transaction } from "../db/types";
import { useStore } from "../store/store";
import {
  useBudget,
  useCategories,
  useTransactions,
  deleteExpense,
  restoreExpense,
  saveExpense,
  setBudget,
  updateExpense,
} from "../store/data";
import { budgetUsedPct, remainingBalance } from "../utils/calc";
import { filterTransactions } from "../utils/filters";
import { currentTime, todayISO } from "../utils/format";

/**
 * Home screen for a 360x780 phone.
 * Sticky search + slim-remaining block → scrollable summary + transactions →
 * compact input dock → bottom nav. The list shrinks; the dock never scrolls.
 */
export default function Dashboard() {
  const {
    month, currency, collapsed, setCollapsed, editing, setEditing,
    search, filterCategory, dateFrom, dateTo, minAmount, maxAmount,
  } = useStore();
  const transactions = useTransactions();
  const categories = useCategories();
  const budget = useBudget(month);
  const scrollRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  // Summary is computed from ALL of the month's expenses (not the filtered set).
  const monthTxs = useMemo(
    () => (transactions === undefined ? undefined : transactions.filter((t) => t.date.startsWith(month))),
    [transactions, month],
  );
  const b = budget ?? 0;
  const pct = budgetUsedPct(b, monthTxs ?? []);
  const over = b > 0 && remainingBalance(b, monthTxs ?? []) < 0;

  // Search + filters (applied once, shared by the list and the result counter).
  const filtered = useMemo(
    () =>
      filterTransactions(transactions ?? [], { search, filterCategory, dateFrom, dateTo, minAmount, maxAmount }),
    [transactions, search, filterCategory, dateFrom, dateTo, minAmount, maxAmount],
  );
  const filteredTotal = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered]);
  const filteredMonthTxs = useMemo(() => filtered.filter((t) => t.date.startsWith(month)), [filtered, month]);
  const listPct = budgetUsedPct(b, filteredMonthTxs);
  const listRemaining = remainingBalance(b, filteredMonthTxs);

  // Collapse the big summary into the slim sticky bar on scroll.
  const onScroll = () => {
    const summaryH = summaryRef.current?.offsetHeight ?? 0;
    setCompact((scrollRef.current?.scrollTop ?? 0) > Math.max(0, summaryH - 40));
  };

  const handleSubmit = useCallback(
    async (input: { amount: number; note: string; categoryId: string }) => {
      await saveExpense({ ...input, date: todayISO(), time: currentTime() });
    },
    [],
  );
  const handleDelete = useCallback(async (t: { id: string }) => {
    await deleteExpense(t.id);
  }, []);
  const handleDeleteMany = useCallback(async (txs: { id: string }[]) => {
    await Promise.all(txs.map((t) => deleteExpense(t.id)));
  }, []);
  const handleRestore = useCallback((t: Transaction) => {
    void restoreExpense(t);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header month={month} />

      {/* Scrollable area: sticky search+remaining block → summary → transactions */}
      <div ref={scrollRef} onScroll={onScroll} className="list-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* One opaque sticky block: search bar + slim remaining bar */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-[#0f1115]">
          <SearchBar categories={categories} count={filtered.length} total={filteredTotal} currency={currency} />
          <SlimSummary remaining={listRemaining} pct={listPct} currency={currency} visible={compact} />
        </div>

        <div ref={summaryRef}>
          <SummaryCard
            month={month}
            budget={budget}
            transactions={transactions}
            currency={currency}
            onSetBudget={(amount) => void setBudget(month, amount)}
          />
        </div>
        <AlertBanner pct={pct} over={over} />

        <TransactionList
          transactions={filtered}
          categories={categories}
          currency={currency}
          search={search}
          scrollRef={scrollRef}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onDeleteMany={handleDeleteMany}
        />
      </div>

      <InputPad
        categories={categories}
        currency={currency}
        collapsed={collapsed}
        onSetCollapsed={setCollapsed}
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
    </div>
  );
}
