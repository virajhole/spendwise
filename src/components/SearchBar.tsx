import { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Category } from "../db/types";
import { formatAmount } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";
import { useStore } from "../store/store";

interface Props {
  categories: Category[];
  count: number;
  total: number;
  currency: string;
}

/**
 * Sticky search + filter header for the transactions list.
 * - 200ms debounced search with result count / filtered total and a clear ✕
 * - filter panel: category, date range, amount range — active filters appear
 *   as one-tap-removable chips
 */
export default function SearchBar({ categories, count, total, currency }: Props) {
  const {
    search, setSearch, filterCategory, setFilterCategory,
    dateFrom, dateTo, setDateRange, minAmount, maxAmount, setAmountRange,
  } = useStore();
  const [text, setText] = useState(search);
  const [panelOpen, setPanelOpen] = useState(false);
  const haptic = useHaptics();
  const timer = useRef<number | null>(null);

  // Debounce the raw input into the store (200ms).
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSearch(text), 200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const clearAll = () => {
    setText("");
    setSearch("");
    setFilterCategory(null);
    setDateRange(null, null);
    setAmountRange(null, null);
    haptic(8);
  };

  const activeChips: { key: string; label: string; remove: () => void }[] = [];
  if (filterCategory) {
    const cat = categories.find((c) => c.id === filterCategory);
    activeChips.push({
      key: "cat",
      label: `${cat?.icon ?? ""} ${cat?.name ?? "Category"}`,
      remove: () => setFilterCategory(null),
    });
  }
  if (dateFrom || dateTo) {
    activeChips.push({
      key: "date",
      label: `${dateFrom ?? "…"} → ${dateTo ?? "…"}`,
      remove: () => setDateRange(null, null),
    });
  }
  if (minAmount !== null || maxAmount !== null) {
    activeChips.push({
      key: "amount",
      label: `₹${minAmount ?? 0} – ₹${maxAmount ?? "∞"}`,
      remove: () => setAmountRange(null, null),
    });
  }
  const filtersActive = activeChips.length > 0;

  return (
    <div className="bg-slate-100 px-3 py-2 dark:bg-[#0f1115]">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search notes…"
            aria-label="Search transactions"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-base outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900"
          />
          {text ? (
            <button
              onClick={() => setText("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>
        <button
          onClick={() => {
            setPanelOpen(!panelOpen);
            haptic(8);
          }}
          aria-expanded={panelOpen}
          aria-label="Filters"
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
            panelOpen || filtersActive
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          <SlidersHorizontal size={16} aria-hidden />
          {filtersActive ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> : null}
        </button>
      </div>

      {/* Result summary + removable filter chips */}
      {(filtersActive || text) ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400" role="status">
            {count} result{count === 1 ? "" : "s"} · {formatAmount(total, currency)}
          </span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => {
                chip.remove();
                haptic(8);
              }}
              className="flex h-7 items-center gap-1 rounded-full bg-teal-600/10 pl-2.5 pr-1.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-400/10 dark:text-teal-300"
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X size={12} aria-hidden />
            </button>
          ))}
          {filtersActive ? (
            <button onClick={clearAll} className="h-7 px-1.5 text-[11px] font-semibold text-slate-400 underline">
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Filter panel */}
      {panelOpen ? (
        <div className="mt-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Category</p>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterCategory(null)}
              aria-pressed={filterCategory === null}
              className={`h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${
                filterCategory === null ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCategory(filterCategory === c.id ? null : c.id)}
                aria-pressed={filterCategory === c.id}
                className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ${
                  filterCategory === c.id ? "text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
                style={filterCategory === c.id ? { backgroundColor: c.color } : undefined}
              >
                <span aria-hidden>{c.icon}</span>
                {c.name}
              </button>
            ))}
          </div>

          <p className="mb-1.5 mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Date range</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom ?? ""}
              onChange={(e) => setDateRange(e.target.value || null, dateTo)}
              aria-label="From date"
              className="h-10 min-w-0 flex-1 rounded-xl bg-slate-100 px-2 text-base outline-none dark:bg-slate-800"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={dateTo ?? ""}
              onChange={(e) => setDateRange(dateFrom, e.target.value || null)}
              aria-label="To date"
              className="h-10 min-w-0 flex-1 rounded-xl bg-slate-100 px-2 text-base outline-none dark:bg-slate-800"
            />
          </div>

          <p className="mb-1.5 mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount range</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={minAmount ?? ""}
              onChange={(e) => setAmountRange(e.target.value === "" ? null : Number(e.target.value), maxAmount)}
              placeholder="Min"
              aria-label="Minimum amount"
              className="h-10 min-w-0 flex-1 rounded-xl bg-slate-100 px-2 text-base outline-none dark:bg-slate-800"
            />
            <span className="text-slate-400">→</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={maxAmount ?? ""}
              onChange={(e) => setAmountRange(minAmount, e.target.value === "" ? null : Number(e.target.value))}
              placeholder="Max"
              aria-label="Maximum amount"
              className="h-10 min-w-0 flex-1 rounded-xl bg-slate-100 px-2 text-base outline-none dark:bg-slate-800"
            />
          </div>

          {filtersActive ? (
            <button onClick={clearAll} className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Clear all filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
