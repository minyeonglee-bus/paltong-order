-- Payroll app ↔ rider app (owner 2026-11-09: "페이롤에서 인 누르면 자동으로 기사앱 켜지고 아웃하면 꺼지게").
-- The payroll database (MONEY TRACKER) calls this through pg_net after a rider clocks in / out
-- (paltong-payroll: supabase/pr_rider_duty.sql). It is guarded by a shared secret: only its SHA-256 is stored here,
-- the secret itself lives in the payroll project's Vault ('rider_duty_secret').
-- Rider match: same phone (pr_employees.info.phone = riders.phone), otherwise the same name (letters only, prefix).
-- The rider app reads riders.on_duty every 10 s and starts / stops sharing its location to match.
create or replace function public.rider_duty_ext(p_secret text, p_phone text, p_name text, p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare r public.riders; ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); nm text := regexp_replace(lower(coalesce(p_name, '')), '[^a-z]', '', 'g');
begin
  if encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> 'fa5b77c5aadc78b0d4e7428a31c4ac8c87a38c7578bf5e1910af6fbea30371dd' then
    raise exception 'forbidden';
  end if;
  if length(ph) >= 10 then select * into r from public.riders where active and regexp_replace(phone, '\D', '', 'g') = ph limit 1; end if;
  if r.user_id is null and length(nm) >= 3 then
    select * into r from public.riders where active and (regexp_replace(lower(name), '[^a-z]', '', 'g') like nm || '%' or nm like regexp_replace(lower(name), '[^a-z]', '', 'g') || '%')
    order by length(name) limit 1;
  end if;
  if r.user_id is null then return jsonb_build_object('ok', false, 'err', 'no_rider'); end if;
  update public.riders set on_duty = coalesce(p_on, false) where user_id = r.user_id;
  if not coalesce(p_on, false) then delete from public.rider_device_keys where user_id = r.user_id; end if;
  return jsonb_build_object('ok', true, 'rider', r.name, 'on', coalesce(p_on, false));
end $$;
revoke all on function public.rider_duty_ext(text, text, text, boolean) from public;
grant execute on function public.rider_duty_ext(text, text, text, boolean) to anon, authenticated;
