import { useContactNumber } from "../hooks/useContactNumber";
import { formatAmount } from "../utils/format";
import type { Balance } from "../utils/finance";

export default function WhatsAppSplitLink({ balance, currency }: { balance: Balance; currency: string }) {
  const { transaction, original, remaining, name } = balance;
  const { number } = useContactNumber(name);
  if (transaction.finance?.kind !== "split") return null;
  const fmt = (amount: number) => formatAmount(amount, currency);
  const message = [
    `Hi ${name}, here's the split for ${transaction.note || "our shared bill"} (${transaction.date}).`,
    `Bill total: ${fmt(transaction.amount)}`,
    `Your share: ${fmt(original)}`,
    remaining === 0 ? "Your share is settled." : `Remaining to pay: ${fmt(remaining)}`,
  ].join("\n");
  return <a className="small-button relative z-10 mt-3 inline-flex items-center min-h-11"
    href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
    Connect on WhatsApp
  </a>;
}
