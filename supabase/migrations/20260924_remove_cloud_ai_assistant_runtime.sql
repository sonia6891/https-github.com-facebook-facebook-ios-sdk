drop function if exists public.meow_finalize_ai_usage(uuid,boolean,bigint,bigint);
drop function if exists public.meow_claim_ai_usage(uuid,text,integer,bigint);
drop function if exists public.meow_claim_ai_usage(uuid,text);
drop table if exists public.ai_global_usage_monthly;
drop table if exists public.ai_usage_monthly;
