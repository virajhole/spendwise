# Mobile finance update

The app uses a shared green theme, five bottom tabs, a keyboard-aware viewport and scrollable bottom sheets. No additional production dependencies are required.

## Cloud setup

Before deploying this version, run `supabase/migrations/20261011_finance.sql` in your project's SQL Editor. It adds the nullable `expenses.finance` JSONB column, validates split totals and repayments, and indexes repayment lookups. Existing Row Level Security still applies. For a new project, run `supabase/schema.sql` first.

The migration has been prepared locally; running the app does not apply SQL automatically. Local mode uses IndexedDB and needs no SQL. JSON exports/imports preserve the new metadata, and CSV exports include both gross amount and personal expense.

## Using the app

- Home: type `chai 15rs`, `auto 80 upi`, or `Arbaz ko 500 diye udhaar`. Clear supported text entries save directly, with Undo. Missing payment information stays “Not recorded”. Use **+** for an explicit category, date, or named credit card. This is a local text parser, not a microphone or AI service.
- People: add money lent/borrowed, or split a bill you paid. Equal splits distribute every paise; exact-amount splits must match the bill. Include yourself once. Record partial or full repayments against a specific person and bill. History allows correcting entries by deleting repayments before the original entry. Friends are names in your private ledger and do not receive invitations or messages.
- Wallet: compare monthly purchases by UPI, cash, debit, credit and bank. Name cards consistently to group them. Card repayments reduce outstanding recorded spending without counting as another expense. This is manual tracking, not bank sync or a bank statement.
- Reports: personal expense, gross purchases paid, all-time receivables/payables, payment breakdown, recurring bill schedules, recorded card dues, and category/daily charts. Use the month arrows to change the reporting month.

## Accounting example

A ₹1,000 credit-card dinner shared by you and four friends creates ₹200 personal expense, ₹800 receivable and ₹1,000 credit-card spending. A ₹75 repayment from Arbaz reduces his balance to ₹125. Paying ₹400 of the card bill leaves ₹600 recorded card dues; your personal expense remains ₹200.

## Performance

Home fetches the selected date range. People, Wallet and Reports share one lazily loaded full-history cache because outstanding balances span months. Range fetches are deduplicated, cloud settings load independently, and existing users no longer perform redundant default-category reads. IndexedDB date reads use the existing date index. Cloud ranges paginate beyond 1,000 records with deterministic ordering. Totals no longer animate with a JavaScript animation loop.

Full-history summaries are appropriate for a personal ledger; a very large multi-year dataset would benefit from database-side aggregates. Production latency improvements require measurement against the actual Supabase project.
