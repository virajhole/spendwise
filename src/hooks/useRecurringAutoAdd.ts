import { useEffect } from "react";
import { runRecurringAutoAdd, useDataStore } from "../store/data";

/** Runs whenever the signed-in user's recurring rules load: auto-adds due ones. */
export function useRecurringAutoAdd() {
  const userId = useDataStore((s) => s.userId);
  const recurrings = useDataStore((s) => s.recurrings);

  useEffect(() => {
    if (!userId || !recurrings) return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await runRecurringAutoAdd();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, recurrings]);
}
