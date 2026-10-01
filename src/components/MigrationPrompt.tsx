import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, Loader2 } from "lucide-react";
import { useDataStore, dismissMigration, startMigration } from "../store/data";
import { countLegacyTransactions } from "../db/migrate";
import { cloudEnabled } from "../db/repo";

/**
 * One-time "Import your local data to the cloud?" prompt shown after the first
 * login when this browser still has IndexedDB data. The upload is idempotent;
 * local data is never deleted, and the prompt never re-appears once done (or
 * dismissed).
 */
export default function MigrationPrompt() {
  const migration = useDataStore((s) => s.migration);
  const booted = useDataStore((s) => s.booted);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (migration.status !== "prompt" || count !== null) return;
    void countLegacyTransactions().then(setCount);
  }, [migration.status, count]);

  if (!cloudEnabled || !booted || migration.status === "idle" || migration.status === "checking") return null;

  const running = migration.status === "running";

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-label="Import local data"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="w-full max-w-[480px] rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] dark:bg-slate-900"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-600" aria-hidden>
              <CloudUpload size={24} />
            </span>
            <div>
              <h2 className="text-lg font-bold">Import your local data to the cloud?</h2>
              <p className="text-sm text-slate-400">One-time setup — takes a moment.</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            We found{" "}
            <strong className="font-semibold">
              {count === null ? "…" : `${count} expense${count === 1 ? "" : "s"}`}
            </strong>{" "}
            stored on this device. Upload everything to your account so it syncs across all your devices.
            Your local copy is kept as a backup.
          </p>

          {migration.error ? (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {migration.error}
            </p>
          ) : null}

          {running ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-medium dark:bg-slate-800" role="status">
              <Loader2 size={16} className="animate-spin text-teal-600" aria-hidden />
              {migration.progress || "Uploading…"} — keep this tab open
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => dismissMigration()}
              disabled={running}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
            >
              Not now
            </button>
            <button
              onClick={() => void startMigration()}
              disabled={running}
              className="flex-1 rounded-2xl bg-teal-600 py-3 text-sm font-bold text-white shadow-md shadow-teal-600/30 active:bg-teal-700 disabled:opacity-60"
            >
              {running ? "Importing…" : "Import to cloud"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
