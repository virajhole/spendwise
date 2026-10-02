import { describe, expect, it, vi, beforeEach } from "vitest";
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import InputPad from "../InputPad";
import EditDialog from "../EditDialog";
import SummaryCard from "../SummaryCard";
import { DEFAULT_CATEGORIES, type Transaction } from "../../db/types";
import { useStore } from "../../store/store";

const cats = DEFAULT_CATEGORIES;

describe("InputPad", () => {
  const base = {
    categories: cats,
    currency: "₹",
    collapsed: false,
    onSetCollapsed: vi.fn(),
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ collapsed: false });
  });

  it("builds the amount with keypad presses (plain number, no leading zeros)", () => {
    render(<InputPad {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Key 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Key 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Key 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Key 2" }));
    expect(screen.getByRole("button", { name: /amount ₹12/i })).toBeInTheDocument(); // 0012 → 12
  });

  it("caps the amount at 9 significant digits", () => {
    render(<InputPad {...base} />);
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1"];
    for (const d of digits) fireEvent.click(screen.getByRole(`button`, { name: `Key ${d}` }));
    expect(screen.getByRole("button", { name: /₹12,34,56,789/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /₹1,234,567,891/ })).not.toBeInTheDocument();
  });

  it("submits amount + note + category and clears the pad", () => {
    const onSubmit = vi.fn();
    render(<InputPad {...base} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Key 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Key 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Key 5" }));
    const note = screen.getByLabelText("Note");
    fireEvent.change(note, { target: { value: "Chai" } });
    fireEvent.click(screen.getByRole("radio", { name: /Food/i }));
    fireEvent.pointerDown(screen.getByRole("group", { name: "Keypad" }).querySelector("button[aria-label='Add expense']")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ amount: 125, note: "Chai", categoryId: expect.any(String) });
    expect(screen.getByRole("button", { name: /amount ₹0/i })).toBeInTheDocument();
  });

  it("does not submit an empty amount and shows the error state", () => {
    render(<InputPad {...base} />);
    fireEvent.pointerDown(screen.getByRole("group", { name: "Keypad" }).querySelector("button[aria-label='Add expense']")!);
    expect(base.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /amount ₹0/i })).toHaveClass("bg-red-500");
  });

  it("collapses on note focus so the system keyboard gets room", () => {
    const onSetCollapsed = vi.fn();
    render(<InputPad {...base} onSetCollapsed={onSetCollapsed} />);
    fireEvent.focus(screen.getByLabelText("Note"));
    expect(onSetCollapsed).toHaveBeenLastCalledWith(true);
    fireEvent.blur(screen.getByLabelText("Note"));
    expect(onSetCollapsed).toHaveBeenLastCalledWith(false);
  });

  it("auto-suggests the category from the note text", () => {
    render(<InputPad {...base} />);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Rapido to office" } });
    const travel = cats.find((c) => c.name === "Travel")!;
    expect(screen.getByRole("radio", { name: /Travel/i })).toHaveAttribute("aria-checked", "true");
    expect(travel).toBeTruthy();
  });
});

describe("EditDialog", () => {
  const t: Transaction = {
    id: "e1",
    amount: 125,
    note: "Tea",
    categoryId: cats[0].id,
    date: "2026-10-02",
    time: "09:30",
    createdAt: 1,
  };

  const base = { tx: t, categories: cats, onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the selected record's values", () => {
    render(<EditDialog {...base} />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("125");
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("Tea");
    expect(screen.getByRole("radio", { name: /Food/i })).toHaveAttribute("aria-checked", "true");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-10-02");
  });

  it("saves the edited values and closes", () => {
    render(<EditDialog {...base} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Masala chai" } });
    fireEvent.click(screen.getByRole("radio", { name: /Travel/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(base.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 200, note: "Masala chai", categoryId: expect.any(String) }),
    );
    expect(base.onClose).toHaveBeenCalled();
  });

  it("does not save a non-positive amount", () => {
    render(<EditDialog {...base} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(base.onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 125 })); // keeps the old amount
  });

  it("deletes via the sheet's delete button and closes", () => {
    render(<EditDialog {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /delete expense/i }));
    expect(base.onDelete).toHaveBeenCalledTimes(1);
    expect(base.onClose).toHaveBeenCalled();
  });

  it("closes on cancel", () => {
    render(<EditDialog {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(base.onClose).toHaveBeenCalled();
  });
});

describe("SummaryCard", () => {
  const base = {
    month: "2026-10",
    currency: "₹",
    onSetBudget: vi.fn(),
  };
  const t: Transaction = { id: "1", amount: 300, note: "A", categoryId: cats[0].id, date: "2026-10-05", time: "10:00", createdAt: 1 };

  beforeEach(() => vi.clearAllMocks());

  it("shows budget, total, remaining and progress", () => {
    render(<SummaryCard {...base} budget={1000} transactions={[t]} />);
    expect(screen.getByText("₹1,000")).toBeInTheDocument();
    expect(screen.getByText("₹300")).toBeInTheDocument();
    expect(screen.getByText("₹700")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  });

  it("flags over-budget", () => {
    render(<SummaryCard {...base} budget={100} transactions={[t]} />);
    expect(screen.getByText("Over budget")).toBeInTheDocument();
  });

  it("edits the budget inline", () => {
    const onSetBudget = vi.fn();
    render(<SummaryCard {...base} budget={1000} transactions={[t]} onSetBudget={onSetBudget} />);
    fireEvent.click(screen.getByRole("button", { name: /monthly budget ₹1,000/i }));
    fireEvent.change(screen.getByLabelText("Budget amount"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSetBudget).toHaveBeenCalledWith(2000);
  });
});
