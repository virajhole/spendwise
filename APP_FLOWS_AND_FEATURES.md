# SpendWise — Complete Application Specification, Flows & Architecture Guide

> **Purpose of this document:**  
> This file is the single, authoritative technical specification of the **SpendWise Expense Tracker** application. It describes every feature, user flow, business logic rule, accounting model, database schema, state management pattern, and edge case in complete detail. Any AI agent, developer, or system reading this document can understand the entire application without needing to inspect individual source files.

---

## Table of Contents
1. [App Identity & Core Philosophy](#1-app-identity--core-philosophy)
2. [Technology Stack & Directory Structure](#2-technology-stack--directory-structure)
3. [Domain Models & Data Structures](#3-domain-models--data-structures)
4. [Ledger & Accounting Engine Principles](#4-ledger--accounting-engine-principles)
5. [Complete User Flows & Screen Specifications](#5-complete-user-flows--screen-specifications)
   - [5.1 Authentication & Boot Flow](#51-authentication--boot-flow)
   - [5.2 Home / Dashboard Flow (`/`)](#52-home--dashboard-flow-)
   - [5.3 Quick Entry (Hinglish / English NLP Engine)](#53-quick-entry-hinglish--english-nlp-engine)
   - [5.4 People & Debt Management Flow (`/people`)](#54-people--debt-management-flow-people)
   - [5.5 Net Settlement Engine (Pay / Receive)](#55-net-settlement-engine-pay--receive)
   - [5.6 Wallet & Payment Methods Flow (`/wallet`)](#56-wallet--payment-methods-flow-wallet)
   - [5.7 Reports & Analytics Flow (`/stats`)](#57-reports--analytics-flow-stats)
   - [5.8 Settings & Utilities Flow (`/settings`)](#58-settings--utilities-flow-settings)
6. [Offline Architecture, Queue & Sync Mechanics](#6-offline-architecture-queue--sync-mechanics)
7. [Database Schema, RLS & Stored Procedures](#7-database-schema-rls--stored-procedures)
8. [Validation Invariants & Safeguards](#8-validation-invariants--safeguards)
9. [Developer & AI Agent Contribution Guidelines](#9-developer--ai-agent-contribution-guidelines)

---

## 1. App Identity & Core Philosophy

- **App Name:** SpendWise (Mobile-first Progressive Web App)
- **Primary Use Case:** Personal finance management combining daily personal expense tracking, group bill splitting (Splitwise style), bidirectional debt/loan tracking (lent & borrowed), and credit card bill reconciliation.
- **Core Principles:**
  1. **Personal Private Ledger:** Friends are names in a private ledger; they do not need accounts, apps, or invitations. The user tracks everything from their own financial perspective.
  2. **Paise-Perfect Strict Accounting:** Every single paise is preserved using 2-decimal rounded math (`money(n)`). Gross bill payments, personal shares, non-cash balance adjustments, and actual repayments are kept distinct so personal monthly expenses are never inflated or distorted.
  3. **Offline-First & Resilient:** Optimistic local updates in Zustand + durable offline retry queue in IndexedDB (Dexie) + live Supabase sync over WebSockets. Even if Supabase credentials are completely missing, the app functions seamlessly in 100% local mode.
  4. **Fast Mobile-First UX:** Touch controls, haptic feedback, custom numeric keypad (`InputPad`), conversational quick-entry input bar, bottom sheets, and keyboard-aware viewport.

---

## 2. Technology Stack & Directory Structure

### 2.1 Tech Stack
- **Framework:** React 19, TypeScript
- **Bundler:** Vite 6 (`vite-plugin-pwa` with Workbox service worker)
- **Styling:** Tailwind CSS v4, custom CSS variables supporting high-contrast Dark & Green Light themes
- **State Management:** Zustand (`src/store/data.ts` for database state, `src/store/store.ts` for UI state)
- **Backend / Cloud DB:** Supabase (PostgreSQL with Row Level Security, Realtime subscriptions, Stored Procedures in PL/pgSQL)
- **Local Fallback DB:** Dexie (IndexedDB)
- **Icons & Motion:** Lucide React icons, lightweight CSS transitions
- **Testing:** Vitest (unit & integration tests), Playwright (E2E tests in local mode)

### 2.2 Directory Structure
```
├── src/
│   ├── main.tsx              # React entry point, service worker registration
│   ├── App.tsx               # Root component, route definitions, offline banner, idle preloader
│   ├── index.css             # Tailwind v4 theme variables, bottom sheets, scrollbars
│   ├── auth/
│   │   ├── AuthProvider.tsx  # Supabase Auth context (session, user, signIn, signUp, signInWithGoogle, signOut)
│   │   └── oauth.ts          # OAuth redirect URL parsing, error extraction, cleanup
│   ├── components/
│   │   ├── BottomNav.tsx     # 5 navigation tabs: Home, People, Wallet, Stats, Settings
│   │   ├── Header.tsx        # App header, month navigator, theme toggle
│   │   ├── InputPad.tsx      # Comprehensive transaction entry modal (Amount keypad, splits, loans, cards)
│   │   ├── QuickEntry.tsx    # Conversational text input with local Hinglish/English rule parser
│   │   ├── NetSettlementSheet.tsx # Contact net settlement calculator & execution modal
│   │   ├── EditDialog.tsx    # Edit existing transactions (preserves repayment constraints)
│   │   ├── PeopleContacts.tsx# Grouped contacts list, all-time balances, activity timeline
│   │   ├── SummaryCard.tsx   # Monthly budget, spent, remaining balance widget
│   │   ├── SearchBar.tsx     # Filter by keyword, category, date range, sort order
│   │   ├── TransactionList.tsx # Date-grouped list of transactions with badges & actions
│   │   ├── RecurringExpenses.tsx # Settings module for recurring bill schedules
│   │   ├── LockScreen.tsx    # PIN code authentication lock screen
│   │   ├── MigrationPrompt.tsx# Prompts user to import legacy IndexedDB data to Supabase
│   │   ├── ToastHost.tsx     # Floating notification toast messages
│   │   └── RequireAuth.tsx   # Protected route guard
│   ├── db/
│   │   ├── types.ts          # Core TypeScript domain models, validation helpers, UUID generator
│   │   ├── repo.ts           # Unified repository facade (delegates to supabaseRepo or dexieRepo)
│   │   ├── supabaseRepo.ts   # Supabase client queries & RPC callers
│   │   ├── dexieRepo.ts      # IndexedDB repository fallback
│   │   ├── queue.ts          # Durable offline mutation queue stored in IndexedDB
│   │   ├── migrate.ts        # One-time migration of local records into Supabase cloud
│   │   └── seed.ts           # Demo data generator
│   ├── hooks/
│   │   ├── useAppLock.ts     # PIN lock timeout and verification logic
│   │   ├── useHaptics.ts     # Mobile vibration haptics trigger
│   │   ├── useInstallPrompt.ts # PWA beforeinstallprompt handler
│   │   ├── useMediaQuery.ts  # Responsive breakpoint listener
│   │   └── useRecurringAutoAdd.ts # Checks and generates due recurring expenses on app open
│   ├── pages/
│   │   ├── Dashboard.tsx     # Home tab (Quick entry, summary, search, transaction feed)
│   │   ├── People.tsx        # People tab (Contacts, You'll get, You owe, Settle up)
│   │   ├── Wallet.tsx        # Wallet tab (Payment methods breakdown, named credit cards)
│   │   ├── Stats.tsx         # Reports tab (Analytics, charts, who owes what, card dues)
│   │   ├── Settings.tsx      # Settings tab (Categories, recurring, PIN, export/import)
│   │   └── Login.tsx         # Email / Google authentication page
│   ├── store/
│   │   ├── data.ts           # Zustand store for entities (transactions, categories, budgets, recurrings)
│   │   ├── store.ts          # Zustand store for UI preferences (active month, theme, filters)
│   │   └── toast.ts          # Toast dispatch store
│   └── utils/
│       ├── calc.ts           # Math calculations, category suggestions
│       ├── contacts.ts       # Contact normalization (`contactKey`) and aggregation
│       ├── export.ts         # CSV and JSON backup exporters & JSON importer
│       ├── filters.ts        # Date and keyword filtering algorithms
│       ├── finance.ts        # Core financial rules, split calculations, balances, repayments
│       ├── format.ts         # Currency and date formatting utilities
│       ├── netSettlement.ts  # Balanced offset computation and batch generation
│       ├── quickEntry.ts     # NLP rule parser for text inputs
│       └── reminder.ts       # Scheduled daily expense reminders
├── supabase/
│   ├── schema.sql            # Base Postgres schema: tables, indexes, triggers, RLS
│   └── migrations/
│       ├── 20261011_finance.sql         # Adds `finance` jsonb column & validation triggers
│       ├── 20261012_editable_finance.sql# Allows safe editing of transactions with linked settlements
│       └── 20261013_net_settlement.sql  # Adds atomic RPC function `settle_contact`
```

---

## 3. Domain Models & Data Structures

### 3.1 Primary Entities (`src/db/types.ts`)

```typescript
export type PaymentMethod = "upi" | "cash" | "debit" | "credit" | "bank" | "unknown";

export interface SplitShare {
  id: string;        // Unique share ID (e.g. "me", "0", "person-1")
  name: string;      // Participant name
  amount: number;    // Assigned share amount (>= 0)
  isMe?: boolean;    // true if this share represents the user
}

export interface FinanceDetails {
  kind: "expense" | "lent" | "borrowed" | "split" | "settlement" | "card_payment";
  paymentMethod: PaymentMethod;
  cardName?: string;         // Required if paymentMethod === "credit" or kind === "card_payment" (e.g. "SBI", "HDFC")
  person?: string;           // Name of person for lent, borrowed, or settlement
  dueDate?: string;          // Optional due date ("YYYY-MM-DD")
  shares?: SplitShare[];     // Required if kind === "split"
  settlesId?: string;        // ID of the original transaction being repaid
  settlesShareId?: string;   // If settling a split, ID of the specific SplitShare
  direction?: "in" | "out";  // "in" = user receives money; "out" = user pays money
  netGroupId?: string;       // Groups all transactions in an atomic net settlement batch
  offset?: boolean;          // true if this is an automatic non-cash debt offset adjustment
}

export interface Transaction {
  id: string;                // UUID
  amount: number;            // Total amount paid/transferred (always > 0)
  note: string;              // Description (<= 200 chars)
  categoryId: string;        // Category UUID (or empty string for pure financial transfers)
  date: string;              // "YYYY-MM-DD" (local)
  time: string;              // "HH:mm" (local)
  createdAt: number;         // Epoch timestamp in ms
  recurringId?: string;      // Link to recurring_expenses.id if generated automatically
  finance?: FinanceDetails;  // Extended metadata for splits, loans, cards, settlements
}

export interface Category {
  id: string;                // UUID
  name: string;              // e.g. "Food", "Rent", "Travel"
  icon: string;              // Single emoji character
  color: string;             // Hex code (e.g. "#10b981")
  custom?: boolean;          // true if user-created
}

export interface Budget {
  month: string;             // "YYYY-MM" (e.g. "2026-10")
  amount: number;            // Monthly budget ceiling (>= 0)
}

export interface Recurring {
  id: string;                // UUID
  name: string;              // Bill title
  amount: number;            // Amount (> 0)
  categoryId: string;        // Associated category UUID
  day: number;               // Day of the month (1 to 28)
  lastRun: string;           // "YYYY-MM" of last generated occurrence
  active: boolean;           // Active or paused
}
```

---

## 4. Ledger & Accounting Engine Principles

SpendWise implements strict double-entry style guarantees to maintain absolute integrity:

### 4.1 Personal Expense vs. Gross Purchase
- **Gross Amount (`t.amount`):** The exact total money disbursed from the payment instrument at transaction time.
- **Personal Expense (`personalAmount(t)`):**
  - Standard expense (`kind: "expense"` or undefined): `t.amount`
  - Bill split (`kind: "split"`): **Only the share where `isMe === true`** counts toward the user's monthly spending and category totals.
  - Loans (`kind: "lent"` or `kind: "borrowed"`): **`0`**. A loan is an asset or liability transfer, never a consumption expense.
  - Settlements (`kind: "settlement"`): **`0`**. Paying or receiving a debt repayment changes cash balance and debt balance, not consumption.
  - Card bill payments (`kind: "card_payment"`): **`0`**. Paying a credit card bill reduces credit liability; counting it as an expense would double-count purchases made on credit.

### 4.2 Bill Splitting Logic
1. **Equal Split (`equalShares`):** Divides `totalAmount` across $N$ people. Any leftover paise (cents) are assigned 1 paise each to the first participants so $\sum \text{shares} = \text{totalAmount}$ exactly.
2. **Fixed + Rest / Auto Split (`mixedShares`):** Allows specific participants to have fixed amounts (e.g. Viraj pays ₹200, Kishon pays ₹200). The remaining amount is distributed equally among participants left on "Auto". If fixed shares exceed the bill total, the system throws an error.

### 4.3 Credit Card Reconciliation
- Every credit card transaction requires a `cardName` (e.g. "SBI", "HDFC").
- Total outstanding card balance for a card = $\sum (\text{All credit purchases with that cardName}) - \sum (\text{All card\_payment entries for that cardName})$.
- When the user pays the card bill:
  - `kind: "card_payment"`, `cardName: "SBI"`, `paymentMethod: "bank"` (or UPI/cash/debit).
  - This immediately reduces the SBI card due balance without creating an additional expense.

### 4.4 Debt & Repayment Invariants
- An outstanding balance entry (`Balance`) has:
  - `original`: original principal or split share.
  - `remaining`: $\text{original} - \sum \text{linked settlements}$.
  - `direction`: `"in"` (user lent money or paid split share for friend; user expects repayment) or `"out"` (user borrowed money; user owes repayment).
- **Edit Invariants:**
  - An entry cannot have its amount lowered below the sum of repayments already recorded against it.
  - An entry's date cannot be moved after the date of any recorded repayment.
  - An entry's lending direction cannot be changed without first deleting existing repayments.
  - Automatic balance adjustments (`offset === true`) cannot be edited individually.

---

## 5. Complete User Flows & Screen Specifications

```
                              ┌────────────────────────────────────────┐
                              │             App Open / Boot            │
                              └───────────────────┬────────────────────┘
                                                  │
                                   Is Supabase configured?
                                         ├── No ───► Boot Dexie (Local Mode)
                                         └── Yes ──► Check Supabase Session
                                                           │
                                             ┌─────────────┴─────────────┐
                                         Logged In                   Logged Out
                                             │                           │
                                             ▼                           ▼
                                      [Dashboard /]                 [/login]
```

---

### 5.1 Authentication & Boot Flow
- **Route:** `/login` (Protected routes wrapped with `<RequireAuth />`).
- **Modes:**
  1. **Cloud Mode:** Enabled when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are defined in `.env.local`.
     - Supports **Email + Password** (Sign Up / Sign In).
     - Supports **Google OAuth** (`supabase.auth.signInWithOAuth`). Handles redirects, scrubs `?code=` from URL, catches callback errors and presents descriptive error messages.
  2. **Local Mode:** If environment variables are absent, authentication is bypassed; app directly boots Dexie repository and mounts `/`.
- **Boot Sequence:**
  1. Initializes Auth state.
  2. Runs `checkReminder()` to check if a daily logging reminder needs to be shown.
  3. Preloads lazy route chunks (`Stats`, `Settings`, `People`, `Wallet`) during browser idle time (`requestIdleCallback`).
  4. Triggers `useRecurringAutoAdd()`: checks active recurring schedules; if current date $\ge$ scheduled day and hasn't run this month, automatically creates the expense transactions.
  5. If authenticated in cloud mode and IndexedDB contains legacy local data, displays `<MigrationPrompt />` to migrate data to Supabase.

---

### 5.2 Home / Dashboard Flow (`/`)

#### Layout & Components:
1. **Header:** Shows active month selector (`< YYYY-MM >`), Quick Today Jump button, Theme switch icon (One-tap Light $\leftrightarrow$ Dark toggle).
2. **Offline Status Pill:** Fixed pill at top right ("⚡ Offline, will sync") appears whenever `navigator.onLine === false`.
3. **Summary Card (`SummaryCard.tsx`):**
   - Displays **Total Spent** this month (calculated via `personalAmount`).
   - Displays **Monthly Budget** with progress bar (Green < 80%, Amber 80–100%, Red > 100%).
   - Displays **Remaining Balance** and **Daily Burn Rate** (Remaining budget / days left in month).
   - Tap "Set Budget" / budget amount to open the inline budget modification modal.
4. **Quick Entry Bar (`QuickEntry.tsx`):**
   - Single natural text input supporting typing or paste.
   - On submission: parses string via rule engine. If valid, instantly creates the transaction optimistically, clears input, and shows a toast with an **Undo** action button.
5. **Search & Filter Bar (`SearchBar.tsx`):**
   - Text filter (searches notes, person names, categories).
   - Category filter pills (All or specific category).
   - Date range selector (All month, Today, This week, Custom date range).
   - Sort selector (Newest first, Oldest first, Highest amount, Lowest amount).
6. **Transaction List (`TransactionList.tsx`):**
   - Grouped by date headers (e.g. "Today · 11 Oct 2026", "Yesterday", "08 Oct 2026").
   - Shows Category Icon, Title/Note, Payment Method tag (UPI, Cash, SBI cc, etc.), and Amount.
   - For splits: displays personal share and tags friend names.
   - For loans/settlements: displays directional badges ("Lent to...", "Borrowed from...", "Settlement").
   - **Interactions:**
     - Tap any transaction $\rightarrow$ opens `<EditDialog />` to modify details or delete.
7. **Floating Action Button (+):**
   - Fixed at bottom-right.
   - Tap opens `<InputPad />` bottom sheet.

---

### 5.3 Quick Entry (Hinglish / English NLP Engine)

The quick entry parser (`src/utils/quickEntry.ts`) operates locally without AI API dependencies:

| Input Text Example | Parsed Kind | Amount | Notes / Metadata | Payment Method |
|---|---|---|---|---|
| `chai 15` | `expense` | ₹15.00 | "chai" $\rightarrow$ Category: "Food" | UPI (default) |
| `auto 80 cash` | `expense` | ₹80.00 | "auto" $\rightarrow$ Category: "Transport" | Cash |
| `Burger King 173 SBI cc` | `expense` | ₹173.00 | "Burger King" $\rightarrow$ Category: "Food" | Credit (`cardName: "SBI"`) |
| `Rini take 300 dinner` | `split` | ₹300.00 | "dinner" $\rightarrow$ Shares: Me ₹0, Rini ₹300 | UPI |
| `maine Rini ko 400 diye udhaar` | `lent` | ₹400.00 | "Udhaar · Rini" (`person: "Rini"`) | UPI |
| `mujhe Rini ko 299 dene hain` | `borrowed` | ₹299.00 | "You owe · Rini" (`person: "Rini"`) | UPI |

**Parser Rules:**
- Rejects entries with 0 amounts or multiple distinct numbers to avoid ambiguity.
- Recognizes bank names: SBI, HDFC, ICICI, Axis, Kotak, Amex, HSBC, IDFC, YES Bank, Bank of Baroda, OneCard.
- Requires bank name whenever credit card is specified (`cc` / `credit card`).
- If category cannot be inferred from dictionary keywords, gracefully prompts user to add clarity or use the `+` form.

---

### 5.3.1 Smart Entry (LLM) Fallback Flow

When conversational entries cannot be parsed by local heuristics (e.g. complex Hinglish phrasing like *"arbaz se mujhe 200rs lene hai D mart ki shopping k"*), SpendWise uses an LLM-backed Edge Function fallback:

```
                      User submits QuickEntry text
                                  │
                                  ▼
                    Existing Local Rule Parser
                                  │
                 ┌────────────────┴────────────────┐
             Success                            Failure
                 │                                 │
                 ▼                                 ▼
         Instant Add & Toast          Online & Cloud & Enabled?
                                           ├── No ──► Show friendly error
                                           └── Yes ──► Call Edge Function (12s timeout)
                                                            │
                                                            ▼
                                                  Client Validation
                                                            │
                                            ┌───────────────┴───────────────┐
                                   High Confidence &              Lent / Borrowed / Split /
                                   Plain Expense?                 Ambiguous / Low Confidence?
                                           ├── Yes ──► Auto-Save            │
                                           └── No  ─────────────────────────▼
                                                                  [SmartEntryPreview Sheet]
                                                                  - Toggle alternatives
                                                                  - Explains spending impact
                                                                  - Tap Confirm / Edit / Cancel
```

1. **Rule-First Priority:**
   - The local rule engine always executes first. If it succeeds, the transaction saves immediately with zero network latency. The LLM is never called for simple expressions like `chai 15` or `Burger King 173 SBI cc`.
2. **Eligibility Guardrails:**
   - LLM fallback only executes if:
     - Device is online (`navigator.onLine`).
     - Supabase is configured (`cloudEnabled`).
     - "Smart entry (AI)" setting is enabled in user settings (`smartEntryEnabled`).
   - If offline or running local mode, AI hints are hidden and the standard error guidance is shown.
3. **Edge Function Architecture (`supabase/functions/parse-entry`):**
   - Authenticated caller JWT verification (`supabase.auth.getUser()`).
   - Strict rate limiting: max 50 calls/user/day tracked via PostgreSQL table `public.llm_usage` and `bump_llm_usage()`.
   - Provider-agnostic adapter supporting OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-haiku`), and Google Gemini (`gemini-3.5-flash-lite`).
   - Strict privacy: user text and API keys are never written to logs.
4. **Smart Entry Preview Sheet (`SmartEntryPreview.tsx`):**
   - Automatically opens for loans, splits, card payments, settlements, or ambiguous entries.
   - For ambiguous cases (e.g. *"Arbaz se 200 lene hain D-Mart ke"*), renders interactive segment toggles between interpretations (Lent ₹200 vs Split ₹200) with dynamic explainer text:
     - *Lent = not counted in your personal spending (debt to receive).*
     - *Split = your personal share counts in your spending.*
   - If person is new, highlights a **New contact** badge.
   - User can confirm, edit details inline, or tap **Edit in full form** to open the complete manual sheet.

---

### 5.4 People & Debt Management Flow (`/people`)

The People tab manages all social finance and peer-to-peer debts.

```
                                  [/people]
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
      [Contacts Tab]           [You'll get Tab]          [You owe Tab]
  (Combined Net Balances)     (Receivables only)       (Payables only)
            │
      Select Contact
            │
            ▼
    [Contact Detail]
    - Net Balance (Green/Red)
    - Full All-Time History
    - Settle Up Button ───────► Opens [NetSettlementSheet]
```

#### Key Architecture & Behavior:
- **No Month Filter:** Unlike Home and Wallet, People balances are **All-Time** because debt settlements frequently span across multiple months.
- **Contact Grouping:** Normalizes contact names ignoring case and multiple spaces (`contactKey("  Rini   Sen ") === "rini sen"`).
- **Three Main Tabs:**
  1. **Contacts:** Summary card for each person showing Net balance (Green: you receive; Red: you owe).
  2. **You'll get:** Chronological list of active and settled receivables (money lent + unpaid split shares). Filterable by Pending / Settled.
  3. **You owe:** Chronological list of active and settled payables (money borrowed). Filterable by Pending / Settled.
- **Contact Detail View:**
  - Breakdown: Total Lent, Total Borrowed, Split shares paid for them, Repayments received, Repayments paid.
  - Sub-tabs: **All activity** (all chronological loans, splits, repayments, and non-cash adjustments) and **Payments** (only real cash settlements).
  - Tap any past transaction to edit or delete.
  - Quick buttons: **"Settle Up"** and **"+ Add Entry"**.

---

### 5.5 Net Settlement Engine (Pay / Receive)

When the user taps **"Settle Up"** on a contact:

```
Example Scenario:
- User lent Rini: ₹1,000 (Receivable = ₹1,000)
- User borrowed from Rini: ₹200 (Payable = ₹200)
---------------------------------------------------
Net Balance: User should Receive ₹800 from Rini.
```

1. **Offset Calculation:**
   - $\text{Incoming} = ₹1,000$, $\text{Outgoing} = ₹200$.
   - $\text{Offset} = \min(1000, 200) = ₹200$.
   - $\text{Net} = 1000 - 200 = ₹800$.
2. **Transaction Batch Generation (`netSettlement.ts`):**
   - **Step A: Non-Cash Balance Adjustments:**
     - Generates 1 settlement transaction against the borrowed entry: Amount ₹200, `direction: "out"`, `offset: true`, `paymentMethod: "unknown"`.
     - Generates 1 settlement transaction against the lent entry: Amount ₹200, `direction: "in"`, `offset: true`, `paymentMethod: "unknown"`.
     - *Result:* Both debts are partially canceled out without any money changing hands.
   - **Step B: Actual Cash Settlement:**
     - Generates 1 settlement transaction for the remaining ₹800 against the lent entry: `direction: "in"`, `offset: false`, `paymentMethod: "upi"` (selected by user).
   - All generated records share a common `netGroupId: UUID`.
3. **Execution & Concurrency Safety:**
   - **Supabase Cloud:** Sent in a single RPC call to `settle_contact(p_rows)`. The Postgres function uses `FOR UPDATE` table row locks on parent transactions, verifies that adjustments balance ($\sum \text{in} = \sum \text{out}$), checks idempotency, and commits atomically.
   - **Dexie Local:** Wrapped in a Dexie table transaction.

---

### 5.6 Wallet & Payment Methods Flow (`/wallet`)

The Wallet screen reconciles payment methods and tracks credit card liability:

1. **Monthly Payment Method Cards:**
   - Breakdown of gross purchases for the selected month by instrument:
     - 📱 **UPI**
     - 💵 **Cash**
     - 💳 **Debit card**
     - 💳 **Credit card**
     - 🏦 **Bank transfer**
     - ❓ **Not recorded**
2. **Named Credit Cards Balances:**
   - Cards grouped by `cardName` (e.g. "SBI", "HDFC", "Axis").
   - Shows **All-Time Outstanding Dues** for each card:
     $$\text{Dues} = \sum \text{Purchases on Card} - \sum \text{Card Bill Repayments}$$
   - Includes a **"Record Card Bill Payment"** button:
     - Prompts for Amount paid, Payment method used to pay the bill (Bank / UPI / Debit), and Date.
     - Saves as `kind: "card_payment"`. Reduces the credit card dues immediately without inflating personal expenses.
3. **Drilldown History:**
   - Tapping any payment method or credit card opens its full history log, including individual expenses, repayments, and loans associated with that method.

---

### 5.7 Reports & Analytics Flow (`/stats`)

Provides insights and charts for any chosen month:
1. **Financial Overview Card:**
   - **Personal Spending:** Total net personal expenses.
   - **Gross Purchases:** Total money paid at point of sale (including friend split shares).
   - **You'll Get:** All-time outstanding receivables.
   - **You Owe:** All-time outstanding payables.
2. **Visual Charts:**
   - **Category Breakdown:** Interactive SVG donut/bar distribution of personal expenses by category.
   - **Daily Spending Chart:** Daily spend timeline showing daily spikes and low-spend days.
3. **"Who Owes What" Table:**
   - High-level list of each contact with non-zero balances.
   - Green balance indicates money they owe you; red indicates money you owe them.
   - Direct click-through links to the contact's page in the People tab.
4. **Card Dues & Recurring Schedule Summary:**
   - Summary of active recurring obligations due this month.
   - Current credit card liability snapshot.

---

### 5.8 Settings & Utilities Flow (`/settings`)

1. **Account Profile:** Displays signed-in email address, Cloud sync status, and "Sign Out" button.
2. **Appearance / Theme:**
   - Choose between **Light** (green tint), **Dark** (charcoal/black), or **System** mode.
3. **Custom Categories Manager:**
   - View default categories (Food, Shopping, Transport, Bills, Entertainment, Health, Other).
   - Add custom categories with custom name, emoji picker, and color picker.
   - Delete custom categories (reassigns or protects linked transactions).
4. **Recurring Bills Manager (`RecurringExpenses.tsx`):**
   - Create recurring schedules: Bill Name, Amount, Category, Day of Month (1–28), Active/Paused toggle.
   - Displays total monthly recurring commitment.
   - Automated runner runs silently on app open via `useRecurringAutoAdd`.
5. **Security & App Lock (`useAppLock.ts`):**
   - Set up an optional 4-digit PIN code.
   - When enabled, switching apps or refreshing prompts `<LockScreen />`.
6. **Data Portability (Export & Import):**
   - **Export CSV:** Exports full ledger with columns for Gross Amount, Personal Expense, Category, Date, Payment Method, Card, Person, and Type.
   - **Export JSON:** Full database snapshot (`Backup` schema) including transactions, categories, budgets, recurring rules, and preferences.
   - **Import JSON:** Restores full backup into local or cloud database.
7. **Demo Data & Database Reset:**
   - **Load Demo Data:** Seeds realistic expenses, splits, loans, and credit cards for testing.
   - **Clear All Data:** Confirmation dialog to wipe all transactions, budgets, and settings.

---

## 6. Offline Architecture, Queue & Sync Mechanics

```
┌────────────────────────────────────────────────────────────────────────┐
│                          User Action (UI Form)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                     Optimistic Update in Zustand Store
                     (UI updates in 0 milliseconds)
                                    │
                         Is Supabase Configured?
                                    │
                ┌───────────────────┴───────────────────┐
                ▼ No                                    ▼ Yes
        Write to Dexie DB                      Is device Online?
          (Done, local)                                 │
                                            ┌───────────┴───────────┐
                                            ▼ Yes                   ▼ No
                                     Write to Supabase       Enqueue Mutation
                                       via REST API          in IndexedDB Queue
                                            │                       │
                                            │                 When Online Event
                                            │                 Fires: Replay All
                                            │                       │
                                            ▼                       ▼
                                       ┌───────────────────────────────┐
                                       │ Supabase Realtime Publication │
                                       └───────────────┬───────────────┘
                                                       │
                                          Broadcasts to all devices
                                          and syncs Zustand state
```

### 6.1 Optimistic Updates & Rollback
When a transaction is created, updated, or deleted, `src/store/data.ts` immediately updates the in-memory Zustand store. If the network call subsequently fails and cannot be queued, the UI reverts to the previous snapshot and displays an error toast.

### 6.2 The Durable Write Queue (`src/db/queue.ts`)
- Stored in Dexie table `mutationQueue`.
- Each queue item contains: `id`, `type` (`"upsertExpense"`, `"deleteExpense"`, `"upsertCategory"`, etc.), `payload`, `timestamp`, `retryCount`.
- When `window.ononline` fires or the app comes into focus, `drainQueue()` iterates through pending mutations FIFO, transmitting them to Supabase.
- If an item fails due to a network glitch, it remains in the queue with exponential backoff.
- **Exception for Net Settlement:** Cloud net settlements require active connectivity because `settle_contact` executes transactional server-side locks. If offline, the UI instructs the user to reconnect.

---

## 7. Database Schema, RLS & Stored Procedures

### 7.1 PostgreSQL Schema (`supabase/schema.sql`)

```sql
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  icon       text not null default '📦',
  color      text not null default '#64748b',
  created_at timestamptz not null default now()
);

create table public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  note         text,
  category_id  uuid references public.categories (id) on delete set null,
  day_of_month int not null check (day_of_month between 1 and 28),
  active       boolean not null default true,
  last_run     date,
  created_at   timestamptz not null default now()
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  note         text check (note is null or char_length(note) <= 500),
  category_id  uuid references public.categories (id) on delete set null,
  recurring_id uuid references public.recurring_expenses (id) on delete set null,
  spent_at     timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finance      jsonb
);

create table public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month      date not null,
  amount     numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  currency   text not null default '₹',
  theme      text not null default 'system' check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);
```

### 7.2 Row Level Security (RLS)
Every table has RLS enabled with a strict policy:
```sql
create policy "own rows" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
Clients authenticate using the Supabase `anon` key; unauthorized access across different users is physically impossible at the Postgres engine level.

### 7.3 Stored Procedure: `settle_contact(p_rows jsonb)` (`20261013_net_settlement.sql`)
- Accepts a JSON array of settlement transactions.
- Locks parent debt rows using `SELECT ... FOR UPDATE` in a deterministic order to eliminate database deadlocks.
- Verifies that all transactions belong to the authenticated user and target the intended contact.
- Validates that non-cash offset adjustments equal each other ($\sum \text{Incoming Offsets} = \sum \text{Outgoing Offsets}$).
- Inserts settlement records atomically in a single Postgres transaction.

---

## 8. Validation Invariants & Safeguards

| Rule / Invariant | Validation Location | Enforcement Behavior |
|---|---|---|
| **Positive Amount** | Client (`validateExpenseInput`) & DB `CHECK (amount > 0)` | Throws error if $\le 0$ or non-numeric |
| **Max 2 Decimals** | Client (`money(n)`) & DB `round(amount, 2)` | Rejects arbitrary floating point fractions |
| **Max Note Length** | Client (capped at 200) & DB (capped at 500) | Truncates or blocks submission |
| **Split Conservation** | Client (`validateFinance`) & DB trigger | $\sum \text{shares} \equiv \text{amount}$. Rejects if any paise is missing or duplicated |
| **Unique Split Names** | Client & DB trigger | Participants in a split must each have unique names |
| **Self Included in Split** | Client & DB trigger | Exactly one share must have `isMe: true` |
| **Repayment Ceiling** | Client (`validateLedgerWrite`) & DB trigger | Repayments cannot exceed outstanding balance |
| **Repayment Date Constraint** | Client & DB trigger | Repayment date cannot be earlier than parent entry date |
| **Protected Principal** | Client & DB trigger | Cannot edit or delete parent entry below sum of recorded repayments |
| **Offset Integrity** | Client (`validateNetBatch`) & DB RPC | Balance offset adjustments must equal each other and use method `"unknown"` |

---

## 9. Developer & AI Agent Contribution Guidelines

When adding features or modifying code in this codebase:

1. **Never call Supabase or Dexie directly from UI components:**  
   Always go through `repo` (`src/db/repo.ts`) or Zustand store actions (`src/store/data.ts`).
2. **Preserve Accounting Isolation:**  
   When calculating personal monthly spending, always filter through `personalAmount(tx)`. Never sum raw `tx.amount` directly.
3. **Always use `money(n)` for currency math:**  
   Never do raw JavaScript float addition/subtraction (e.g. `0.1 + 0.2`) without rounding via `money(n)`.
4. **Use `contactKey(name)` for person names:**  
   Never compare contact names with strict `===`. Always normalize via `contactKey(name)` (`lower`, trim, collapse spaces).
5. **Testing Requirements:**  
   - Unit & ledger calculation tests: Vitest (`npm test`).
   - Repository & validation tests: `src/db/repo.test.ts`.
   - E2E flow tests: Playwright (`npm run e2e`).
6. **Migrations:**  
   If altering the database schema, place idempotent SQL scripts in `supabase/migrations/` and update `supabase/schema.sql`.

---
*End of SpendWise Application Flow and Feature Specification.*

