import { describe, expect, it } from "vitest";
import { formatAmount } from "./format";

describe("formatAmount", () => {
  it("uses Indian digit grouping", () => {
    expect(formatAmount(123456)).toBe("₹1,23,456");
    expect(formatAmount(1234567)).toBe("₹12,34,567");
  });
  it("handles small numbers and decimals", () => {
    expect(formatAmount(80)).toBe("₹80");
    expect(formatAmount(45.5)).toBe("₹45.50");
  });
  it("prefixes negative sign", () => {
    expect(formatAmount(-1200)).toBe("-₹1,200");
  });
  it("supports other currencies", () => {
    expect(formatAmount(1000, "$")).toBe("$1,000");
  });
});
