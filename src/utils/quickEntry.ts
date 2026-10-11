import type { Category, FinanceDetails } from "../db/types";
import { suggestCategoryName } from "./calc";

export interface ParsedQuickEntry {
  amount: number;
  note: string;
  categoryId: string;
  finance: FinanceDetails;
}

const BANKS: Record<string, string> = {
  sbi: "SBI", hdfc: "HDFC", icici: "ICICI", axis: "Axis", kotak: "Kotak",
  amex: "Amex", hsbc: "HSBC", idfc: "IDFC", yesbank: "YES Bank",
  bob: "Bank of Baroda", onecard: "OneCard",
};
const BANK_PATTERN = "sbi|hdfc|icici|axis|kotak|amex|hsbc|idfc|yesbank|bob|onecard";
const HINGLISH_LOAN = "(?:udh+a+r(?:i)?|loan|lend|lent)";
const PAYMENT_WORDS = new RegExp(`₹|\\b(?:rs\\.?|rupees?|upi|cash|bank|credit|card|cc|debit|via|using|paid|add|in|on|with|se|${BANK_PATTERN})\\b`, "gi");

export function parseQuickEntry(text: string, categories: Category[]): ParsedQuickEntry {
  const amounts = [...text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)];
  if (amounts.length !== 1) throw new Error("Ek amount likho, jaise: chai 15 ya Rini take 300 dinner.");
  if (/[-−]\s*\d/.test(text)) throw new Error("Amount positive hona chahiye.");
  const amount = Number(amounts[0][0].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount zero se zyada likho.");
  const lower = text.toLowerCase();
  if (/\b(split|settle|repay|wapas|return|received|mila|borrow)\b/.test(lower)) throw new Error("Repayment ke liye People section se entry karo.");

  const bankMatch = lower.match(new RegExp(`\\b(${BANK_PATTERN})\\b`));
  const credit = /\b(?:credit(?:\s*card)?|cc)\b/.test(lower);
  if (/\bdebit(?:\s*card)?\b/.test(lower) && credit) throw new Error("Ek entry ke liye ek payment method likho.");
  if (credit && !bankMatch) throw new Error("Credit card ka naam bhi likho, jaise: Rini take 300 dinner add in cc SBI.");
  if (/\bcard\b/.test(lower) && !credit && !/\bdebit\b/.test(lower)) throw new Error("Credit ya debit card likho; credit ke saath bank ka naam bhi.");

  const rawNote = text.replace(amounts[0][0], " ").replace(PAYMENT_WORDS, " ").replace(/\s+/g, " ").trim();
  const owe = rawNote.match(/^(?:(?:mujhe|mujhko|mujko|mereko|main|maine)\s+)?(.+?)\s+ko\s+(?:paise\s+)?(?:dena|dene|deni)(?:\s+(?:hai|hain|he|h))?\s*$/i)
    ?? rawNote.match(/^i\s+owe\s+(.+?)(?:\s+money)?\s*$/i);
  if (owe) {
    const person = owe[1].trim();
    if (person.split(/\s+/).length > 3) throw new Error("Naam clear likho: mujhe Rini ko 299 dene hain.");
    return { amount, note: `You owe · ${person}`, categoryId: "", finance: { kind: "borrowed", person, paymentMethod: paymentMethod(lower), ...(credit && bankMatch ? { cardName: BANKS[bankMatch[1]] } : {}) } };
  }
  const normalizedIntent = rawNote.replace(/\budh+a+r(i)?\b/gi, "udhar$1");
  const isLoan = new RegExp(`\\b${HINGLISH_LOAN}\\b`, "i").test(normalizedIntent)
    || /\b(?:maine|mene|main|meine|i)\b.+\bko\b.{0,50}\b(?:diya|diye|de\s+diye)\b/i.test(normalizedIntent);

  let person = "";
  if (isLoan) {
    const gaveMoney = normalizedIntent.match(/^(?:(?:maine|mene|main|meine|i)\s+)?(.+?)\s+ko\s+(?:paise\s+)?(?:diya|diye|de\s+diye)?\s*(?:udhar(?:i)?|loan|lend|lent)?\s*$/i);
    const personBeforeKo = normalizedIntent.match(/^(?:(?:maine|mene|main|meine|i)\s+)?(.+?)\s+ko\b/i);
    const englishLoan = normalizedIntent.match(/^(?:i\s+)?(?:lent|loaned|gave)\s+(.+?)\s*$/i);
    const loanOrder = normalizedIntent.match(/^(?:(?:maine|mene|main)\s+)?(.+?)\s+(?:ko\s+)?(?:udhar(?:i)?|loan|lent)\s*$/i);
    person = (gaveMoney?.[1] ?? personBeforeKo?.[1] ?? englishLoan?.[1] ?? loanOrder?.[1] ?? "").replace(/\b(?:maine|mene|main|meine|i)\b/gi, "").trim();
    if (!person) throw new Error("Udhaar ka naam aur format likho: Rini ko 400 diye udhhar.");
    if (person.split(/\s+/).length > 3) throw new Error("Udhaar mein ek person's naam likho: Rini ko 400 diye udhhar.");
    const note = `Udhaar · ${person.replace(/\b\p{L}/gu, c => c.toUpperCase())}`;
    return { amount, note, categoryId: "", finance: { kind: "lent", paymentMethod: credit ? "credit" : paymentMethod(lower), ...(credit && bankMatch ? { cardName: BANKS[bankMatch[1]] } : {}), person } };
  }

  // “Rini take 300 dinner” means I paid the restaurant bill and Rini owes
  // the stated share. A named credit card is still the way the bill was paid.
  const takesShare = rawNote.match(/^(.+?)\s+(?:take|takes|owe|owes)\b/i);
  let kind: FinanceDetails["kind"] = "expense";
  let finance: FinanceDetails;
  let note = rawNote;
  if (takesShare) {
    person = takesShare[1].replace(/\b(?:maine|mene|main|i|paid|bill|the|for)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (!person || person.split(/\s+/).length > 3) throw new Error("Friend ka naam clear likho, jaise: Rini take 300 dinner.");
    note = rawNote.slice(takesShare[0].length).replace(/\b(?:bill|expense|add|entry)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (!note) throw new Error("Dinner jaise kharche ka naam bhi likho.");
    kind = "split";
    finance = {
      kind,
      paymentMethod: paymentMethod(lower),
      ...(credit && bankMatch ? { cardName: BANKS[bankMatch[1]] } : {}),
      shares: [
        { id: "me", name: "Me", amount: 0, isMe: true },
        { id: "person-1", name: person, amount },
      ],
    };
  } else {
    note = rawNote.replace(/\b(?:maine|mene|main|meine|i|had|bought|got|ate|paid|spent|spending|add|entry|my|me|the|a|an|for|at|on|from|via|using|through|by)\b/gi, " ").replace(/\s+/g, " ").trim();
    finance = {
      kind,
      paymentMethod: paymentMethod(lower),
      ...(credit && bankMatch ? { cardName: BANKS[bankMatch[1]] } : {}),
    };
  }

  if (!note) throw new Error("Kharche ka naam likho, jaise: dinner 300 UPI.");
  const categoryName = suggestCategoryName(note);
  const category = categories.find(c => c.name.toLowerCase() === (categoryName ?? "Other").toLowerCase());
  if (!categoryName) throw new Error("Category samajh nahi aayi. Kharche ka naam thoda aur clear likho.");
  if (!category) throw new Error("Categories load ho rahi hain. Thodi der baad try karo.");
  return { amount, note, categoryId: category.id, finance };
}

function paymentMethod(text: string): FinanceDetails["paymentMethod"] {
  if (/\b(?:credit|cc)\b/.test(text)) return "credit";
  if (/\bupi\b/.test(text)) return "upi";
  if (/\bcash\b/.test(text)) return "cash";
  if (/\bdebit(?:\s*card)?\b/.test(text)) return "debit";
  if (/\bbank\b/.test(text)) return "bank";
  return "upi";
}
