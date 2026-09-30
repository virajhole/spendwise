import type { Backup } from "../db/db";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportCSV(
  txs: { id: string; amount: number; note: string; categoryId: string; date: string; time: string }[],
  categoryName: (id: string) => string,
) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ["Date", "Time", "Note", "Category", "Amount"].join(","),
    ...txs.map((t) =>
      [t.date, t.time, esc(t.note || ""), esc(categoryName(t.categoryId)), String(t.amount)].join(","),
    ),
  ];
  download(`expenses-${new Date().toISOString().slice(0, 10)}.csv`, rows.join("\n"), "text/csv");
}

export function exportJSON(data: Backup) {
  download(`spendwise-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
}

export function readJSONFile(file: File): Promise<Backup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as Backup);
      } catch (e) {
        reject(new Error("Could not parse JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file);
  });
}
