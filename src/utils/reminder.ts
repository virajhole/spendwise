const KEY = "spendwise.reminder";
const LAST_KEY = "spendwise.reminder.last";

export interface ReminderPref {
  on: boolean;
  hour: number; // 0-23
}

export function getReminder(): ReminderPref {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ReminderPref;
  } catch { /* ignore */ }
  return { on: false, hour: 20 };
}

export async function setReminder(pref: ReminderPref): Promise<void> {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch { /* ignore */ }
  if (pref.on && "Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch { /* ignore */ }
  }
  checkReminder();
}

/**
 * Fire today's reminder if it's due. Called on app open — a PWA can't push on
 * a schedule without a server, so this nudges whenever the app is first
 * opened after the chosen hour.
 */
export function checkReminder(): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const pref = getReminder();
  if (!pref.on) return;
  const now = new Date();
  if (now.getHours() < pref.hour) return;
  try {
    const today = now.toDateString();
    if (localStorage.getItem(LAST_KEY) === today) return;
    localStorage.setItem(LAST_KEY, today);
    new Notification("SpendWise", {
      body: "Don't forget to log today's expenses 📝",
      icon: "/icons/icon-192.png",
      tag: "spendwise-daily",
    });
  } catch { /* ignore */ }
}
