create or replace function public.meow_claim_ai_usage(p_user_id uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', timezone('Asia/Taipei', now()))::date;
  v_image boolean := p_mode = 'payslip_scan';
  v_image_limit integer := 12;
  v_text_limit integer := 100;
  v_row public.ai_usage_monthly%rowtype;
begin
  if p_user_id is null then
    raise exception 'missing_user' using errcode = '22023';
  end if;

  if p_mode not in ('payslip_scan','reconcile_explain','salary_forecast_explain','anomaly_scan','assistant') then
    raise exception 'invalid_ai_mode' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown_user' using errcode = '22023';
  end if;

  insert into public.ai_usage_monthly(user_id, month_start)
  values (p_user_id, v_month)
  on conflict (user_id, month_start) do nothing;

  if v_image then
    update public.ai_usage_monthly
       set image_calls=image_calls+1,total_calls=total_calls+1,updated_at=now()
     where user_id=p_user_id and month_start=v_month and image_calls<v_image_limit
    returning * into v_row;
  else
    update public.ai_usage_monthly
       set text_calls=text_calls+1,total_calls=total_calls+1,updated_at=now()
     where user_id=p_user_id and month_start=v_month and text_calls<v_text_limit
    returning * into v_row;
  end if;

  if not found then
    select * into v_row from public.ai_usage_monthly where user_id=p_user_id and month_start=v_month;
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

revoke all on function public.meow_claim_ai_usage(uuid,text) from public, anon, authenticated;
grant execute on function public.meow_claim_ai_usage(uuid,text) to service_role;
