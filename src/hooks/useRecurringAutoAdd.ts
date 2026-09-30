import { useEffect } from "react";
import { db } from "../db/db";
import { applyRecurrings } from "../db/seed";

/** Runs once on app start: auto-adds due recurring expenses. */
export function useRecurringAutoAdd() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recurrings = await db.recurrings.toArray();
      if (!cancelled && recurrings.length) await applyRecurrings(recurrings);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
