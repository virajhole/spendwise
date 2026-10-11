import type { Category, FinanceDetails } from "../db/types";
import { suggestCategoryName } from "./calc";

export function parseQuickEntry(text: string, categories: Category[]): { amount: number; note: string; categoryId: string; finance: FinanceDetails } {
  const amounts = [...text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)];
  if (amounts.length !== 1) throw new Error("Use one amount, e.g. chai 15 upi. For split bills, open People.");
  if (/[-−]\s*\d/.test(text)) throw new Error("Enter a positive amount");
  const amount = Number(amounts[0][0].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero");
  const lower = text.toLowerCase();
  if (/\b(split|settle|repay|wapas|return|received|mila|liye|borrow|credit|card)\b/.test(lower)) throw new Error("Use Add details or People for cards, repayments and splits.");
  const paymentMethod = /\bupi\b/.test(lower) ? "upi" : /\bcash\b/.test(lower) ? "cash" : /\bbank\b/.test(lower) ? "bank" : "unknown";
  const note = text.replace(amounts[0][0], "").replace(/₹|\b(rs\.?|rupees|upi|cash|bank)\b/gi, "").replace(/\s+/g, " ").trim();
  const personMatch = note.match(/^(.+?)\s+ko\s+(?:diye|diya|diye hai)\s+udhaar$/i);
  if (/\b(udhaar|udhar|lent|diye|diya)\b/i.test(note) && !personMatch) throw new Error("Try: Arbaz ko 500 diye udhaar, or use People.");
  const categoryName = suggestCategoryName(note);
  const category = categories.find(c => c.name.toLowerCase() === (categoryName ?? "Other").toLowerCase());
  if (!category) throw new Error("Categories are still loading. Try again shortly.");
  if (!note) throw new Error("Add a short description, e.g. chai 15");
  if (!categoryName && !personMatch) throw new Error("Category unclear. Use Add details to choose it.");
  return { amount, note, categoryId: category.id, finance: { kind: personMatch ? "lent" : "expense", paymentMethod, ...(personMatch ? { person: personMatch[1].trim() } : {}) } };
}
