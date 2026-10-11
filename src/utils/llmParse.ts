import type {
  Category,
  FinanceDetails,
  LLMParseContext,
  LLMParseResult,
  PaymentMethod,
  SplitShare,
} from "../db/types";
import { parseEntryWithLLM } from "../db/repo";
import { money, validateFinance } from "./finance";
import { validateExpenseInput } from "../db/types";
import { currentTime, todayISO } from "./format";
import { suggestCategoryName } from "./calc";

export interface ParsedTransactionInput {
  amount: number;
  note: string;
  categoryId: string;
  date: string;
  time: string;
  finance: FinanceDetails;
}

export interface ParseOptions {
  settlesId?: string;
  settlesShareId?: string;
  matchedBalance?: { transaction: { id: string }; shareId?: string };
}

/**
 * Invoke the Edge Function via the repository facade.
 */
export async function parseWithLLM(text: string, ctx: LLMParseContext): Promise<LLMParseResult> {
  return parseEntryWithLLM(text, ctx);
}

/**
 * Map LLM output to SpendWise Transaction input and FinanceDetails.
 * Validates with validateExpenseInput and validateFinance.
 */
export function llmResultToTransactionInput(
  result: LLMParseResult,
  categories: Category[],
  options?: ParseOptions,
): ParsedTransactionInput {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid response from AI parser.");
  }

  const amount = money(Number(result.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  // Clean note
  let note = (result.note || "").trim().slice(0, 80);

  // Default payment method
  let paymentMethod: PaymentMethod = result.paymentMethod || "upi";
  if (paymentMethod === "unknown") {
    paymentMethod = "upi";
  }

  const kind = result.kind || "expense";
  const person = (result.person || "").trim();

  // If no note provided, generate a sensible default based on kind
  if (!note) {
    if (kind === "lent" && person) note = `Udhaar · ${person}`;
    else if (kind === "borrowed" && person) note = `You owe · ${person}`;
    else if (kind === "card_payment" && result.cardName) note = `Card payment · ${result.cardName}`;
    else if (kind === "settlement" && person) note = `Settlement · ${person}`;
    else note = "Expense";
  }

  // Category resolution:
  // For lent, borrowed, settlement, card_payment -> categoryId is empty string.
  // For expense and split -> categoryId must belong to categories.
  let categoryId = "";
  if (kind === "expense" || kind === "split") {
    if (result.categoryId && categories.some((c) => c.id === result.categoryId)) {
      categoryId = result.categoryId;
    } else {
      const suggestedName = suggestCategoryName(note);
      const matched =
        categories.find((c) => c.name.toLowerCase() === suggestedName?.toLowerCase()) ??
        categories.find((c) => c.name.toLowerCase() === "other") ??
        categories[0];
      categoryId = matched ? matched.id : "";
    }
  }

  const date = result.date && /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : todayISO();
  const time = currentTime();

  const cardName = (result.cardName || "").trim();

  let finance: FinanceDetails;

  if (kind === "lent" || kind === "borrowed") {
    if (!person) {
      throw new Error(`Person name is required for ${kind === "lent" ? "lending" : "borrowing"}.`);
    }
    finance = {
      kind,
      paymentMethod,
      person,
      ...(paymentMethod === "credit" && cardName ? { cardName } : {}),
    };
  } else if (kind === "card_payment") {
    if (!cardName) {
      throw new Error("Card name is required for credit card payment.");
    }
    // Card payments cannot be funded via credit or unknown
    const fundingMethod = paymentMethod === "credit" ? "bank" : paymentMethod;
    finance = {
      kind: "card_payment",
      paymentMethod: fundingMethod,
      cardName,
    };
  } else if (kind === "settlement") {
    if (!person) {
      throw new Error("Person is required for settlement.");
    }
    const settlesId =
      (result as { settlesId?: string }).settlesId ||
      options?.settlesId ||
      options?.matchedBalance?.transaction.id ||
      "";
    const settlesShareId =
      (result as { settlesShareId?: string }).settlesShareId ||
      options?.settlesShareId ||
      options?.matchedBalance?.shareId;
    const direction = result.direction || "in";

    finance = {
      kind: "settlement",
      paymentMethod,
      person,
      direction,
      settlesId,
      ...(settlesShareId ? { settlesShareId } : {}),
    };
  } else if (kind === "split") {
    let shares: SplitShare[];
    if (Array.isArray(result.shares) && result.shares.length > 0) {
      const rawShares = result.shares;
      const meIndex = rawShares.findIndex((s) => s.isMe || /^(me|myself|self|i)$/i.test(s.name.trim()));

      if (meIndex >= 0) {
        // User share is present
        const others = rawShares.filter((_, idx) => idx !== meIndex);
        const otherTotal = money(others.reduce((sum, s) => sum + money(Number(s.amount) || 0), 0));
        const myAmount = money(amount - otherTotal);
        if (myAmount < 0) {
          throw new Error("Split shares exceed total bill amount.");
        }

        shares = [
          { id: "me", name: "Me", amount: myAmount, isMe: true },
          ...others.map((s, idx) => ({
            id: String(idx + 1),
            name: s.name.trim(),
            amount: money(Number(s.amount) || 0),
            isMe: false,
          })),
        ];
      } else {
        // LLM omitted "Me", so all provided shares are participants
        const otherTotal = money(rawShares.reduce((sum, s) => sum + money(Number(s.amount) || 0), 0));
        const myAmount = money(amount - otherTotal);
        if (myAmount < 0) {
          throw new Error("Split shares exceed total bill amount.");
        }

        shares = [
          { id: "me", name: "Me", amount: myAmount, isMe: true },
          ...rawShares.map((s, idx) => ({
            id: String(idx + 1),
            name: s.name.trim(),
            amount: money(Number(s.amount) || 0),
            isMe: false,
          })),
        ];
      }
    } else if (person) {
      // Split between Me and stated Person
      shares = [
        { id: "me", name: "Me", amount: 0, isMe: true },
        { id: "1", name: person, amount, isMe: false },
      ];
    } else {
      throw new Error("Split bills require participants.");
    }

    finance = {
      kind: "split",
      paymentMethod,
      ...(paymentMethod === "credit" && cardName ? { cardName } : {}),
      shares,
    };
  } else {
    // Plain expense
    finance = {
      kind: "expense",
      paymentMethod,
      ...(paymentMethod === "credit" && cardName ? { cardName } : {}),
    };
  }

  // Validate ledger constraints
  validateExpenseInput({ amount, note });
  validateFinance(amount, finance);

  return {
    amount,
    note,
    categoryId,
    date,
    time,
    finance,
  };
}
