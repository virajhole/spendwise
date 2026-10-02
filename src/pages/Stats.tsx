import { useEffect, useState } from "react";
import Header from "../components/Header";
import { SkeletonBlock } from "../components/Skeletons";
import { useBudget, useCategories, useTransactions } from "../store/data";
import { useStore } from "../store/store";
import { repo } from "../db/repo";
import { monthEndDate } from "../db/types";
import { avgPerDay, byCategory, dailySpend, inMonth, monthLabel, projectedMonthEnd, remainingBalance, shiftMonth, totalExpense } from "../utils/calc";
import { formatAmount } from "../utils/format";
import { todayISO } from "../utils/format";

export default function Stats() {
  const { month, currency } = useStore();
  const transactions = useTransactions();
  const categories = useCategories();
  const budget = useBudget(month);

  // Last month's total for the comparison card.
  const prevMonth = shiftMonth(month, -1);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPrevTotal(null);
    void repo
      .getExpenses({ from: `${prevMonth}-01`, to: monthEndDate(prevMonth) })
      .then((txs) => {
        if (!cancelled) setPrevTotal(totalExpense(txs));
      })
      .catch(() => {
        if (!cancelled) setPrevTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [prevMonth]);

  const txs = transactions ?? [];
  const monthTxs = inMonth(txs.filter((t) => t.categoryId), month) as (typeof txs[number])[];
  const catTotals = byCategory(monthTxs.map((t) => ({ amount: t.amount, date: t.date, categoryId: t.categoryId })));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const total = totalExpense(monthTxs);
  const top = catTotals[0];
  const avg = avgPerDay(txs, month);
  const projected = projectedMonthEnd(txs, month);
  const daily = dailySpend(txs, month);
  const maxDay = Math.max(...daily.map((d) => d.amount), 1);
  const daysElapsed = monthTxs.length ? new Set(monthTxs.map((t) => t.date)).size : 0;

  // Daily spending limit: what's left of the budget, spread over the days that
  // remain in the current month. Only meaningful for the current month.
  const isCurrentMonth = month === todayISO().slice(0, 7);
  const [yy, mm] = month.split("-").map(Number);
  const daysLeft = isCurrentMonth ? Math.max(1, new Date(yy, mm, 0).getDate() - new Date().getDate() + 1) : 0;
  const dailyLimit = budget && budget > 0 && isCurrentMonth ? Math.max(0, remainingBalance(budget, monthTxs)) / daysLeft : null;

  // Month-over-month difference (current total vs the previous month's).
  const diff = prevTotal === null ? null : total - prevTotal;

  const colors = ["#0ea5a4", "#f97316", "#3b82f6", "#ec4899", "#eab308", "#8b5cf6", "#64748b"];
  const R = 56;
  const C = 2 * Math.PI * R;
  let acc = 0;

  if (transactions === undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Header month={month} />
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-2" aria-label="Loading stats" role="status">
          <SkeletonBlock className="h-[212px] animate-pulse" />
          <SkeletonBlock className="h-[168px] animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <SkeletonBlock className="h-[88px] animate-pulse" />
            <SkeletonBlock className="h-[88px] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header month={month} />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Donut chart */}
        <section aria-label="Spending by category" className="mt-2 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">By category</h2>
          <div className="flex items-center gap-5">
            <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label="Donut chart of spending by category">
              <circle cx="70" cy="70" r={R} fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="16" />
              {catTotals.map((c, i) => {
                const frac = total > 0 ? c.amount / total : 0;
                const dash = frac * C;
                const el = (
                  <circle
                    key={c.categoryId}
                    cx="70"
                    cy="70"
                    r={R}
                    fill="none"
                    stroke={catMap.get(c.categoryId)?.color ?? colors[i % colors.length]}
                    strokeWidth="16"
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-acc}
                    strokeLinecap="butt"
                    transform="rotate(-90 70 70)"
                  />
                );
                acc += dash;
                return el;
              })}
              <text x="70" y="66" textAnchor="middle" className="fill-slate-400 text-[10px] font-semibold" fontSize="10">
                TOTAL
              </text>
              <text x="70" y="82" textAnchor="middle" className="fill-slate-900 font-bold dark:fill-white" fontSize="14">
                {formatAmount(total, currency)}
              </text>
            </svg>
            <ul className="flex-1 space-y-1.5 text-sm">
              {catTotals.slice(0, 6).map((c, i) => (
                <li key={c.categoryId} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: catMap.get(c.categoryId)?.color ?? colors[i % colors.length] }} aria-hidden />
                  <span className="flex-1 truncate">{catMap.get(c.categoryId)?.name ?? c.categoryId}</span>
                  <span className="font-semibold tabular-nums">{formatAmount(c.amount, currency)}</span>
                  <span className="w-9 text-right text-xs text-slate-400">{total > 0 ? Math.round((c.amount / total) * 100) : 0}%</span>
                </li>
              ))}
              {catTotals.length === 0 ? <li className="text-slate-400">No data this month</li> : null}
            </ul>
          </div>
        </section>

        {/* Daily bars */}
        <section aria-label="Daily spending" className="mt-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Daily spending</h2>
          <div className="flex h-28 items-end gap-[2px]" role="img" aria-label="Bar chart of daily spending">
            {daily.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${formatAmount(d.amount, currency)}`}
                className="min-w-[4px] flex-1 rounded-t bg-teal-500/80"
                style={{ height: `${Math.max(2, (d.amount / maxDay) * 100)}%`, opacity: d.amount ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>1</span>
            <span>{daily.length}</span>
          </div>
        </section>

        {/* Insight cards */}
        <section aria-label="Insights" className="mt-4 grid grid-cols-2 gap-3">
          <InsightCard label="Top category" value={top ? `${catMap.get(top.categoryId)?.icon ?? ""} ${catMap.get(top.categoryId)?.name ?? "—"}` : "—"} sub={top ? formatAmount(top.amount, currency) : undefined} />
          <InsightCard label="Avg / day" value={formatAmount(avg, currency)} sub={`${daysElapsed} active day${daysElapsed === 1 ? "" : "s"}`} />

          {/* Daily spending limit (current month + budget set) */}
          {dailyLimit !== null ? (
            <InsightCard
              wide
              label="Daily limit"
              value={`${formatAmount(Math.floor(dailyLimit), currency)}/day`}
              sub={`to stay within budget for the remaining ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            />
          ) : null}

          {/* Month-over-month comparison */}
          <InsightCard
            wide
            label={`vs ${monthLabel(prevMonth)}`}
            value={
              diff === null
                ? "…"
                : diff === 0
                  ? "No change"
                  : `${diff > 0 ? "+" : "−"}${formatAmount(Math.abs(diff), currency)}`
            }
            sub={
              diff === null
                ? undefined
                : `${formatAmount(prevTotal ?? 0, currency)} last month${diff > 0 ? " — spending more" : diff < 0 ? " — saving more" : ""}`
            }
          />

          <InsightCard label="Projected month-end" value={formatAmount(projected, currency)} sub={`vs ${formatAmount(total, currency)} so far`} wide />
        </section>
      </div>
    </div>
  );
}

function InsightCard({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}
