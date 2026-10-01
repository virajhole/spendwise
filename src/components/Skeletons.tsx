/** Loading skeletons shown while a month/range is being fetched. */

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-3 px-4 pb-4" aria-label="Loading expenses" role="status">
      {Array.from({ length: rows }).map((_, g) => (
        <section key={g} className="mb-3 overflow-hidden">
          <div className="mb-1 h-3 w-20 animate-pulse rounded bg-slate-200 px-1 dark:bg-slate-800" />
          <ul className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
            {Array.from({ length: 2 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-3.5 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <span className="block h-2.5 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
                </span>
                <span className="h-4 w-14 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-3xl bg-white shadow-sm dark:bg-slate-900 ${className}`} aria-hidden />;
}
