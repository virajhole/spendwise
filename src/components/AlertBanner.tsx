import { AlertTriangle, CircleX } from "lucide-react";

interface Props {
  pct: number;
  over: boolean;
}

export default function AlertBanner({ pct, over }: Props) {
  if (!over && pct < 80) return null;
  const danger = over || pct >= 100;
  return (
    <div
      role="alert"
      className={`mx-4 mt-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium ${
        danger ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300" : "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
      }`}
    >
      {danger ? <CircleX size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
      {danger ? "You've exceeded your monthly budget!" : `Heads up — you've used ${Math.round(pct)}% of your budget.`}
    </div>
  );
}
