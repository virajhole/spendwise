-- Email delivery was replaced by user-initiated WhatsApp sharing.
drop trigger if exists notify_split_changes on public.expenses;
drop function if exists public.notify_split_changes();
