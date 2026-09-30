import { Search, X } from "lucide-react";
import type { Category } from "../db/db";
import { useStore } from "../store/store";

interface Props {
  categories: Category[];
}

export default function FilterBar({ categories }: Props) {
  const { search, setSearch, filterCategory, setFilterCategory } = useStore();
  const active = search || filterCategory;

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            aria-label="Search transactions"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-[15px] outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900"
          />
        </div>
        {active ? (
          <button
            onClick={() => {
              setSearch("");
              setFilterCategory(null);
            }}
            aria-label="Clear filters"
            className="rounded-full bg-slate-200 p-2 dark:bg-slate-800"
          >
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCategory(filterCategory === c.id ? null : c.id)}
            aria-pressed={filterCategory === c.id}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filterCategory === c.id
                ? "bg-teal-600 text-white"
                : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <span aria-hidden>{c.icon}</span>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
