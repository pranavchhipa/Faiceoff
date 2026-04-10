create table public.audit_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  actor_id uuid,
  actor_type text not null check (actor_type in ('user', 'system', 'admin')),
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_audit_log_actor_id on public.audit_log(actor_id);
create index idx_audit_log_action on public.audit_log(action);
create index idx_audit_log_created_at on public.audit_log(created_at desc);
create index idx_audit_log_resource on public.audit_log(resource_type, resource_id);

-- RLS: append-only table -- no update or delete policies
alter table public.audit_log enable row level security;
create policy "Admins can read audit log" on public.audit_log for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
-- Insert is handled via service role (server-side only), no client insert policy
