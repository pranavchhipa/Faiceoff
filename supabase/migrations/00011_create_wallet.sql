-- Wallet transactions
create table public.wallet_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'topup', 'escrow_lock', 'escrow_release', 'payout', 'refund', 'commission'
  )),
  amount_paise integer not null,
  direction text not null check (direction in ('credit', 'debit')),
  reference_id text,
  reference_type text,
  balance_after_paise integer not null,
  description text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_wallet_transactions_user_id_created on public.wallet_transactions(user_id, created_at desc);
create index idx_wallet_transactions_reference on public.wallet_transactions(reference_id) where reference_id is not null;

-- RLS
alter table public.wallet_transactions enable row level security;
create policy "Users can read own transactions" on public.wallet_transactions for select using (user_id = auth.uid());
create policy "Admins can read all transactions" on public.wallet_transactions for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Disputes
create table public.disputes (
  id uuid primary key default extensions.uuid_generate_v4(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  raised_by uuid not null references public.users(id) on delete cascade,
  reason text not null,
  status text not null check (status in (
    'open', 'investigating', 'resolved_refund', 'resolved_no_action', 'closed'
  )) default 'open',
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_disputes_generation_id on public.disputes(generation_id);
create index idx_disputes_raised_by on public.disputes(raised_by);
create index idx_disputes_status on public.disputes(status);

-- RLS
alter table public.disputes enable row level security;
create policy "Users can read disputes they raised" on public.disputes for select using (raised_by = auth.uid());
create policy "Users can read disputes on their generations" on public.disputes for select using (
  generation_id in (
    select g.id from public.generations g
    join public.creators c on c.id = g.creator_id
    where c.user_id = auth.uid()
    union
    select g.id from public.generations g
    join public.brands b on b.id = g.brand_id
    where b.user_id = auth.uid()
  )
);
create policy "Users can insert disputes" on public.disputes for insert with check (raised_by = auth.uid());
create policy "Admins can read all disputes" on public.disputes for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
create policy "Admins can update all disputes" on public.disputes for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_disputes_updated
  before update on public.disputes
  for each row execute function public.handle_updated_at();
