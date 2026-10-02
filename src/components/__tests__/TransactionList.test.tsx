import { describe, expect, it, vi, beforeEach } from "vitest";
// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import TransactionList from "../TransactionList";
import { DEFAULT_CATEGORIES, type Transaction } from "../../db/types";
import { useStore } from "../../store/store";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? "t1",
  amount: over.amount ?? 125,
  note: over.note ?? "Tea",
  categoryId: over.categoryId ?? DEFAULT_CATEGORIES[0].id,
  date: over.date ?? "2026-10-02",
  time: over.time ?? "09:30",
  createdAt: over.createdAt ?? 1_785_000_000_000,
  ...over,
});

const base = {
  categories: DEFAULT_CATEGORIES,
  currency: "₹",
  search: "",
  scrollRef: { current: null },
  onDelete: vi.fn(),
  onRestore: vi.fn(),
  onDeleteMany: vi.fn(),
};

describe("TransactionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ month: "2026-10", editing: null, setEditing: (t) => useStore.setState({ editing: t }) });
  });

  it("renders rows with note, time and amount", () => {
    render(<TransactionList {...base} transactions={[tx({})]} />);
    expect(screen.getByText("Tea")).toBeInTheDocument();
    expect(screen.getByText("₹125")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete tea/i })).toBeInTheDocument();
  });

  it("opens edit when the row is clicked once (regression: taps used to be swallowed)", () => {
    render(<TransactionList {...base} transactions={[tx({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /edit tea/i }));
    expect(useStore.getState().editing?.id).toBe("t1");
  });

  it("deletes with ONE tap on the trash button and never opens edit", () => {
    const onDelete = vi.fn();
    render(<TransactionList {...base} transactions={[tx({})]} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /delete tea/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(useStore.getState().editing).toBeNull();
  });

  it("shows the undo toast after delete and restores on UNDO", () => {
    const onRestore = vi.fn();
    render(<TransactionList {...base} transactions={[tx({})]} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole("button", { name: /delete tea/i }));
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("highlights the search match in the note", () => {
    render(<TransactionList {...base} transactions={[tx({ note: "Rapido ride" })]} search="rap" />);
    expect(screen.getByText("Rap")).toBeInTheDocument();
  });

  it("shows the empty state with a hint", () => {
    render(<TransactionList {...base} transactions={[]} />);
    expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
  });

  it("long-press starts selection mode; Delete removes all selected", () => {
    vi.useFakeTimers();
    const onDeleteMany = vi.fn();
    render(
      <TransactionList
        {...base}
        transactions={[tx({ id: "a", note: "A", time: "09:00" }), tx({ id: "b", note: "B", time: "08:00" })]}
        onDeleteMany={onDeleteMany}
      />,
    );
    const rowA = screen.getByRole("button", { name: /edit a,/i });
    fireEvent.pointerDown(rowA, { pointerId: 1, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(600); // past the 500ms long-press threshold
    });
    expect(screen.getByRole("toolbar", { name: /bulk actions/i })).toBeInTheDocument();

    // taps now toggle selection instead of opening edit
    fireEvent.click(screen.getByRole("button", { name: /select b,/i }));
    expect(useStore.getState().editing).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /delete$/i }));
    expect(onDeleteMany).toHaveBeenCalledTimes(1);
    expect(onDeleteMany.mock.calls[0][0].map((t: Transaction) => t.id).sort()).toEqual(["a", "b"]);
    vi.useRealTimers();
  });
});
