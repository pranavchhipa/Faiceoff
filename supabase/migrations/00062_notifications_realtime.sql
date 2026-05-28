-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00062: Enable realtime on the notifications table
--
-- Even though migration 00058 created the table + RLS, instant push to the
-- topbar bell requires the table to be part of the `supabase_realtime`
-- publication. Without this, NotificationBell's realtime subscription
-- silently never receives INSERTs and the user has to wait for the 20s
-- poll fallback — which is exactly what Pranav was hitting.
--
-- Idempotent: `add table` errors if the table is already in the publication,
-- so we guard with a quick check first.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end$$;
