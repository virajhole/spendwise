import { useState } from "react";
import { useContactNumber } from "../hooks/useContactNumber";
import type { PersonContact } from "../utils/contacts";
import { formatAmount } from "../utils/format";

export default function ContactWhatsApp({ person, currency }: { person: PersonContact; currency: string }) {
  const { number, save } = useContactNumber(person.name);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const amount = formatAmount(Math.abs(person.net), currency);
  const summary = person.net > 0 ? `You owe me ${amount}.` : person.net < 0 ? `I owe you ${amount}.` : "We're settled up.";
  return <div className="surface p-4 space-y-2">
    <form onSubmit={e => {
      e.preventDefault();
      try { save(draft ?? number); setDraft(null); setError(""); }
      catch (err) { setError(err instanceof Error ? err.message : "Couldn't save number."); }
    }}>
      <label className="field-label">WhatsApp number (with country code)
        <input className="field" type="tel" placeholder="+91 98765 43210" value={draft ?? (number ? "+" + number : "")} onChange={e => { setDraft(e.target.value); setError(""); }} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {draft !== null && <button className="small-button mt-2">Save number</button>}
    </form>
    {number && draft === null && <a className="small-button inline-flex min-h-11 items-center" target="_blank" rel="noopener noreferrer"
      href={`https://wa.me/${number}?text=${encodeURIComponent(`Hi ${person.name}, here's our balance summary. ${summary}`)}`}>Connect on WhatsApp</a>}
  </div>;
}
