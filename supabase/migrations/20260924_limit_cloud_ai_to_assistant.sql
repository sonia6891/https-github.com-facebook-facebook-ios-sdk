create or replace function public.meow_claim_ai_usage(p_user_id uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', timezone('Asia/Taipei', now()))::date;
  v_limit integer := 20;
  v_row public.ai_usage_monthly%rowtype;
begin
  if p_user_id is null then
    raise exception 'missing_user' using errcode = '22023';
  end if;

  if p_mode <> 'assistant' then
    raise exception 'invalid_ai_mode' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown_user' using errcode = '22023';
  end if;

  insert into public.ai_usage_monthly(user_id, month_start)
  values (p_user_id, v_month)
  on conflict (user_id, month_start) do nothing;

  update public.ai_usage_monthly
     set text_calls=text_calls+1,total_calls=total_calls+1,updated_at=now()
   where user_id=p_user_id and month_start=v_month and text_calls<v_limit
  returning * into v_row;

  if not found then
    select * into v_row from public.ai_usage_monthly where user_id=p_user_id and month_start=v_month;
    return jsonb_build_object(
      'allowed',false,'month_start',v_month,
      'text_calls',coalesce(v_row.text_calls,0),'text_limit',v_limit,
      'text_remaining',greatest(0,v_limit-coalesce(v_row.text_calls,0)),
      'total_calls',coalesce(v_row.total_calls,0)
    );
  end if;

  return jsonb_build_object(
    'allowed',true,'month_start',v_month,
    'text_calls',v_row.text_calls,'text_limit',v_limit,
    'text_remaining',greatest(0,v_limit-v_row.text_calls),
    'total_calls',v_row.total_calls
  );
end;
$$;

revoke all on function public.meow_claim_ai_usage(uuid,text) from public, anon, authenticated;
grant execute on function public.meow_claim_ai_usage(uuid,text) to service_role;
