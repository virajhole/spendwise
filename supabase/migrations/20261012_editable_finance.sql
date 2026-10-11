-- Run after 20261011_finance.sql. Enables safe edits to entries with repayments.
-- Existing rows retain finance=NULL (expense, payment method not recorded).
begin;
alter table public.expenses add column if not exists finance jsonb;

create or replace function public.validate_expense_finance()
returns trigger language plpgsql set search_path = '' as $$
declare
  f jsonb := new.finance;
  parent public.expenses%rowtype;
  share jsonb;
  total numeric := 0;
  own_count integer := 0;
  target numeric;
  repaid numeric;
  names text[] := '{}';
  ids text[] := '{}';
begin
  if new.amount <> round(new.amount, 2) then raise exception 'Amount must have at most two decimals'; end if;
  -- Keep existing payments valid while allowing names, amounts and metadata edits.
  if tg_op = 'UPDATE' then
    for share in select jsonb_build_object('shareId', e.finance->>'settlesShareId', 'direction', e.finance->>'direction', 'paid', sum(e.amount))
      from public.expenses e where e.user_id = new.user_id and e.finance->>'kind' = 'settlement' and e.finance->>'settlesId' = new.id::text
      group by e.finance->>'settlesShareId', e.finance->>'direction'
    loop
      target := null;
      if f->>'kind' in ('lent','borrowed') and share->>'shareId' is null then
        target := new.amount;
      elsif f->>'kind' = 'split' then
        select (value->>'amount')::numeric into target from jsonb_array_elements(f->'shares')
          where value->>'id' = share->>'shareId' and not coalesce((value->>'isMe')::boolean, false);
      end if;
      if target is null or share->>'direction' <> (case when f->>'kind' = 'borrowed' then 'out' else 'in' end) then
        raise exception 'Remove repayments before changing the direction or removing a repaid person';
      end if;
      if target < (share->>'paid')::numeric then raise exception 'Amount cannot be less than payments already recorded'; end if;
    end loop;
  end if;
  if f is null then return new; end if;
  if jsonb_typeof(f) <> 'object' or coalesce(f->>'kind', '') not in ('expense','lent','borrowed','split','settlement','card_payment') then raise exception 'Invalid entry type'; end if;
  if coalesce(f->>'paymentMethod', '') not in ('upi','cash','debit','credit','bank','unknown') then raise exception 'Invalid payment method'; end if;
  if (f->>'paymentMethod' = 'credit' or f->>'kind' = 'card_payment') and coalesce(trim(f->>'cardName'), '') = '' then raise exception 'Card name required'; end if;
  if f->>'kind' = 'card_payment' and f->>'paymentMethod' in ('credit','unknown') then raise exception 'Invalid card repayment method'; end if;
  if f->>'kind' in ('lent','borrowed') and coalesce(trim(f->>'person'), '') = '' then raise exception 'Person required'; end if;
  if f->>'kind' = 'split' then
    if jsonb_typeof(f->'shares') is distinct from 'array' then raise exception 'Split shares required'; end if;
    if jsonb_array_length(f->'shares') < 2 then raise exception 'Include yourself and a friend'; end if;
    for share in select value from jsonb_array_elements(f->'shares') loop
      if coalesce(trim(share->>'name'), '') = '' or coalesce(share->>'id','') = '' or jsonb_typeof(share->'amount') is distinct from 'number' then raise exception 'Invalid share'; end if;
      target := (share->>'amount')::numeric;
      if target < 0 or target <> round(target, 2) then raise exception 'Invalid share amount'; end if;
      if lower(trim(share->>'name')) = any(names) or share->>'id' = any(ids) then raise exception 'Duplicate participant'; end if;
      names := array_append(names, lower(trim(share->>'name')));
      ids := array_append(ids, share->>'id');
      total := total + target;
      if coalesce((share->>'isMe')::boolean, false) then own_count := own_count + 1; end if;
    end loop;
    if own_count <> 1 or total <> new.amount then raise exception 'Shares must include yourself once and equal the bill'; end if;
  end if;
  if f->>'kind' = 'settlement' then
    select * into parent from public.expenses e where e.id::text = f->>'settlesId' and e.user_id = new.user_id for update;
    if not found or parent.id = new.id then raise exception 'Original entry not found'; end if;
    if parent.finance->>'kind' = 'split' then
      select value into share from jsonb_array_elements(parent.finance->'shares') where value->>'id' = f->>'settlesShareId' and not coalesce((value->>'isMe')::boolean, false);
      if not found then raise exception 'Split participant not found'; end if;
      target := (share->>'amount')::numeric;
    elsif parent.finance->>'kind' in ('lent','borrowed') then
      if f->>'settlesShareId' is not null then raise exception 'Unexpected participant'; end if;
      target := parent.amount;
    else raise exception 'Entry cannot be settled';
    end if;
    if coalesce(f->>'direction','') <> (case when parent.finance->>'kind' = 'borrowed' then 'out' else 'in' end) then raise exception 'Invalid repayment direction'; end if;
    select coalesce(sum(e.amount),0) into repaid from public.expenses e where e.user_id = new.user_id and e.id <> new.id and e.finance->>'kind' = 'settlement' and e.finance->>'settlesId' = parent.id::text and coalesce(e.finance->>'settlesShareId','') = coalesce(f->>'settlesShareId','');
    if repaid + new.amount > target then raise exception 'Repayment exceeds outstanding balance'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists expenses_validate_finance on public.expenses;
create trigger expenses_validate_finance before insert or update on public.expenses for each row execute function public.validate_expense_finance();

-- Keep repayments linked on deletion, including bulk clear operations.
create or replace function public.delete_expense_repayments()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.expenses where user_id = old.user_id and finance->>'settlesId' = old.id::text;
  return old;
end;
$$;
drop trigger if exists expenses_delete_repayments on public.expenses;
create trigger expenses_delete_repayments after delete on public.expenses for each row execute function public.delete_expense_repayments();
create index if not exists expenses_settlement_parent_idx on public.expenses (user_id, (finance->>'settlesId')) where finance->>'kind' = 'settlement';
notify pgrst, 'reload schema';
commit;
