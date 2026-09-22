-- Preserve pre-paywall data for explicit owner-only recovery; never a live sync feed.
create table public.user_legacy_exports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  original_updated_at timestamptz not null,
  archived_at timestamptz not null default now()
);
alter table public.user_legacy_exports enable row level security;
revoke all on public.user_legacy_exports from public, anon, authenticated;
grant select on public.user_legacy_exports to authenticated;
grant all on public.user_legacy_exports to service_role;
create policy legacy_owner_read on public.user_legacy_exports for select to authenticated
  using ((select auth.uid()) = user_id);
insert into public.user_legacy_exports (user_id,payload,original_updated_at)
  select user_id,payload,updated_at from public.user_sync_state;

-- A restrictive policy cannot accidentally OR with another permissive policy.
revoke all on public.user_sync_state from public, anon, authenticated;
grant select, insert, update on public.user_sync_state to authenticated;
create policy sync_requires_live_pro on public.user_sync_state as restrictive
  for all to authenticated
  using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.user_entitlements e
      where e.user_id=(select auth.uid()) and e.plan='pro'
        and e.status in ('active','trialing')
        and e.pro_until is not null and isfinite(e.pro_until)
        and e.pro_until > statement_timestamp()
    )
  )
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.user_entitlements e
      where e.user_id=(select auth.uid()) and e.plan='pro'
        and e.status in ('active','trialing')
        and e.pro_until is not null and isfinite(e.pro_until)
        and e.pro_until > statement_timestamp()
    )
  );

-- Account metadata is available to every signed-in user; not work-data synchronization.
create function public.meow_account_access() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ent jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select jsonb_build_object('plan',e.plan,'status',e.status,'pro_until',e.pro_until,
    'trial_started_at',e.trial_started_at,'billing_provider',e.billing_provider,
    'provider_subscription_id',e.provider_subscription_id,
    'cancel_at_period_end',e.cancel_at_period_end,'canceled_at',e.canceled_at)
  into ent from public.user_entitlements e where e.user_id=auth.uid();
  return jsonb_build_object('server_now',clock_timestamp(),'entitlement',ent);
end $$;
revoke all on function public.meow_account_access() from public, anon;
grant execute on function public.meow_account_access() to authenticated;

-- Compare-and-swap avoids silently overwriting another device's newer snapshot.
create function public.meow_save_snapshot(p_payload jsonb, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); revision timestamptz; next_revision timestamptz; affected integer;
begin
  if uid is null or not exists (
    select 1 from public.user_entitlements e where e.user_id=uid and e.plan='pro'
      and e.status in ('active','trialing') and e.pro_until is not null
      and isfinite(e.pro_until) and e.pro_until>statement_timestamp()
  ) then raise exception 'pro_required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'state') is distinct from 'object'
     or pg_column_size(p_payload)>8388608 then
    raise exception 'invalid_snapshot' using errcode='22023';
  end if;
  select updated_at into revision from public.user_sync_state where user_id=uid for update;
  if found then
    if revision is distinct from p_expected_updated_at then
      raise exception 'sync_conflict' using errcode='40001';
    end if;
    next_revision:=greatest(clock_timestamp(),revision+interval '1 microsecond');
    update public.user_sync_state set payload=p_payload,updated_at=next_revision where user_id=uid;
  else
    if p_expected_updated_at is not null then raise exception 'sync_conflict' using errcode='40001'; end if;
    next_revision:=clock_timestamp();
    insert into public.user_sync_state (user_id,payload,updated_at) values(uid,p_payload,next_revision)
      on conflict (user_id) do nothing;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'sync_conflict' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('updated_at',next_revision);
end $$;
revoke all on function public.meow_save_snapshot(jsonb,timestamptz) from public,anon;
grant execute on function public.meow_save_snapshot(jsonb,timestamptz) to authenticated;
