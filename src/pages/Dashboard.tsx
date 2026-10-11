import { useCallback, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import SummaryCard, { SlimSummary } from "../components/SummaryCard";
import AlertBanner from "../components/AlertBanner";
import SearchBar from "../components/SearchBar";
import TransactionList from "../components/TransactionList";
import QuickEntry from "../components/QuickEntry";
import { Link } from "react-router-dom";
import { Users, Wallet, ArrowUpRight } from "lucide-react";
import { personalAmount } from "../utils/finance";
import { formatAmount } from "../utils/format";
import EditDialog from "../components/EditDialog";
import type { Transaction } from "../db/types";
import { useStore } from "../store/store";
import {
  useBudget,
  useCategories,
  useTransactions,
  deleteExpense,
  restoreExpense,
  setBudget,
  updateExpense,
} from "../store/data";
import { budgetUsedPct, remainingBalance } from "../utils/calc";
import { filterTransactions } from "../utils/filters";
import { monthEndDate } from "../db/types";

/**
 * Home screen for a 360x780 phone.
 * Sticky search + slim-remaining block → scrollable summary + transactions →
 * compact input dock → bottom nav. The list shrinks; the dock never scrolls.
 */
export default function Dashboard() {
  const {
    month, currency, editing, setEditing,
    search, filterCategory, dateFrom, dateTo, minAmount, maxAmount,
  } = useStore();
  const transactions = useTransactions();
  const monthlyTransactions = useTransactions({ from: `${month}-01`, to: monthEndDate(month) });
  const categories = useCategories();
  const budget = useBudget(month);
  const scrollRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  // Summary is computed from ALL of the month's expenses (not the filtered set).
  const monthTxs = monthlyTransactions;
  const b = budget ?? 0;
  const pct = budgetUsedPct(b, monthTxs ?? []);
  const over = b > 0 && remainingBalance(b, monthTxs ?? []) < 0;

  // Search + filters (applied once, shared by the list and the result counter).
  const filtered = useMemo(
    () =>
      filterTransactions((transactions ?? []).filter(t => !t.finance || t.finance.kind === "expense"), { search, filterCategory, dateFrom, dateTo, minAmount, maxAmount }),
    [transactions, search, filterCategory, dateFrom, dateTo, minAmount, maxAmount],
  );
  const filteredTotal = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered]);
  // Collapse the big summary into the slim sticky bar on scroll.
  const onScroll = () => {
    const summaryH = summaryRef.current?.offsetHeight ?? 0;
    setCompact((scrollRef.current?.scrollTop ?? 0) > Math.max(0, summaryH - 40));
  };

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
          <SlimSummary remaining={remainingBalance(b, monthTxs ?? [])} pct={pct} currency={currency} visible={compact} />
        </div>

        <div ref={summaryRef}>
          <SummaryCard
            month={month}
            budget={budget}
            transactions={monthlyTransactions}
            currency={currency}
            onSetBudget={(amount) => void setBudget(month, amount)}
          />
        </div>
        <AlertBanner pct={pct} over={over} />

        <div className="grid grid-cols-2 gap-3 px-4 mt-4">
          <Link to="/people" className="shortcut-card"><Users size={20} /><span>Split & udhaar<small>Keep friends settled</small></span><ArrowUpRight size={15} /></Link>
          <Link to="/wallet" className="shortcut-card"><Wallet size={20} /><span>Your wallet<small>UPI, cash & cards</small></span><ArrowUpRight size={15} /></Link>
        </div>
        {!!transactions?.some(t => t.finance?.kind === "split") && <Link to="/people" className="surface mx-4 mt-4 flex justify-between gap-3 p-4 text-sm"><span>Your share of split bills</span><strong>{formatAmount(transactions.filter(t => t.finance?.kind === "split").reduce((s,t) => s + personalAmount(t), 0), currency)}</strong></Link>}
        <div className="section-heading px-4 mt-6 mb-1"><h2>Recent expenses</h2><span>Tap to edit</span></div>

        <TransactionList
          transactions={transactions === undefined ? undefined : filtered}
          categories={categories}
          currency={currency}
          search={search}
          scrollRef={scrollRef}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onDeleteMany={handleDeleteMany}
        />
      </div>

      <QuickEntry />

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
