drop policy if exists "deny client access to payslip ai usage" on public.payslip_ai_usage_monthly;
create policy "deny client access to payslip ai usage"
on public.payslip_ai_usage_monthly
for all
to anon, authenticated
using (false)
with check (false);
