/** Formatting helpers — Indian number format by default. */

export function formatAmount(n: number, currency = "₹", opts: { showDecimals?: boolean } = {}): string {
  const abs = Math.abs(n);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const showDec = opts.showDecimals ?? hasCents;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: showDec ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs);
  return `${n < 0 ? "-" : ""}${currency}${formatted}`;
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function currentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
