alter table public.ai_usage_monthly
  add column if not exists provider_input_tokens bigint not null default 0 check (provider_input_tokens >= 0),
  add column if not exists provider_output_tokens bigint not null default 0 check (provider_output_tokens >= 0),
  add column if not exists provider_success_calls integer not null default 0 check (provider_success_calls >= 0),
  add column if not exists provider_failed_calls integer not null default 0 check (provider_failed_calls >= 0);

create table if not exists public.ai_global_usage_monthly (
  month_start date primary key,
  assistant_calls integer not null default 0 check (assistant_calls >= 0),
  success_calls integer not null default 0 check (success_calls >= 0),
  failed_calls integer not null default 0 check (failed_calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_global_usage_monthly enable row level security;
revoke all on public.ai_global_usage_monthly from anon, authenticated;

drop function if exists public.meow_claim_ai_usage(uuid,text);
drop function if exists public.meow_claim_ai_usage(uuid,text,integer,bigint);

create function public.meow_claim_ai_usage(
  p_user_id uuid,
  p_mode text,
  p_global_limit integer default 10000,
  p_global_token_limit bigint default 50000000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', timezone('Asia/Taipei', now()))::date;
  v_user_limit integer := 20;
  v_user public.ai_usage_monthly%rowtype;
  v_global public.ai_global_usage_monthly%rowtype;
begin
  if p_user_id is null then
    raise exception 'missing_user' using errcode = '22023';
  end if;
  if p_mode <> 'assistant' then
    raise exception 'invalid_ai_mode' using errcode = '22023';
  end if;
  if p_global_limit < 1 or p_global_token_limit < 1 then
    raise exception 'invalid_global_limit' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown_user' using errcode = '22023';
  end if;

  insert into public.ai_usage_monthly(user_id, month_start)
  values (p_user_id, v_month)
  on conflict (user_id, month_start) do nothing;

  insert into public.ai_global_usage_monthly(month_start)
  values (v_month)
  on conflict (month_start) do nothing;

  select * into v_user
  from public.ai_usage_monthly
  where user_id=p_user_id and month_start=v_month
  for update;

  select * into v_global
  from public.ai_global_usage_monthly
  where month_start=v_month
  for update;

  if v_user.text_calls >= v_user_limit then
    return jsonb_build_object(
      'allowed',false,'reason','USER_LIMIT','month_start',v_month,
      'text_calls',v_user.text_calls,'text_limit',v_user_limit,'text_remaining',0,
      'global_calls',v_global.assistant_calls,'global_limit',p_global_limit
    );
  end if;

  if v_global.assistant_calls >= p_global_limit
     or (v_global.input_tokens + v_global.output_tokens) >= p_global_token_limit then
    return jsonb_build_object(
      'allowed',false,'reason','GLOBAL_LIMIT','month_start',v_month,
      'text_calls',v_user.text_calls,'text_limit',v_user_limit,
      'text_remaining',greatest(0,v_user_limit-v_user.text_calls),
      'global_calls',v_global.assistant_calls,'global_limit',p_global_limit,
      'global_tokens',v_global.input_tokens+v_global.output_tokens,
      'global_token_limit',p_global_token_limit
    );
  end if;

  update public.ai_usage_monthly
     set text_calls=text_calls+1,total_calls=total_calls+1,updated_at=now()
   where user_id=p_user_id and month_start=v_month
  returning * into v_user;

  update public.ai_global_usage_monthly
     set assistant_calls=assistant_calls+1,updated_at=now()
   where month_start=v_month
  returning * into v_global;

  return jsonb_build_object(
    'allowed',true,'reason','OK','month_start',v_month,
    'text_calls',v_user.text_calls,'text_limit',v_user_limit,
    'text_remaining',greatest(0,v_user_limit-v_user.text_calls),
    'global_calls',v_global.assistant_calls,'global_limit',p_global_limit,
    'global_remaining',greatest(0,p_global_limit-v_global.assistant_calls),
    'global_tokens',v_global.input_tokens+v_global.output_tokens,
    'global_token_limit',p_global_token_limit
  );
end;
$$;

revoke all on function public.meow_claim_ai_usage(uuid,text,integer,bigint) from public, anon, authenticated;
grant execute on function public.meow_claim_ai_usage(uuid,text,integer,bigint) to service_role;

create or replace function public.meow_finalize_ai_usage(
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
  v_in bigint := greatest(0,coalesce(p_input_tokens,0));
  v_out bigint := greatest(0,coalesce(p_output_tokens,0));
begin
  if p_user_id is null then
    raise exception 'missing_user' using errcode = '22023';
  end if;

  if p_success then
    update public.ai_usage_monthly
       set provider_success_calls=provider_success_calls+1,
           provider_input_tokens=provider_input_tokens+v_in,
           provider_output_tokens=provider_output_tokens+v_out,
           updated_at=now()
     where user_id=p_user_id and month_start=v_month;

    update public.ai_global_usage_monthly
       set success_calls=success_calls+1,
           input_tokens=input_tokens+v_in,
           output_tokens=output_tokens+v_out,
           updated_at=now()
     where month_start=v_month;
  else
    update public.ai_usage_monthly
       set text_calls=greatest(0,text_calls-1),
           total_calls=greatest(0,total_calls-1),
           provider_failed_calls=provider_failed_calls+1,
           provider_input_tokens=provider_input_tokens+v_in,
           provider_output_tokens=provider_output_tokens+v_out,
           updated_at=now()
     where user_id=p_user_id and month_start=v_month;

    update public.ai_global_usage_monthly
       set failed_calls=failed_calls+1,
           input_tokens=input_tokens+v_in,
           output_tokens=output_tokens+v_out,
           updated_at=now()
     where month_start=v_month;
  end if;
end;
$$;

revoke all on function public.meow_finalize_ai_usage(uuid,boolean,bigint,bigint) from public, anon, authenticated;
grant execute on function public.meow_finalize_ai_usage(uuid,boolean,bigint,bigint) to service_role;
