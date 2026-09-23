create table if not exists public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  image_calls integer not null default 0 check (image_calls >= 0),
  text_calls integer not null default 0 check (text_calls >= 0),
  total_calls integer not null default 0 check (total_calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

alter table public.ai_usage_monthly enable row level security;

drop policy if exists "users_read_own_ai_usage" on public.ai_usage_monthly;
create policy "users_read_own_ai_usage"
on public.ai_usage_monthly
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.ai_usage_monthly from anon, authenticated;
grant select on public.ai_usage_monthly to authenticated;

create or replace function public.meow_claim_ai_usage(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_month date := date_trunc('month', timezone('Asia/Taipei', now()))::date;
  v_image boolean := p_mode in ('schedule_scan','payslip_scan');
  v_image_limit integer := 12;
  v_text_limit integer := 100;
  v_row public.ai_usage_monthly%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_mode not in ('schedule_scan','payslip_scan','reconcile_explain','salary_forecast_explain','anomaly_scan','assistant') then
    raise exception 'invalid_ai_mode' using errcode = '22023';
  end if;

  insert into public.ai_usage_monthly(user_id, month_start)
  values (v_uid, v_month)
  on conflict (user_id, month_start) do nothing;

  if v_image then
    update public.ai_usage_monthly
       set image_calls=image_calls+1,total_calls=total_calls+1,updated_at=now()
     where user_id=v_uid and month_start=v_month and image_calls<v_image_limit
    returning * into v_row;
  else
    update public.ai_usage_monthly
       set text_calls=text_calls+1,total_calls=total_calls+1,updated_at=now()
     where user_id=v_uid and month_start=v_month and text_calls<v_text_limit
    returning * into v_row;
  end if;

  if not found then
    select * into v_row from public.ai_usage_monthly where user_id=v_uid and month_start=v_month;
    return jsonb_build_object(
      'allowed',false,'month_start',v_month,
      'image_calls',coalesce(v_row.image_calls,0),'image_limit',v_image_limit,
      'text_calls',coalesce(v_row.text_calls,0),'text_limit',v_text_limit,
      'total_calls',coalesce(v_row.total_calls,0)
    );
  end if;

  return jsonb_build_object(
    'allowed',true,'month_start',v_month,
    'image_calls',v_row.image_calls,'image_limit',v_image_limit,'image_remaining',greatest(0,v_image_limit-v_row.image_calls),
    'text_calls',v_row.text_calls,'text_limit',v_text_limit,'text_remaining',greatest(0,v_text_limit-v_row.text_calls),
    'total_calls',v_row.total_calls
  );
end;
$$;

revoke all on function public.meow_claim_ai_usage(text) from public, anon;
grant execute on function public.meow_claim_ai_usage(text) to authenticated;
