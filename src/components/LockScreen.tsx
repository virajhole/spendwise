import { useState } from "react";
import { Lock } from "lucide-react";
import { getStoredPin } from "../hooks/useAppLock";

export default function LockScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState(false);
  const pin = getStoredPin() ?? "";

  if (unlocked) return null;

  const press = (k: string) => {
    if (k === "back") {
      setEntry((e) => e.slice(0, -1));
      return;
    }
    const next = (entry + k).slice(0, 8);
    setEntry(next);
    if (next.length >= pin.length) {
      if (next === pin) setUnlocked(true);
      else {
        setError(true);
        setTimeout(() => {
          setEntry("");
          setError(false);
        }, 600);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-100 dark:bg-[#0f1115]" role="dialog" aria-label="App locked">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600/10 text-teal-600">
        <Lock size={28} aria-hidden />
      </div>
      <p className="font-semibold">Enter PIN</p>
      <div className={`flex gap-2 ${error ? "text-red-500" : ""}`} aria-label="PIN entry">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < entry.length ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(k)}
              className="h-16 w-16 rounded-2xl bg-white text-xl font-semibold shadow-sm dark:bg-slate-900"
            >
              {k === "back" ? "⌫" : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
