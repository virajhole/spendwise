# SpendWise — Expense Tracker (PWA)

A mobile-first, offline-first expense tracker built with **React + Vite + Tailwind CSS v4**. Designed for one-handed phone use (360–430px first, centered max-width 480px on desktop), installable as a PWA, with all data stored locally in IndexedDB via Dexie.

## Features

- **Dashboard** — monthly budget (tap to edit, defaults to last month's budget), total expense, remaining balance, animated progress bar (orange at 80%, red when over), "Over budget" label, budget alert banners at 80% and 100%.
- **Month switcher** — browse any month with its own budget and transactions.
- **Transactions** — newest first, grouped by date (Today / Yesterday / 12 Sept), swipe left to delete (with undo toast) or use the ✕ button, tap to edit amount/note/category/date/time. Search by text, filter by category.
- **Calculator input pad** — large ₹ display, note field, horizontally scrollable category chips, big keypad (1–9, 00, 0, ⌫) with haptic feedback via `navigator.vibrate`, large round **+** button, collapsible pad.
- **Stats tab** — donut chart by category (SVG, no chart lib), daily spending bar chart, top category, average per day, projected month-end spend.
- **Categories** — 7 defaults with icons/colors, add custom ones.
- **Recurring expenses** — monthly auto-add (e.g. rent) on day-of-month, with on/off toggle.
- **Light / Dark / System theme**, remembered; true-dark `#0f1115` surfaces.
- **Currency setting** (default INR ₹) with Indian number formatting (1,23,456).
- **Data tools** — export CSV, export JSON backup, import JSON (merge), clear all data (with confirmation), demo-data seed toggle.
- **App lock** — optional 4–8 digit PIN screen on start.
- **PWA** — manifest, service worker (offline precache), app icons, Add to Home Screen, theme-color meta, standalone display.

## Tech stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| UI         | React 19, Vite 6, Tailwind CSS v4                 |
| State      | Zustand (`src/store/store.ts`) + Dexie live hooks |
| Data       | IndexedDB via Dexie (`src/db/`)                   |
| Animations | Framer Motion (respects `prefers-reduced-motion`) |
| Icons      | lucide-react + emoji category icons               |
| PWA        | vite-plugin-pwa (Workbox)                         |
| Tests      | Vitest (`src/utils/*.test.ts`)                    |

## Project structure

```
├── index.html                  # viewport-fit=cover, theme-color, 16px+ inputs
├── public/icons/               # generated PWA icons (192/512/maskable)
├── scripts/generate-icons.mjs  # zero-dependency icon generator
└── src/
    ├── main.tsx                # entry, settings init
    ├── App.tsx                 # router + lock screen + shell
    ├── index.css               # theme tokens, safe areas, reduced motion
    ├── components/             # Header, SummaryCard, TransactionList, InputPad, …
    ├── pages/                  # Dashboard, Stats, Settings
    ├── hooks/                  # haptics, app lock, recurring auto-add, media queries
    ├── store/                  # Zustand store + live-query data hooks
    ├── db/                     # Dexie schema, repository layer, seed data
    └── utils/                  # calc (tested), format, csv/json export
```

The repository layer (`src/db/repo.ts`) is the single persistence boundary — swap its internals for Supabase/Firebase calls later without touching UI code.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5175 (opens automatically)
```

The dev server is pinned to port **5175** with `--strictPort`, so the URL is always the same. If 5175 is busy, use `npm run dev:alt` (port 5176).

Other scripts:

```bash
npm test         # unit tests for totals, remaining, month grouping, formatting
npm run build    # typecheck + production build (dist/)
npm run preview  # serve the production build locally
npm run icons    # regenerate PWA icons
```

## Deploy

### Vercel

```bash
npm i -g vercel
vercel           # framework: Vite, build: npm run build, output: dist
```

Or connect the repo in the Vercel dashboard — it auto-detects Vite.

### Netlify

```bash
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

Or add `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

The app uses hash routing, so no SPA rewrite rules are needed (though `/* /index.html 200` works too).

## Install on your phone

1. Deploy (or run `npm run preview -- --host` and open the LAN URL).
2. **Android/Chrome:** tap the ⋮ menu → **Add to Home screen** → Install.
3. **iOS/Safari:** tap Share → **Add to Home Screen**.
4. Launch from the home screen icon — it opens fullscreen (standalone), works offline, and the keypad respects the gesture bar via safe-area insets.

## Notes

- All data lives in your browser's IndexedDB; nothing leaves the device.
- Recurring expenses apply when the app is opened (day-of-month check).
- Demo data: **Settings → Load demo data** for a full UI preview (idempotent — safe to click repeatedly).

## Troubleshooting

- **Blank/white screen on open** — the app ships with an error boundary that shows a message plus *Reload app* / *Reset app data* buttons instead of a white page. *Reset app data* deletes the local IndexedDB database and restarts clean.
- **Stale data after a schema change in development** — open DevTools → Application → IndexedDB → delete `spendwise-db`, then reload.
- **Wrong app on localhost:5173** — other projects may claim common ports; this app always uses 5175 in dev.
- **IndexedDB unavailable** (private mode / hardened browsers) — the app surfaces the error instead of silently failing; use a normal browser window.
