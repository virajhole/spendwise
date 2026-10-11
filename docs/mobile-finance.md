# SpendWise feature and accounting guide

The app has five bottom tabs, a green light theme, black/charcoal dark surfaces, a keyboard-aware viewport and scrollable bottom sheets. The header theme button changes the visible light/dark appearance with a single tap; System remains available in Settings. Home, Wallet and Reports retain month navigation. People uses all-time balances and has no header month switcher. No additional production dependencies are required.

## Cloud setup

For a new Supabase project, run `supabase/schema.sql` first. Then apply missing migrations in this order:

1. `supabase/migrations/20261011_finance.sql` — payment/ledger metadata and repayment validation.
2. `supabase/migrations/20261012_editable_finance.sql` — safe edits to entries with existing repayments.
3. `supabase/migrations/20261013_net_settlement.sql` — atomic, idempotent contact settlement and balanced adjustments.

Existing Row Level Security applies. Skip migrations already applied to your project.

These migrations are source files; running the app does not apply SQL automatically. Local mode uses IndexedDB and needs no SQL. JSON exports/imports preserve the new metadata, and CSV exports include both gross amount and personal expense.

## Using the app

- Home: type `chai 15rs`, `auto 80 upi`, `Burger King 173 rs credit card SBI se`, `Rini take 300 dinner add in cc SBI`, or `maine Rini ko 400 diye udhhar`. A friend’s stated dinner share is recorded as a split and a receivable; a cash loan is recorded in People. Text entries default to UPI and save directly, with Undo. Older expenses keep “Not recorded”. Use **+** for an explicit category, date, or named credit card. Chat understands common Hinglish and English patterns locally; it does not call a microphone or AI service.
- People: add money lent/borrowed, or split a bill you paid. Equal splits distribute every paise; exact-amount splits must match the bill. **Fixed + rest** divides the remainder among blank/Auto shares; enter 0 for anyone excluded (including Me). For a ₹1,000 bill, Viraj ₹200 and Kishon ₹200 leave ₹600 for the Auto participants. Include yourself once. Record partial or full repayments against a specific person and bill. Tap **You’ll get** or **You owe** for the corresponding dated list; filter by entry date and Pending/Settled/All. Edit names, amount, category, date, payment method and lending/borrowing direction from each card or history. Repayments remain linked when names or amounts change. An amount cannot fall below recorded repayments; reverse the direction only after removing mistaken repayments. Repayments themselves can also be edited from history. Friends are names in your private ledger and do not receive invitations or messages.
- Settings: recurring schedules have editable name, amount, category, day and active state, plus a monthly active total. Edits preserve the last-run marker and do not rewrite expenses already generated. Currency selection has been removed.
- Wallet: compare monthly purchases by UPI, cash, debit, credit and bank. Name cards consistently to group them. Card repayments reduce outstanding recorded spending without counting as another expense. This is manual tracking, not bank sync or a bank statement.
- Reports: one net row per person in “Who owes what”, linking directly to the contact, plus personal expense, gross purchases paid, all-time receivables/payables, payment breakdown, recurring bill schedules, recorded card dues, and category/daily charts. Use the month arrows to change the reporting month.

## Accounting example

A ₹1,000 credit-card dinner shared by you and four friends creates ₹200 personal expense, ₹800 receivable and ₹1,000 credit-card spending. A ₹75 repayment from Arbaz reduces his balance to ₹125. Paying ₹400 of the card bill leaves ₹600 recorded card dues; your personal expense remains ₹200.

## Performance

Home fetches the selected date range. People, Wallet and Reports share one lazily loaded full-history cache because outstanding balances span months. Range fetches are deduplicated, cloud settings load independently, and existing users no longer perform redundant default-category reads. IndexedDB date reads use the existing date index. Cloud ranges paginate beyond 1,000 records with deterministic ordering. Totals no longer animate with a JavaScript animation loop.

Full-history summaries are appropriate for a personal ledger; a very large multi-year dataset would benefit from database-side aggregates. Production latency improvements require measurement against the actual Supabase project.

## Chat: money you owe

`mujhe Rini ko 299 dene hain`, `Rini ko 299 dena hai`, and `I owe Rini 299` create a ₹299 payable (You owe), defaulting to UPI. `Rini take 300 dinner` means you already paid ₹300 for Rini, so Rini owes you. Adding `cc SBI` or `SBI cc` uses the SBI credit card. Use People → Record payment when settling an existing balance.

## Person contacts

People opens in Contacts by default and groups each person’s lending, borrowing, split shares and linked repayments into one searchable contact. Names match ignoring case and repeated spaces; different spellings remain separate and can be corrected through entry editing. Green balances mean money to receive; red balances mean money to pay. A single contact row combines all entries with the same normalized name. Each contact shows all-time lent, borrowed, split shares, repayments received/paid, gross outstanding in both directions and the net difference. The displayed net changes no transactions until you use Pay/Receive to confirm a net settlement. The Payments tab shows actual repayments; All activity also shows automatic adjustments. Breakdown and filters are expandable. Transaction type/date filters affect history only; summary totals stay all-time. Tap a transaction to edit it, record a payment against its original balance, or add a new prefilled loan/split. Contacts are derived from existing records, so no additional database migration is needed.

## Net settlement

Run `supabase/migrations/20261013_net_settlement.sql` after the earlier finance migrations to enable the cloud Settle up button. This migration is prepared locally, not applied automatically. People → Contacts now offers Pay/Receive for the net amount. A 1,000 payable and 200 receivable create matching 200 non-cash adjustments plus one actual 800 payment. Partial payments are supported; equal opposing balances can settle without cash. Adjustments appear in All activity, are excluded from Payments and actual paid/received totals, and cannot be edited independently. The original entries remain intact. Payment portions can still be edited using the existing repayment editor. All allocations are saved atomically, with stable IDs for retries. Local mode works offline; cloud net settlement needs connectivity and existing queued writes must finish first. The app records money already paid and does not transfer funds.

## Wallet history

Tap a named card to see all-time credit entries and bill repayments for that card. Tap UPI, Cash, Credit card, Debit card, Bank transfer or Not recorded for transactions using that method. Date filters narrow the history. Method spending totals remain monthly purchases only; history also includes loans and repayments. Card bill repayments appear both under the destination card and their actual funding method. Automatic non-cash balance adjustments are excluded.
