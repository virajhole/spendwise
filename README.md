# SpendWise — Expense Tracker (PWA + Supabase + Vercel)

A mobile-first expense tracker built with **React + Vite + Tailwind CSS v4**. Data lives in **Supabase** (Postgres with Row Level Security), syncs **live across devices** via realtime, supports **offline ordinary writes** (optimistic writes + a durable retry queue; cloud net settlement requires connectivity), and is protected by **email/password or Google sign-in**. Installable as a **PWA** and deployable on **Vercel**.

## Features

- **Mobile UI:** five tabs—Home, People, Wallet, Reports and Settings—with touch-friendly controls, tap-to-edit entries, scrollable sheets and PWA installation.
- **Home:** monthly budget, personal expenses, remaining balance, search, category/date filters and quick Hinglish/English text entry. Try `chai 15`, `Burger King 173 SBI cc`, `Rini take 300 dinner`, or `mujhe Rini ko 299 dene hain`. Payment defaults to UPI. Parsing uses local rules, not an AI service; ambiguous entries need more detail or the manual form.
- **People:** searchable contacts combine money lent, borrowed, split shares and repayments. Green means money to receive; red means money to pay. Contacts show the net balance, complete activity and a Payments tab. People has no month switcher: balances are all-time, with date/type filters for history.
- **Splits:** equal shares, exact amounts, or fixed shares with the remainder divided among Auto participants. Only your share counts as your personal expense. Every paise is allocated.
- **Settle up:** Pay/Receive is prefilled with the contact's net amount. Partial payments work too. Borrowed ₹1,000 minus a ₹200 receivable means Pay ₹800; confirming records ₹200 matching non-cash adjustments and ₹800 actual payment atomically. The app records payments already made; it does not transfer money.
- **Editing:** change names, amounts, categories, payment methods, dates and lending/borrowing direction. Existing repayment links remain intact. Amounts cannot fall below recorded repayments; direction changes require removing conflicting repayments. Automatic net adjustments cannot be edited individually.
- **Wallet:** monthly spending by payment method and all-time named card balances. Tap SBI/HDFC or UPI/Cash/Debit/Bank to open that selection's full history, including repayments, with date filters. Card bill payments reduce card dues without becoming another expense.
- **Reports:** personal expenses, gross purchases, category/daily charts, recurring schedules, card dues and one net-balance row per contact.
- **Recurring bills:** editable name, amount, category, day (1–28), active/paused status and active monthly total. Schedules run when the app opens on or after the due day; edits do not reset the last-run marker or rewrite generated expenses.
- **Appearance:** green light theme and neutral black/charcoal dark surfaces. Header button switches directly between light and dark with one tap, including from System mode. Settings retains Light/Dark/System. Currency selection has been removed; existing currency preferences are preserved (INR by default).
- **Cloud and local storage:** Supabase Auth, RLS, realtime updates and durable offline queues for ordinary writes. Without Supabase configuration, IndexedDB provides local-only storage. Cloud net settlements require connectivity and completed pending sync; local net settlements work offline.
- **Data and device tools:** CSV/JSON export, JSON import, demo data, clear all, custom categories, optional PIN lock and app-open reminders. Existing pre-cloud data can be imported into the signed-in account.

See [the feature and accounting guide](docs/mobile-finance.md) for examples, payment semantics and limitations.

## Tech stack

| Layer      | Choice                                                          |
| ---------- | --------------------------------------------------------------- |
| UI         | React 19, Vite 6, Tailwind CSS v4                               |
| State      | Zustand (`src/store/`)                                          |
| Data       | Supabase (Postgres + RLS + Realtime) via repository layer        |
| Local      | IndexedDB via Dexie — offline write queue, legacy import, fallback |
| Auth       | Supabase Auth (email/password + Google OAuth)                   |
| PWA        | vite-plugin-pwa (Workbox)                                       |
| Tests      | Vitest (`src/db/repo.test.ts`, `src/utils/*.test.ts`)           |

## Project structure

```
├── supabase/schema.sql         # paste into Supabase SQL Editor (tables, RLS, triggers, realtime)
├── vercel.json                 # SPA rewrites + sw.js headers
├── .env.example                # copy to .env.local, fill in Supabase keys
└── src/
    ├── lib/supabase.ts         # Supabase client (anon key only)
    ├── auth/AuthProvider.tsx   # session state, sign in/up/Google/out
    ├── db/
    │   ├── types.ts            # domain types + the repository interface
    │   ├── supabaseRepo.ts     # Supabase implementation
    │   ├── dexieRepo.ts        # IndexedDB fallback (used when env vars are absent)
    │   ├── repo.ts             # the facade everything imports (`repo`, queue helpers)
    │   ├── queue.ts            # durable offline write queue
    │   ├── migrate.ts          # one-time IndexedDB → Supabase import
    │   └── seed.ts             # demo data
    ├── store/
    │   ├── data.ts             # data hooks + optimistic mutations + realtime
    │   └── store.ts            # UI state (month, filters, theme, currency)
    ├── pages/                  # Dashboard, People, Wallet, Stats, Settings, Login
    └── components/             # Header, TransactionList, InputPad, ToastHost, MigrationPrompt, …
```

Components only ever call the repository/store layer — never Supabase directly. If the env vars are missing the app transparently falls back to local-only mode, so a fresh clone still runs.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (any name, e.g. `spendwise`; pick a region near you and a strong DB password).
2. When it's ready, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. Then run these migrations in order: [`20261011_finance.sql`](supabase/migrations/20261011_finance.sql), [`20261012_editable_finance.sql`](supabase/migrations/20261012_editable_finance.sql), and [`20261013_net_settlement.sql`](supabase/migrations/20261013_net_settlement.sql). Existing installations run only migrations not already applied. The app/build does not apply SQL automatically. These add payment metadata, safe ledger edits, and atomic net settlement with server validation; existing expenses keep their original amounts and an unrecorded payment method.
3. Go to **Project Settings → API** and copy two values:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

   ⚠️ Use only the **anon** key in the frontend — it's safe because RLS scopes every table to the signed-in user. **Never** put the `service_role` key in `.env*`, code, or Vercel.

### Google login setup (optional)

Email/password works out of the box. To enable **"Continue with Google"**, do these three things in order:

**1. Google Cloud Console — create the OAuth client**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create (or select) a project.
2. **APIs & Services → OAuth consent screen** → choose *External* → fill in the app name + support email → save (publishing is fine for personal use).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorized redirect URIs** — add exactly:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
   (replace `<project-ref>` with your Supabase project ref — the long id in your project URL, also shown in Project Settings → General).
5. *(Optional)* **Authorized JavaScript origins**: `http://localhost:5175` and your Vercel URL — not strictly required for the Supabase server-side flow, but harmless.
6. Copy the **Client ID** and **Client secret**.

**2. Supabase — enable the Google provider**

Supabase Dashboard → **Authentication → Sign In / Providers → Google** → toggle **Enable** → paste the Client ID and Client Secret → **Save**.

**3. Supabase — URL Configuration**

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL**: your Vercel URL, e.g. `https://spendwise.vercel.app`
- **Redirect URLs** — add all of these:
  - `https://spendwise.vercel.app/**` (your Vercel URL with the `/**` wildcard)
  - `http://localhost:5175/**` (local dev)
  - optionally `http://localhost:4173/**` for `npm run preview`

That's it. The app calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })`, so after consenting, the browser returns to your site, the client detects the session in the URL (`detectSessionInUrl: true`), the `?code=…` params are scrubbed from the address bar, and you land on the dashboard. If Google returns an error (provider disabled, unregistered redirect URL, …), the login screen shows the exact `error` / `error_description` from the URL with the most common causes — no blank error page.

## 2. Run locally

```bash
npm install
cp .env.example .env.local    # then paste your URL + anon key into it
npm run dev                   # http://localhost:5175
```

Sign up with any email/password (check **Authentication → Users** in Supabase to see the account; disable "Confirm email" in **Authentication → Sign In / Providers** if you want immediate logins during dev).

## 3. Deploy on Vercel

1. **Push to GitHub**

   ```bash
   git add -A
   git commit -m "Add Supabase backend + Vercel deployment"
   git push origin main
   ```

2. **Import the repo** — [vercel.com/new](https://vercel.com/new) → import your repository. Vercel auto-detects Vite (build `npm run build`, output `dist`). `vercel.json` already contains the SPA rewrite so all routes serve `index.html`.

3. **Add environment variables** — Project → Settings → Environment Variables, add for *Production, Preview and Development*:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key

4. **Deploy**, then copy your final URL (e.g. `https://spendwise.vercel.app`).

5. **Allow the new domain in Supabase** — Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `https://spendwise.vercel.app` (your Vercel URL)
   - **Redirect URLs**: add `https://spendwise.vercel.app/**` (and `http://localhost:5175/**` for dev). Required for email confirmation links and Google sign-in to return to your app.

6. Redeploy from Vercel (*Deployments → ⋯ → Redeploy*) if you changed Supabase settings while the build was running.

7. Visit the URL, sign up — the app offers to import any local IndexedDB data from a previous install, then syncs from the cloud from then on.

## 4. Install on your phone (PWA)

1. Open your deployed Vercel URL in the phone's browser (Chrome on Android, Safari on iOS).
2. **Android / Chrome:** ⋮ menu → **Add to Home screen** → **Install**.
   **iOS / Safari:** Share (□↑) → **Add to Home Screen** → **Add**.
3. Launch from the home-screen icon — it opens fullscreen (standalone), keeps you signed in, shows queued data offline, and respects the gesture bar via safe-area insets.

## Scripts

```bash
npm run dev      # dev server (port 5175, opens automatically)
npm test         # unit + component tests (Vitest; Supabase mocked in component tests)
npm run e2e      # build in local-only mode + Playwright E2E at 360x780 (system Chrome)
npm run lint     # ESLint over src/
npm run build    # typecheck + production build → dist/
npm run preview  # serve the production build locally
npm run icons    # regenerate PWA icons
```

E2E notes: `npm run e2e` first rebuilds with the Supabase env vars cleared, so the
flows run against local IndexedDB — deterministic and safe (your cloud data is
never touched). Chrome must be installed (tests use the system Chrome via
`channel: "chrome"`).

## Security notes

- Only the **anon key** ships to the browser; every table has **RLS enabled** with `user_id = auth.uid()` policies (see `supabase/schema.sql`), so users can never read or write each other's rows.
- Inputs are validated on the client (amount > 0, note ≤ 200 chars) **and** in the DB (`amount numeric(12,2) CHECK (amount > 0)`, `char_length(note) <= 500`, day 1–28, theme enum).
- `.env`, `.env.local` (and other `.env*`) are gitignored; `.env.example` documents the shape. The service worker runs all Supabase requests as `NetworkOnly` — auth tokens and data are never cached on disk by the SW.

## Troubleshooting

- **Google sign-in shows "Error 400: redirect_uri_mismatch" on accounts.google.com** — Google rejects the request before it ever reaches your app. Go to Google Cloud Console → APIs & Services → Credentials → your OAuth client → **Authorized redirect URIs** and add exactly `https://<project-ref>.supabase.co/auth/v1/callback` (no trailing slash). Your Vercel/localhost URLs do **not** go here — only in Supabase → Authentication → URL Configuration.
- **"Google sign-in isn't configured" / OAuth error** — the Google provider isn't enabled in Supabase yet, or the redirect URL from the Google login setup section is missing. Email sign-in works regardless.
- **Email link opens the app but doesn't log me in** — add your production URL (and localhost) to **Authentication → URL Configuration → Redirect URLs**.
- **No data syncs between two devices** — confirm both are signed into the *same* Supabase project (same `VITE_SUPABASE_URL`) and that `schema.sql` ran successfully (tables exist in **Table Editor**).
- **Data not updating live** — check the browser console for realtime errors; Realtime requires the `supabase_realtime` publication line that `schema.sql` adds for `expenses`.
- **Stale UI during development** — service worker caches the app shell; DevTools → Application → Service Workers → *Unregister*, then reload.
- **Wrong app on localhost:5173** — this app always uses port 5175 in dev (`npm run dev:alt` for 5176).

- **Settle up says the function is missing** — run `20261013_net_settlement.sql` after both earlier finance migrations in your Supabase SQL Editor. Local builds do not update the cloud database.
- **Names appear as separate contacts** — names match ignoring case and repeated spaces. Different spellings remain distinct; edit the entry to use the existing contact name.
