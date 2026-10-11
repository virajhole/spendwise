import { describe, expect, it, vi } from "vitest";
import { llmResultToTransactionInput, parseWithLLM } from "./llmParse";
import { personalAmount } from "./finance";
import * as repo from "../db/repo";
import type { Category, LLMParseResult } from "../db/types";

const mockCategories: Category[] = [
  { id: "cat-food", name: "Food", icon: "🍔", color: "#f97316" },
  { id: "cat-travel", name: "Transport", icon: "🚌", color: "#3b82f6" },
  { id: "cat-shopping", name: "Shopping", icon: "🛍️", color: "#ec4899" },
  { id: "cat-other", name: "Other", icon: "📦", color: "#64748b" },
];

describe("llmResultToTransactionInput", () => {
  it("maps a plain expense and defaults paymentMethod to upi", () => {
    const raw: LLMParseResult = {
      kind: "expense",
      amount: 150,
      person: null,
      note: "Lunch with team",
      categoryId: "cat-food",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.95,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    expect(input.amount).toBe(150);
    expect(input.note).toBe("Lunch with team");
    expect(input.categoryId).toBe("cat-food");
    expect(input.date).toBe("2026-10-11");
    expect(input.finance.kind).toBe("expense");
    expect(input.finance.paymentMethod).toBe("upi");
    expect(personalAmount(input)).toBe(150);
  });

  it("maps credit card expense with cardName", () => {
    const raw: LLMParseResult = {
      kind: "expense",
      amount: 350,
      person: null,
      note: "Zomato dinner",
      categoryId: "cat-food",
      paymentMethod: "credit",
      cardName: "SBI",
      direction: null,
      shares: null,
      date: "2026-10-10",
      confidence: 0.95,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    expect(input.amount).toBe(350);
    expect(input.finance.paymentMethod).toBe("credit");
    expect(input.finance.cardName).toBe("SBI");
  });

  it("maps lent transaction: zero personal spending, empty categoryId", () => {
    const raw: LLMParseResult = {
      kind: "lent",
      amount: 200,
      person: "Arbaz",
      note: "D-Mart shopping",
      categoryId: "cat-shopping",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.85,
      ambiguous: true,
      alternatives: [
        {
          kind: "split",
          label: "Split: Arbaz owes ₹200",
          shares: [
            { name: "Me", amount: 0, isMe: true },
            { name: "Arbaz", amount: 200, isMe: false },
          ],
        },
      ],
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    expect(input.amount).toBe(200);
    expect(input.finance.kind).toBe("lent");
    expect(input.finance.person).toBe("Arbaz");
    expect(input.categoryId).toBe(""); // loans do not have category expenses
    expect(personalAmount(input)).toBe(0);
  });

  it("maps borrowed transaction: zero personal spending", () => {
    const raw: LLMParseResult = {
      kind: "borrowed",
      amount: 500,
      person: "Rini",
      note: "Urgent cash",
      categoryId: null,
      paymentMethod: "cash",
      cardName: null,
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.9,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    expect(input.amount).toBe(500);
    expect(input.finance.kind).toBe("borrowed");
    expect(input.finance.person).toBe("Rini");
    expect(input.finance.paymentMethod).toBe("cash");
    expect(personalAmount(input)).toBe(0);
  });

  it("maps split bills with exact paise conservation when LLM omitted Me", () => {
    const raw: LLMParseResult = {
      kind: "split",
      amount: 1000,
      person: null,
      note: "Team dinner",
      categoryId: "cat-food",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: [
        { name: "Viraj", amount: 333.33, isMe: false },
        { name: "Kishon", amount: 333.33, isMe: false },
      ],
      date: "2026-10-11",
      confidence: 0.9,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    expect(input.finance.kind).toBe("split");
    expect(input.finance.shares).toBeDefined();
    expect(input.finance.shares?.length).toBe(3);

    const meShare = input.finance.shares?.find((s) => s.isMe);
    expect(meShare).toBeDefined();
    expect(meShare?.amount).toBe(333.34); // 1000 - 666.66 = 333.34 exactly

    const totalShares = input.finance.shares?.reduce((sum, s) => sum + s.amount, 0);
    expect(Math.round(totalShares! * 100)).toBe(100000);
    expect(personalAmount(input)).toBe(333.34);
  });

  it("maps split bills when Me share is already present but needs adjustment", () => {
    const raw: LLMParseResult = {
      kind: "split",
      amount: 500,
      person: null,
      note: "Groceries",
      categoryId: "cat-shopping",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: [
        { name: "Me", amount: 200, isMe: true },
        { name: "Roommate", amount: 250, isMe: false },
      ],
      date: "2026-10-11",
      confidence: 0.9,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    const meShare = input.finance.shares?.find((s) => s.isMe);
    // Adjusted from 200 to 250 so sum = 500
    expect(meShare?.amount).toBe(250);
    expect(personalAmount(input)).toBe(250);
  });

  it("maps settlement transaction with settlesId", () => {
    const raw: LLMParseResult = {
      kind: "settlement",
      amount: 200,
      person: "Arbaz",
      note: "Repayment",
      categoryId: null,
      paymentMethod: "upi",
      cardName: null,
      direction: "in",
      shares: null,
      date: "2026-10-11",
      confidence: 0.9,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories, {
      settlesId: "tx-parent-123",
    });
    expect(input.finance.kind).toBe("settlement");
    expect(input.finance.settlesId).toBe("tx-parent-123");
    expect(input.finance.direction).toBe("in");
    expect(personalAmount(input)).toBe(0);
  });

  it("maps card_payment and prevents funding by credit card", () => {
    const raw: LLMParseResult = {
      kind: "card_payment",
      amount: 4500,
      person: null,
      note: "Card bill payment",
      categoryId: null,
      paymentMethod: "credit", // Invalid funding method; should be replaced
      cardName: "HDFC",
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.95,
      ambiguous: false,
    };

    const input = llmResultToTransactionInput(raw, mockCategories);
    expect(input.finance.kind).toBe("card_payment");
    expect(input.finance.cardName).toBe("HDFC");
    expect(input.finance.paymentMethod).toBe("bank");
    expect(personalAmount(input)).toBe(0);
  });

  it("throws for negative amount", () => {
    const raw: LLMParseResult = {
      kind: "expense",
      amount: -50,
      person: null,
      note: "Negative",
      categoryId: "cat-food",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.5,
      ambiguous: false,
    };

    expect(() => llmResultToTransactionInput(raw, mockCategories)).toThrow(
      "Amount must be greater than 0",
    );
  });

  it("throws for missing card name on credit expense", () => {
    const raw: LLMParseResult = {
      kind: "expense",
      amount: 100,
      person: null,
      note: "Credit purchase",
      categoryId: "cat-food",
      paymentMethod: "credit",
      cardName: "",
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.9,
      ambiguous: false,
    };

    expect(() => llmResultToTransactionInput(raw, mockCategories)).toThrow("Enter a card name");
  });

  it("throws if split shares exceed total amount", () => {
    const raw: LLMParseResult = {
      kind: "split",
      amount: 100,
      person: null,
      note: "Over split",
      categoryId: "cat-food",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: [
        { name: "Alice", amount: 70, isMe: false },
        { name: "Bob", amount: 50, isMe: false },
      ],
      date: "2026-10-11",
      confidence: 0.9,
      ambiguous: false,
    };

    expect(() => llmResultToTransactionInput(raw, mockCategories)).toThrow(
      "Split shares exceed total bill amount",
    );
  });
});

describe("parseWithLLM", () => {
  it("delegates to repo.parseEntryWithLLM without hitting real network", async () => {
    const mockOutput: LLMParseResult = {
      kind: "lent",
      amount: 200,
      person: "Arbaz",
      note: "D-Mart shopping",
      categoryId: "cat-shopping",
      paymentMethod: "upi",
      cardName: null,
      direction: null,
      shares: null,
      date: "2026-10-11",
      confidence: 0.85,
      ambiguous: true,
      alternatives: [
        {
          kind: "split",
          label: "Split: Arbaz owes ₹200",
        },
      ],
    };

    const spy = vi.spyOn(repo, "parseEntryWithLLM").mockResolvedValueOnce(mockOutput);

    const result = await parseWithLLM("arbaz se mujhe 200rs lene hai D mart ki shopping k", {
      categories: mockCategories,
      contacts: ["Arbaz", "Rini"],
      today: "2026-10-11",
      cards: ["SBI"],
    });

    expect(spy).toHaveBeenCalledWith(
      "arbaz se mujhe 200rs lene hai D mart ki shopping k",
      expect.objectContaining({
        categories: mockCategories,
        contacts: ["Arbaz", "Rini"],
        today: "2026-10-11",
      }),
    );
    expect(result.amount).toBe(200);
    expect(result.person).toBe("Arbaz");
    expect(result.ambiguous).toBe(true);
  });
});

