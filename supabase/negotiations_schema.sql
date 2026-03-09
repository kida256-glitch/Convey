-- Convey negotiation realtime schema
-- Run this once in the Supabase SQL editor for your project.

create table if not exists public.negotiations (
  id text primary key,
  listing_id bigint not null,
  on_chain_listing_id bigint,
  buyer_address text not null,
  seller_address text not null,
  status text not null check (status in ('open', 'countered', 'accepted', 'rejected')),
  current_offer numeric not null default 0,
  messages jsonb not null default '[]'::jsonb,
  on_chain_offer_id bigint,
  payment_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
    id text primary key,
    negotiation_id text not null references public.negotiations (id) on delete cascade,
    for_role text not null check (
        for_role in ('buyer', 'seller')
    ),
    preview text not null,
    read boolean not null default false,
    timestamp bigint not null,
    created_at timestamptz not null default now()
);

create table if not exists public.purchases (
    id text primary key,
    negotiation_id text not null references public.negotiations (id) on delete cascade,
    listing_id bigint not null,
    buyer_address text not null,
    seller_address text not null,
    amount numeric not null,
    completed_at bigint not null,
    tx_hash text,
    created_at timestamptz not null default now()
);

create index if not exists idx_negotiations_seller_address on public.negotiations (seller_address);

create index if not exists idx_negotiations_buyer_address on public.negotiations (buyer_address);

create index if not exists idx_notifications_negotiation on public.notifications (negotiation_id);

create index if not exists idx_purchases_negotiation on public.purchases (negotiation_id);

alter table public.negotiations enable row level security;

alter table public.notifications enable row level security;

alter table public.purchases enable row level security;

-- Demo-friendly policies for anon client usage.
drop policy if exists negotiations_public_rw on public.negotiations;

create policy negotiations_public_rw on public.negotiations for all to anon,
authenticated using (true)
with
    check (true);

drop policy if exists notifications_public_rw on public.notifications;

create policy notifications_public_rw on public.notifications for all to anon,
authenticated using (true)
with
    check (true);

drop policy if exists purchases_public_rw on public.purchases;

create policy purchases_public_rw on public.purchases for all to anon,
authenticated using (true)
with
    check (true);

-- Keep updated_at current on every negotiations update.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_negotiations_set_updated_at on public.negotiations;

create trigger trg_negotiations_set_updated_at
before update on public.negotiations
for each row execute function public.set_updated_at();