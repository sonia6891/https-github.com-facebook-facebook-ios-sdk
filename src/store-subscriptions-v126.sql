-- Store subscription entitlement support (v126)
-- Applied to Supabase project ygrlvmyqrhyfkglomsbq.

alter table public.user_entitlements
  drop constraint if exists user_entitlements_status_check;

alter table public.user_entitlements
  add constraint user_entitlements_status_check
  check (status = any (array[
    'active'::text,
    'trialing'::text,
    'grace_period'::text,
    'past_due'::text,
    'canceled'::text,
    'expired'::text
  ]));

create table if not exists public.store_subscription_events (
  event_id text primary key,
  platform text not null check (platform in ('app_store','google_play')),
  user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  subtype text null,
  product_id text null,
  transaction_id text null,
  original_transaction_id text null,
  environment text null,
  signed_at timestamptz null,
  expires_at timestamptz null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists store_subscription_events_user_idx
  on public.store_subscription_events(user_id, created_at desc);

create index if not exists store_subscription_events_original_tx_idx
  on public.store_subscription_events(original_transaction_id);

alter table public.store_subscription_events enable row level security;
revoke all on public.store_subscription_events from anon, authenticated;
