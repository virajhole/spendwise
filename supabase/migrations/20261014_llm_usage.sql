-- 20261014_llm_usage.sql
-- Rate limit tracking for LLM Smart Entry (max 50 requests per user per day).
begin;

create table if not exists public.llm_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null default current_date,
  count      int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.llm_usage enable row level security;

drop policy if exists "own llm_usage" on public.llm_usage;
create policy "own llm_usage" on public.llm_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomic increment function returning the updated count.
create or replace function public.bump_llm_usage()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := current_date;
  new_count int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.llm_usage (user_id, day, count)
  values (uid, today, 1)
  on conflict (user_id, day)
  do update set count = public.llm_usage.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.bump_llm_usage() from public;
grant execute on function public.bump_llm_usage() to authenticated;

commit;

