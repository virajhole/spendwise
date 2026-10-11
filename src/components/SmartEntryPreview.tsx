import { useMemo, useState } from "react";
import { Sparkles, UserPlus, Info } from "lucide-react";
import type { Category, LLMParseResult, PaymentMethod } from "../db/types";
import { contactKey } from "../utils/contacts";
import { formatAmount } from "../utils/format";
import { PAYMENT_LABELS } from "../utils/finance";
import { llmResultToTransactionInput, type ParsedTransactionInput } from "../utils/llmParse";
import Sheet from "./Sheet";

interface Props {
  result: LLMParseResult;
  categories: Category[];
  currency: string;
  contacts: string[];
  onConfirm: (input: ParsedTransactionInput) => void;
  onEditFull: (input: ParsedTransactionInput) => void;
  onCancel: () => void;
}

export default function SmartEntryPreview({
  result,
  categories,
  currency,
  contacts,
  onConfirm,
  onEditFull,
  onCancel,
}: Props) {
  // Option index: 0 is primary, 1..N are alternatives
  const [optionIndex, setOptionIndex] = useState(0);

  // Active parse result based on selected option
  const activeResult = useMemo<LLMParseResult>(() => {
    if (optionIndex === 0 || !result.alternatives || !result.alternatives[optionIndex - 1]) {
      return result;
    }
    const alt = result.alternatives[optionIndex - 1];
    return {
      ...result,
      kind: alt.kind,
      shares: alt.shares ?? (alt.kind === "split" ? result.shares : null),
    };
  }, [result, optionIndex]);

  // Modifiable local state for preview
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (activeResult.categoryId && categories.some((c) => c.id === activeResult.categoryId)) {
      return activeResult.categoryId;
    }
    return categories[0]?.id || "";
  });
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    activeResult.paymentMethod || "upi",
  );
  const [selectedCardName, setSelectedCardName] = useState(activeResult.cardName || "");
  const [selectedDate, setSelectedDate] = useState(
    activeResult.date && /^\d{4}-\d{2}-\d{2}$/.test(activeResult.date)
      ? activeResult.date
      : new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState(activeResult.note || "");

  const person = (activeResult.person || "").trim();
  const isNewContact = useMemo(() => {
    if (!person) return false;
    const key = contactKey(person);
    return !contacts.some((c) => contactKey(c) === key);
  }, [person, contacts]);

  // Build the current transaction input object
  const currentInput = useMemo<ParsedTransactionInput | null>(() => {
    try {
      const merged: LLMParseResult = {
        ...activeResult,
        note,
        categoryId: selectedCategory,
        paymentMethod: selectedMethod,
        cardName: selectedCardName,
        date: selectedDate,
      };
      return llmResultToTransactionInput(merged, categories);
    } catch {
      return null;
    }
  }, [activeResult, note, selectedCategory, selectedMethod, selectedCardName, selectedDate, categories]);

  const kindBadge = useMemo(() => {
    switch (activeResult.kind) {
      case "lent":
        return { label: "Udhaar diya (Lent)", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" };
      case "borrowed":
        return { label: "Udhaar liya (Borrowed)", color: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" };
      case "split":
        return { label: "Split bill", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" };
      case "settlement":
        return { label: "Settlement", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
      case "card_payment":
        return { label: "Credit card payment", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30" };
      default:
        return { label: "Personal expense", color: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30" };
    }
  }, [activeResult.kind]);

  const handleConfirm = () => {
    if (currentInput) {
      onConfirm(currentInput);
    }
  };

  const handleEdit = () => {
    if (currentInput) {
      onEditFull(currentInput);
    }
  };

  return (
    <Sheet title="AI Smart Entry" onClose={onCancel}>
      <div className="space-y-4">
        {/* Ambiguity Toggle if present */}
        {result.ambiguous && result.alternatives && result.alternatives.length > 0 && (
          <div className="rounded-2xl border border-teal-600/20 bg-teal-50/50 p-3 dark:border-teal-400/20 dark:bg-teal-950/20">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-teal-800 dark:text-teal-300">
              <Sparkles size={14} /> Did you mean?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOptionIndex(0)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                  optionIndex === 0
                    ? "bg-teal-600 text-white shadow"
                    : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {result.kind === "lent" && person ? `Lent to ${person}` : `Option 1 (${result.kind})`}
              </button>
              {result.alternatives.map((alt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setOptionIndex(idx + 1)}
                  className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                    optionIndex === idx + 1
                      ? "bg-teal-600 text-white shadow"
                      : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {alt.label || `Option ${idx + 2} (${alt.kind})`}
                </button>
              ))}
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Info size={13} className="shrink-0 mt-0.5" />
              {activeResult.kind === "lent" && "Lent = not counted in your monthly spending (it's a debt to receive)."}
              {activeResult.kind === "split" && "Split = only your personal share counts in your spending."}
              {activeResult.kind === "borrowed" && "Borrowed = money you owe, not an expense."}
              {activeResult.kind === "expense" && "Expense = counts towards your monthly budget."}
            </p>
          </div>
        )}

        {/* Amount & Type Badge */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {formatAmount(activeResult.amount, currency)}
            </div>
            {person && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>With: <strong>{person}</strong></span>
                {isNewContact && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-500/10 px-1.5 py-0.2 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                    <UserPlus size={10} /> New contact
                  </span>
                )}
              </div>
            )}
          </div>
          <span className={`rounded-xl border px-2.5 py-1 text-xs font-bold ${kindBadge.color}`}>
            {kindBadge.label}
          </span>
        </div>

        {/* Note input */}
        <label className="field-label">
          What was it for?
          <input
            className="field"
            value={note}
            maxLength={80}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Description..."
          />
        </label>

        {/* Category (if expense or split) */}
        {(activeResult.kind === "expense" || activeResult.kind === "split") && (
          <label className="field-label">
            Category
            <select
              className="field"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Payment Method */}
        <div className="grid grid-cols-2 gap-2">
          <label className="field-label">
            Payment method
            <select
              className="field"
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Date
            <input
              type="date"
              className="field"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>
        </div>

        {/* Card Name if credit or card_payment */}
        {(selectedMethod === "credit" || activeResult.kind === "card_payment") && (
          <label className="field-label">
            Card name
            <input
              className="field"
              placeholder="e.g. SBI, HDFC"
              maxLength={60}
              value={selectedCardName}
              onChange={(e) => setSelectedCardName(e.target.value)}
            />
          </label>
        )}

        {/* Split participants summary */}
        {activeResult.kind === "split" && activeResult.shares && (
          <div className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-800">
            <span className="font-bold text-slate-600 dark:text-slate-300">Participants:</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {activeResult.shares.map((s, idx) => (
                <span key={idx} className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">
                  {s.isMe ? "You" : s.name}: {formatAmount(s.amount, currency)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col gap-2">
          <button
            type="button"
            className="primary-button w-full"
            disabled={!currentInput}
            onClick={handleConfirm}
          >
            Confirm & Save
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="secondary-button flex-1"
              onClick={handleEdit}
            >
              Edit in full form
            </button>
            <button
              type="button"
              className="icon-button flex-1 justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

