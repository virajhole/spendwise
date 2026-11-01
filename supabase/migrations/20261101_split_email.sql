-- Create Vault secrets split_email_key (Resend API key) and split_email_from
-- (verified sender address) to enable delivery. Requests run after commit.
create extension if not exists pg_net;
create or replace function public.notify_split_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb := '[]';
  current_shares jsonb := '[]';
  change record;
  api_key text;
  sender text;
  message text;
begin
  if tg_op <> 'INSERT' and old.finance->>'kind' = 'split' then
    previous := old.finance->'shares';
  end if;
  if tg_op <> 'DELETE' and new.finance->>'kind' = 'split' then
    current_shares := new.finance->'shares';
  end if;
  if previous = current_shares then return null; end if;
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'split_email_key';
  select decrypted_secret into sender from vault.decrypted_secrets where name = 'split_email_from';
  if api_key is null or sender is null then return null; end if;
  for change in
    with before_change as (
      select s->>'id' id, lower(trim(s->>'email')) email, (s->>'amount')::numeric amount
      from jsonb_array_elements(previous) s where not coalesce((s->>'isMe')::boolean,false)
    ), after_change as (
      select s->>'id' id, lower(trim(s->>'email')) email, (s->>'amount')::numeric amount
      from jsonb_array_elements(current_shares) s where not coalesce((s->>'isMe')::boolean,false)
    )
    select coalesce(a.email,b.email) email, b.amount was, a.amount now_amount
    from before_change b full join after_change a using (id,email)
    where b.amount is distinct from a.amount
  loop
    if change.email is null or change.email !~ '^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$' then continue; end if;
    message := case when change.now_amount is null then 'Your share of ' || change.was || ' was removed.'
      when change.was is null then 'Your share is ' || change.now_amount || '.'
      else 'Your share changed from ' || change.was || ' to ' || change.now_amount || '.' end;
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization','Bearer ' || api_key,'Content-Type','application/json'),
      body := jsonb_build_object('from',sender,'to',jsonb_build_array(change.email),
        'subject','Split bill update','text',message || E'\nBill: ' || coalesce(new.note,old.note,'Shared bill'))
    );
  end loop;
  return null;
end;
$$;
revoke all on function public.notify_split_changes() from public, anon, authenticated;
drop trigger if exists notify_split_changes on public.expenses;
create trigger notify_split_changes after insert or update or delete on public.expenses
for each row execute function public.notify_split_changes();
