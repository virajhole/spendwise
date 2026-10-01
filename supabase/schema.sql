-- ============================================================
-- SpendWise — Supabase schema
-- Paste this whole file into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run: everything is idempotent (IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- gen_random_uuid() (pgcrypto is pre-installed on Supabase; this is a no-op safety net)
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  icon       text not null default '📦',
  color      text not null default '#64748b',
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  note         text check (note is null or char_length(note) <= 500),
  category_id  uuid references public.categories (id) on delete set null,
  recurring_id uuid references public.recurring_expenses (id) on delete set null,
  spent_at     timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.budgets (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month   date not null, -- always the FIRST day of the month, e.g. 2026-10-01
  amount  numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  note         text, -- the recurring's display name (e.g. "Monthly rent")
  category_id  uuid references public.categories (id) on delete set null,
  day_of_month int not null check (day_of_month between 1 and 28),
  active       boolean not null default true,
  last_run     date, -- first day of the last month the rule was auto-applied
  created_at   timestamptz not null default now()
);

create table if not exists public.settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  currency   text not null default '₹',
  theme      text not null default 'system' check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Indexes
-- ------------------------------------------------------------

create index if not exists expenses_user_spent_at_idx  on public.expenses (user_id, spent_at desc);
create index if not exists expenses_user_category_idx  on public.expenses (user_id, category_id);
create index if not exists budgets_user_month_idx      on public.budgets (user_id, month);
create index if not exists categories_user_idx         on public.categories (user_id);
create index if not exists recurring_user_idx          on public.recurring_expenses (user_id);

-- ------------------------------------------------------------
-- 3. updated_at trigger (keeps updated_at current automatically)
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. Row Level Security — users can only touch their own rows
--    (user_id = auth.uid()). The anon key is useless without a
--    session; never expose the service_role key in the frontend.
-- ------------------------------------------------------------

alter table public.categories         enable row level security;
alter table public.expenses           enable row level security;
alter table public.budgets            enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.settings           enable row level security;

-- One FOR ALL policy per table covers select + insert + update + delete.
drop policy if exists "own rows" on public.categories;
create policy "own rows" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.expenses;
create policy "own rows" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.budgets;
create policy "own rows" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.recurring_expenses;
create policy "own rows" on public.recurring_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.settings;
create policy "own rows" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5. Realtime — stream expense changes so other devices update live.
--    (Requires the table to be in the supabase_realtime publication.
--     RLS still applies: subscribers only receive their own rows.)
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;
