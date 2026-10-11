import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, Sparkles } from "lucide-react";
import { useCategories, useTransactions, saveExpense, deleteExpense } from "../store/data";
import { useStore } from "../store/store";
import { pushToast } from "../store/toast";
import { currentTime, formatAmount, todayISO } from "../utils/format";
import { parseQuickEntry } from "../utils/quickEntry";
import { suggestCategoryName } from "../utils/calc";
import { personContacts } from "../utils/contacts";
import { parseWithLLM, llmResultToTransactionInput, type ParsedTransactionInput } from "../utils/llmParse";
import { cloudEnabled } from "../db/repo";
import type { FinanceDetails, LLMParseResult } from "../db/types";
import Sheet from "./Sheet";
import PaymentFields from "./PaymentFields";
import SmartEntryPreview from "./SmartEntryPreview";

export default function QuickEntry() {
  const categories = useCategories();
  const allTransactions = useTransactions();
  const currency = useStore(s => s.currency);
  const setMonth = useStore(s => s.setMonth);
  const smartEntryEnabled = useStore(s => s.smartEntryEnabled);
  const setSmartEntryEnabled = useStore(s => s.setSmartEntryEnabled);

  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const saving = useRef(false);

  // Manual detailed sheet state
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("");
  const manualCategory = useRef(false);
  const [finance, setFinance] = useState<FinanceDetails>({ kind: "expense", paymentMethod: "upi" });

  // AI Smart Entry Preview state
  const [previewResult, setPreviewResult] = useState<LLMParseResult | null>(null);

  // Extract known contacts and cards for LLM context
  const contacts = useMemo(() => {
    return (allTransactions ? personContacts(allTransactions) : []).map(c => c.name);
  }, [allTransactions]);

  const cards = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTransactions ?? []) {
      if (t.finance?.cardName) set.add(t.finance.cardName);
    }
    return Array.from(set);
  }, [allTransactions]);

  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);
  const canUseLLM = cloudEnabled && isOnline && smartEntryEnabled;

  const handleSuccessfulSave = (saved: { id: string; amount: number; note: string; date: string; finance?: FinanceDetails }) => {
    setMonth(saved.date.slice(0, 7));
    setText("");
    setAmount("");
    setNote("");
    setCategoryId("");
    manualCategory.current = false;
    setOpen(false);
    setPreviewResult(null);
    pushToast({
      kind: "success",
      message: `${saved.finance?.kind === "lent" ? "Udhaar" : saved.note || "Expense"} · ${formatAmount(saved.amount, currency)} saved`,
      action: {
        label: "Undo",
        run: () => {
          void deleteExpense(saved.id);
        },
      },
    });
  };

  const saveDetailed = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const input = {
        amount: Number(amount),
        note: note.trim(),
        categoryId: categoryId || categories[0]?.id || "",
        finance,
        date,
        time: currentTime(),
      };
      const saved = await saveExpense(input);
      if (!saved) {
        setError("Entry wasn't saved. Check the amount and payment details, then try again.");
        return;
      }
      handleSuccessfulSave(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const handleQuickSubmit = async (inputText: string) => {
    const raw = inputText.trim();
    if (!raw || saving.current || busy) return;

    saving.current = true;
    setBusy(true);
    setError("");

    // Step 1: Run EXISTING local rule parser
    try {
      const parsed = parseQuickEntry(raw, categories);
      const saved = await saveExpense({
        ...parsed,
        date: todayISO(),
        time: currentTime(),
      });
      if (!saved) {
        setError("Entry wasn't saved. Check the amount and payment details, then try again.");
        saving.current = false;
        setBusy(false);
        return;
      }
      handleSuccessfulSave(saved);
      saving.current = false;
      setBusy(false);
      return;
    } catch (ruleError) {
      // Step 2: Rule parser failed. Check if LLM fallback is eligible.
      if (!canUseLLM) {
        setError(ruleError instanceof Error ? ruleError.message : "Couldn't understand entry.");
        saving.current = false;
        setBusy(false);
        return;
      }

      // Step 3: Call LLM via Supabase Edge Function with a 12s timeout
      setLoadingText("Samajh raha hu...");

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("Timeout: Samajhne mein thoda zyada waqt lag gaya."));
          });
        });

        const parsePromise = parseWithLLM(raw, {
          categories,
          contacts,
          today: todayISO(),
          cards,
        });

        const llmResult = await Promise.race([parsePromise, timeoutPromise]);
        clearTimeout(timeoutId);

        // Validate LLM output on client
        const parsedTx = llmResultToTransactionInput(llmResult, categories);

        // Auto-save without preview ONLY when confidence >= 0.9, not ambiguous, and kind is plain expense
        if (
          (llmResult.confidence ?? 1) >= 0.9 &&
          !llmResult.ambiguous &&
          llmResult.kind === "expense"
        ) {
          const saved = await saveExpense(parsedTx);
          if (!saved) {
            setError("Entry wasn't saved. Check the amount and payment details, then try again.");
            return;
          }
          handleSuccessfulSave(saved);
        } else {
          // Show Preview Card
          setPreviewResult(llmResult);
        }
      } catch (llmErr) {
        clearTimeout(timeoutId);
        // Fall back to rule error or LLM error
        setError(
          llmErr instanceof Error
            ? llmErr.message
            : ruleError instanceof Error
              ? ruleError.message
              : "Couldn't understand entry.",
        );
      } finally {
        setLoadingText("");
        saving.current = false;
        setBusy(false);
      }
    }
  };

  const handlePreviewConfirm = async (input: ParsedTransactionInput) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const saved = await saveExpense(input);
      if (saved) {
        handleSuccessfulSave(saved);
      } else {
        setError("Could not save transaction.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const handlePreviewEditFull = (input: ParsedTransactionInput) => {
    setPreviewResult(null);
    setAmount(String(input.amount));
    setNote(input.note);
    setCategoryId(input.categoryId);
    setFinance(input.finance);
    setDate(input.date);
    manualCategory.current = true;
    setOpen(true);
  };

  return (
    <>
      <div className="quick-dock">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
            <Sparkles size={14} className="shrink-0" />
            <span className="truncate">Quick entry</span>
          </span>
          {cloudEnabled ? (
            <button
              type="button"
              role="switch"
              aria-checked={smartEntryEnabled}
              aria-label="AI parsing"
              onClick={() => setSmartEntryEnabled(!smartEntryEnabled)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616] ${
                smartEntryEnabled
                  ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-300"
                  : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <span>AI</span>
              <span className="min-w-5 text-left">{smartEntryEnabled ? "On" : "Off"}</span>
              <span className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${smartEntryEnabled ? "bg-teal-600" : "bg-slate-400 dark:bg-slate-600"}`}>
                <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${smartEntryEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>
          ) : (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Local mode
            </span>
          )}
        </div>
        {cloudEnabled && !isOnline && (
          <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">Offline now — using local parsing. Saved data will sync when you reconnect.</p>
        )}

        <form
          className="flex items-center gap-2"
          onSubmit={e => {
            e.preventDefault();
            void handleQuickSubmit(text);
          }}
        >
          <button
            className="icon-button shrink-0"
            type="button"
            aria-label="Add details"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <Plus size={22} />
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent py-3 outline-none"
            aria-label="Quick expense"
            placeholder="Type an expense, split, or loan"
            maxLength={200}
            value={text}
            disabled={busy}
            onChange={e => {
              setText(e.target.value);
              setError("");
            }}
          />
          <button
            className="send-button"
            aria-label="Send expense"
            disabled={busy || !text.trim()}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={21} />}
          </button>
        </form>

        {loadingText && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400">
            <Loader2 size={12} className="animate-spin" />
            <span>{loadingText}</span>
          </div>
        )}

        {error && !open && !previewResult && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* Manual Full Add Sheet */}
      {open && (
        <Sheet
          title="Add an expense"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              void saveDetailed();
            }}
          >
            <label className="field-label">
              Amount ({currency})
              <input
                autoFocus
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                className="field amount-field"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="field-label">
              What was it for?
              <input
                className="field"
                maxLength={200}
                value={note}
                onChange={e => {
                  setNote(e.target.value);
                  if (!manualCategory.current) {
                    const suggested = suggestCategoryName(e.target.value);
                    setCategoryId(
                      categories.find(c => c.name === suggested)?.id ??
                        categories.find(c => c.name === "Other")?.id ??
                        "",
                    );
                  }
                }}
                placeholder="Coffee, groceries, a little treat…"
              />
            </label>
            <label className="field-label">
              Category
              <select
                className="field"
                value={categoryId || categories[0]?.id || ""}
                onChange={e => {
                  setCategoryId(e.target.value);
                  manualCategory.current = true;
                }}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <PaymentFields value={finance} onChange={setFinance} />
            <label className="field-label">
              Date
              <input
                required
                type="date"
                className="field"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              className="primary-button w-full"
              disabled={busy || !categories.length}
            >
              {busy ? "Saving…" : "Save expense"}
            </button>
          </form>
        </Sheet>
      )}

      {/* AI Smart Entry Preview Card */}
      {previewResult && (
        <SmartEntryPreview
          result={previewResult}
          categories={categories}
          currency={currency}
          contacts={contacts}
          onConfirm={handlePreviewConfirm}
          onEditFull={handlePreviewEditFull}
          onCancel={() => setPreviewResult(null)}
        />
      )}
    </>
  );
}
