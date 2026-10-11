-- Run after 20261012_editable_finance.sql. One atomic, idempotent contact settlement.
begin;
create or replace function public.settle_contact(p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  f jsonb;
  group_id text;
  person_name text;
  parent public.expenses%rowtype;
  existing public.expenses%rowtype;
  target_name text;
  incoming numeric := 0;
  outgoing numeric := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to settle up'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Invalid settlement'; end if;
  group_id := p_rows->0->'finance'->>'netGroupId';
  person_name := lower(regexp_replace(trim(p_rows->0->'finance'->>'person'), '\s+', ' ', 'g'));
  if coalesce(group_id, '') = '' or coalesce(person_name, '') = '' then raise exception 'Contact required'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then raise exception 'Duplicate payment IDs'; end if;
  -- Lock all original entries in a stable order before checking or writing payments.
  perform e.id from public.expenses e where e.user_id = auth.uid() and e.id::text in
    (select value->'finance'->>'settlesId' from jsonb_array_elements(p_rows)) order by e.id for update;
  for item in select value from jsonb_array_elements(p_rows) loop
    f := item->'finance';
    if coalesce(f->>'kind','') <> 'settlement' or f->>'netGroupId' is distinct from group_id
      or lower(regexp_replace(trim(f->>'person'), '\s+', ' ', 'g')) is distinct from person_name then raise exception 'Invalid contact settlement'; end if;
    select * into parent from public.expenses where user_id = auth.uid() and id::text = f->>'settlesId';
    if not found then raise exception 'Original entry not found'; end if;
    if parent.finance->>'kind' = 'split' then
      select value->>'name' into target_name from jsonb_array_elements(parent.finance->'shares') where value->>'id' = f->>'settlesShareId';
    else target_name := parent.finance->>'person'; end if;
    if lower(regexp_replace(trim(target_name), '\s+', ' ', 'g')) is distinct from person_name then raise exception 'Contact changed; reopen settlement'; end if;
    if coalesce((f->>'offset')::boolean, false) then
      if f->>'paymentMethod' <> 'unknown' then raise exception 'Adjustment cannot move money'; end if;
      if f->>'direction' = 'in' then incoming := incoming + (item->>'amount')::numeric;
      else outgoing := outgoing + (item->>'amount')::numeric; end if;
    elsif f->>'paymentMethod' not in ('upi','cash','debit','bank') then raise exception 'Choose a payment method'; end if;
  end loop;
  if incoming <> outgoing then raise exception 'Adjustments must balance'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    select * into existing from public.expenses where id = (item->>'id')::uuid and user_id = auth.uid();
    if found then
      if existing.amount <> (item->>'amount')::numeric or existing.finance is distinct from item->'finance' then raise exception 'Payment changed; refresh your contact'; end if;
      continue;
    end if;
    insert into public.expenses(id, user_id, amount, note, category_id, spent_at, created_at, finance)
      values ((item->>'id')::uuid, auth.uid(), (item->>'amount')::numeric, item->>'note', null, (item->>'spent_at')::timestamptz, (item->>'created_at')::timestamptz, item->'finance');
  end loop;
end;
$$;
revoke all on function public.settle_contact(jsonb) from public;
grant execute on function public.settle_contact(jsonb) to authenticated;

-- Deferred check also protects adjustments restored through JSON import.
create or replace function public.check_contact_offsets()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare group_id text; owner_id uuid; difference numeric;
begin
  if tg_op = 'UPDATE' and coalesce((old.finance->>'offset')::boolean, false) and
    (new.amount <> old.amount or new.finance is distinct from old.finance) then raise exception 'Automatic adjustments cannot be edited individually'; end if;
  if tg_op = 'DELETE' then group_id := old.finance->>'netGroupId'; owner_id := old.user_id;
  else group_id := new.finance->>'netGroupId'; owner_id := new.user_id; end if;
  if group_id is not null then
    select coalesce(sum(case when finance->>'direction' = 'in' then amount else -amount end),0) into difference
      from public.expenses where user_id = owner_id and finance->>'netGroupId' = group_id and coalesce((finance->>'offset')::boolean,false);
    if difference <> 0 then raise exception 'Automatic adjustments must remain balanced'; end if;
  end if;
  return null;
end;
$$;
drop trigger if exists expenses_check_contact_offsets on public.expenses;
create constraint trigger expenses_check_contact_offsets after insert or update or delete on public.expenses
  deferrable initially deferred for each row execute function public.check_contact_offsets();
create index if not exists expenses_net_group_idx on public.expenses(user_id, (finance->>'netGroupId')) where finance->>'netGroupId' is not null;
notify pgrst, 'reload schema';
commit;
