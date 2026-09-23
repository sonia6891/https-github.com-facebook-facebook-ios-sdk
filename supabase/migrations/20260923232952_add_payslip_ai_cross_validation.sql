create table if not exists public.payslip_ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  calls integer not null default 0 check (calls >= 0),
  success_calls integer not null default 0 check (success_calls >= 0),
  failed_calls integer not null default 0 check (failed_calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

alter table public.payslip_ai_usage_monthly enable row level security;
revoke all on table public.payslip_ai_usage_monthly from public, anon, authenticated;

create or replace function public.meow_claim_payslip_ai_usage(
  p_user_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', timezone('Asia/Taipei', now()))::date;
  v_row public.payslip_ai_usage_monthly%rowtype;
begin
  if p_user_id is null then raise exception 'missing_user' using errcode = '22023'; end if;
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_limit' using errcode = '22023'; end if;

  if not exists (
    select 1 from public.user_entitlements e
    where e.user_id = p_user_id
      and e.plan = 'pro'
      and e.status in ('active','trialing')
      and e.pro_until is not null
      and e.pro_until > now()
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'PRO_REQUIRED');
  end if;

  insert into public.payslip_ai_usage_monthly(user_id, month_start)
  values (p_user_id, v_month)
  on conflict (user_id, month_start) do nothing;

  update public.payslip_ai_usage_monthly
     set calls = calls + 1, updated_at = now()
   where user_id = p_user_id and month_start = v_month and calls < p_limit
  returning * into v_row;

  if not found then
    select * into v_row from public.payslip_ai_usage_monthly
     where user_id = p_user_id and month_start = v_month;
    return jsonb_build_object(
      'allowed', false, 'reason', 'MONTHLY_LIMIT',
      'calls', coalesce(v_row.calls,0), 'limit', p_limit, 'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', true, 'reason', 'OK',
    'calls', v_row.calls, 'limit', p_limit,
    'remaining', greatest(0, p_limit - v_row.calls)
  );
end;
$$;

revoke all on function public.meow_claim_payslip_ai_usage(uuid,integer) from public, anon, authenticated;
grant execute on function public.meow_claim_payslip_ai_usage(uuid,integer) to service_role;

create or replace function public.meow_finalize_payslip_ai_usage(
  p_user_id uuid,
  p_success boolean,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', timezone('Asia/Taipei', now()))::date;
begin
  if p_user_id is null then raise exception 'missing_user' using errcode = '22023'; end if;

  update public.payslip_ai_usage_monthly
     set success_calls = success_calls + case when p_success then 1 else 0 end,
         failed_calls = failed_calls + case when p_success then 0 else 1 end,
         input_tokens = input_tokens + greatest(0,coalesce(p_input_tokens,0)),
         output_tokens = output_tokens + greatest(0,coalesce(p_output_tokens,0)),
         updated_at = now()
   where user_id = p_user_id and month_start = v_month;
end;
$$;

revoke all on function public.meow_finalize_payslip_ai_usage(uuid,boolean,bigint,bigint) from public, anon, authenticated;
grant execute on function public.meow_finalize_payslip_ai_usage(uuid,boolean,bigint,bigint) to service_role;
