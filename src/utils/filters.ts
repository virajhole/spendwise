import type { Transaction } from "../db/types";

export interface FilterState {
  search: string;
  filterCategory: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  minAmount: number | null;
  maxAmount: number | null;
}

export const EMPTY_FILTERS: FilterState = {
  search: "",
  filterCategory: null,
  dateFrom: null,
  dateTo: null,
  minAmount: null,
  maxAmount: null,
};

/** Apply every active filter to a list of transactions. */
export function filterTransactions(txs: Transaction[], f: FilterState): Transaction[] {
  const q = f.search.trim().toLowerCase();
  return txs.filter((t) => {
    if (f.filterCategory && t.categoryId !== f.filterCategory) return false;
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    if (f.minAmount !== null && t.amount < f.minAmount) return false;
    if (f.maxAmount !== null && t.amount > f.maxAmount) return false;
    if (q && !t.note.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** True when any filter is active (used for the "clear" affordance). */
export function hasActiveFilters(f: FilterState): boolean {
  return Boolean(
    f.search.trim() || f.filterCategory || f.dateFrom || f.dateTo || f.minAmount !== null || f.maxAmount !== null,
  );
}
