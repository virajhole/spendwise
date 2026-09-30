import { useRef, useState } from "react";
import { Download, FileJson, RefreshCw, Trash2, Upload } from "lucide-react";
import { db, type Backup } from "../db/db";
import { repo } from "../db/repo";
import { seedDemoData } from "../db/seed";
import { exportCSV, exportJSON, readJSONFile } from "../utils/export";
import { useCategories, useRecurrings, useStore, type ThemeMode } from "../store/store";
import { getStoredPin, setStoredPin } from "../hooks/useAppLock";
import { formatAmount } from "../utils/format";

const CURRENCIES = ["₹", "$", "€", "£", "¥"];

export default function SettingsPage() {
  const { currency, setCurrency, theme, setTheme } = useStore();
  const categories = useCategories();
  const recurrings = useRecurrings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [pin, setPin] = useState(getStoredPin() ?? "");
  const [confirmClear, setConfirmClear] = useState(false);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleExportCSV = async () => {
    const txs = await db.transactions.toArray();
    const cats = await db.categories.toArray();
    exportCSV(txs, (id) => cats.find((c) => c.id === id)?.name ?? id);
    flash("CSV exported");
  };

  const handleExportJSON = async () => {
    exportJSON(await repo.exportAll());
    flash("JSON backup exported");
  };

  const handleImport = async (file: File) => {
    try {
      const data = await readJSONFile(file);
      const n = await repo.importAll(data as Backup, "merge");
      flash(`Imported ${n} transactions`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Import failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-slate-100/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+16px)] backdrop-blur dark:bg-[#0f1115]/95">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {msg ? <div className="mb-3 rounded-2xl bg-teal-600/10 px-4 py-2.5 text-sm font-medium text-teal-700 dark:text-teal-300" role="status">{msg}</div> : null}

        {/* Appearance */}
        <Card title="Appearance">
          <div className="grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as ThemeMode[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
                className={`rounded-xl py-2.5 text-sm font-semibold capitalize ${
                  theme === t ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Card>

        {/* Currency */}
        <Card title="Currency">
          <div className="flex gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                aria-pressed={currency === c}
                className={`h-11 w-11 rounded-xl text-lg font-bold ${
                  currency === c ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Preview: {formatAmount(123456, currency)} (Indian grouping)</p>
        </Card>

        {/* Categories */}
        <Card title="Categories">
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-base" style={{ backgroundColor: c.color + "22" }} aria-hidden>
                  {c.icon}
                </span>
                <span className="flex-1 font-medium">{c.name}</span>
                {c.custom ? (
                  <button
                    onClick={async () => {
                      await repo.deleteCategory(c.id);
                      flash("Category removed");
                    }}
                    aria-label={`Delete category ${c.name}`}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <AddCategory onAdd={async (name, icon, color) => {
            await repo.addCategory(name, icon, color);
            flash(`Added ${name}`);
          }} />
        </Card>

        {/* Recurring */}
        <Card title="Recurring expenses">
          {recurrings.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
            <ul className="space-y-2">
              {recurrings.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 font-medium">{r.name}</span>
                  <span className="tabular-nums">{formatAmount(r.amount, currency)}</span>
                  <span className="text-xs text-slate-400">day {r.day}</span>
                  <button
                    onClick={() => void repo.updateRecurring({ id: r.id, active: !r.active })}
                    aria-label={`Toggle ${r.name}`}
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.active ? "bg-teal-600/15 text-teal-600" : "bg-slate-200 text-slate-400 dark:bg-slate-800"}`}
                  >
                    {r.active ? "ON" : "OFF"}
                  </button>
                  <button onClick={() => void repo.deleteRecurring(r.id)} aria-label={`Delete ${r.name}`} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AddRecurring />
        </Card>

        {/* Data */}
        <Card title="Data">
          <div className="grid grid-cols-3 gap-2">
            <ActionButton icon={<Download size={18} aria-hidden />} label="Export CSV" onClick={handleExportCSV} />
            <ActionButton icon={<FileJson size={18} aria-hidden />} label="Backup JSON" onClick={handleExportJSON} />
            <ActionButton icon={<Upload size={18} aria-hidden />} label="Import JSON" onClick={() => fileRef.current?.click()} />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={async () => {
              await seedDemoData();
              flash("Demo data loaded");
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold dark:bg-slate-800"
          >
            <RefreshCw size={16} aria-hidden /> Load demo data
          </button>
          {confirmClear ? (
            <div className="mt-3 rounded-2xl bg-red-50 p-3 dark:bg-red-950/40">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Delete ALL data? This cannot be undone.</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    await repo.clearAll();
                    setConfirmClear(false);
                    flash("All data cleared");
                  }}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white"
                >
                  Yes, delete everything
                </button>
                <button onClick={() => setConfirmClear(false)} className="flex-1 rounded-xl bg-slate-200 py-2 text-sm font-semibold dark:bg-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-100 py-2.5 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400"
            >
              <Trash2 size={16} aria-hidden /> Clear all data
            </button>
          )}
        </Card>

        {/* App lock */}
        <Card title="App lock (PIN)">
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="4–8 digit PIN"
              aria-label="PIN"
              className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
            />
            <button
              onClick={() => {
                setStoredPin(pin.length >= 4 ? pin : null);
                flash(pin.length >= 4 ? "PIN enabled" : "PIN removed");
              }}
              className="rounded-xl bg-teal-600 px-4 font-bold text-white"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Leave empty and save to disable. Lock applies on next app start.</p>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">SpendWise v1.0 · Offline-first · Your data stays on this device</p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900" aria-label={title}>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-100 py-3 text-xs font-semibold text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
    >
      {icon}
      {label}
    </button>
  );
}

function AddCategory({ onAdd }: { onAdd: (name: string, icon: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("⭐");
  const colors = ["#0ea5a4", "#f97316", "#3b82f6", "#ec4899", "#8b5cf6"];
  const [color, setColor] = useState(colors[0]);
  return (
    <div className="mt-3 flex gap-2">
      <input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 2))} aria-label="Icon" className="w-12 rounded-xl bg-slate-100 py-2 text-center dark:bg-slate-800" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="Category name" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 outline-none dark:bg-slate-800" />
      <button
        onClick={() => {
          if (name.trim()) {
            onAdd(name.trim(), icon || "⭐", color);
            setName("");
          }
        }}
        className="rounded-xl bg-teal-600 px-4 text-sm font-bold text-white"
      >
        Add
      </button>
    </div>
  );
}

function AddRecurring() {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const { currency } = useStore();
  return (
    <div className="mt-3 space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly rent" aria-label="Recurring name" className="w-full rounded-xl bg-slate-100 px-3 py-2 outline-none dark:bg-slate-800" />
      <div className="flex gap-2">
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (${currency})`} aria-label="Recurring amount" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 outline-none dark:bg-slate-800" />
        <input type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day of month" className="w-20 rounded-xl bg-slate-100 px-3 py-2 outline-none dark:bg-slate-800" />
        <button
          onClick={async () => {
            const amt = Number(amount);
            if (name.trim() && amt > 0) {
              const cats = await db.categories.toArray();
              await repo.addRecurring({ name: name.trim(), amount: amt, categoryId: cats[0]?.id ?? "other", day: Math.min(28, Math.max(1, Number(day) || 1)), active: true });
              setName("");
              setAmount("");
            }
          }}
          className="rounded-xl bg-teal-600 px-4 text-sm font-bold text-white"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-slate-400">Runs on day {day} of each month while the app is opened.</p>
    </div>
  );
}
