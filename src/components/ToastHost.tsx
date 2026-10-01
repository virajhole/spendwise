import { AnimatePresence, motion } from "framer-motion";
import { useToasts } from "../store/toast";

/** Global toast host — shows sync errors with a Retry action, offline info, etc. */
export default function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+72px)] z-40 mx-auto flex max-w-[420px] flex-col gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            role="status"
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-xl ${
              t.kind === "error"
                ? "bg-red-600 text-white shadow-red-600/30"
                : t.kind === "success"
                  ? "bg-teal-600 text-white shadow-teal-600/30"
                  : "bg-slate-800 text-white shadow-slate-900/30 dark:bg-slate-700"
            }`}
          >
            <span className="text-sm font-medium">{t.message}</span>
            <span className="flex shrink-0 items-center gap-3">
              {t.action ? (
                <button
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                  className="text-sm font-extrabold tracking-wide underline decoration-2 underline-offset-2"
                >
                  {t.action.label.toUpperCase()}
                </button>
              ) : null}
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
                ✕
              </button>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
