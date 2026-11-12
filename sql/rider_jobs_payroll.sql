-- Payroll app ↔ order/rider app (owner 2026-11-12): when a rider clocks out late because of a delivery or an errand,
-- the payroll app lists that rider's recent deliveries (picked up / delivered times) and errands (started / done)
-- so the confirmation letter is filled in and approved automatically. Called from the payroll database
-- (paltong-payroll: supabase/pr_letters_auto.sql) with the same shared secret as rider_duty_ext. No customer data leaves.
create or replace function public.rider_jobs_ext(p_secret text, p_phone text, p_name text, p_from timestamptz, p_to timestamptz)
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
  return jsonb_build_object('ok', true, 'rider', r.name,
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'no', coalesce(o.order_prefix, '') || o.order_no, 'picked', o.picked_up_at, 'delivered', o.delivered_at, 'zone', o.zone_name)
        order by coalesce(o.delivered_at, o.picked_up_at) desc)
      from public.orders o where o.rider_id = r.user_id and coalesce(o.delivered_at, o.picked_up_at, o.rider_assigned_at) between p_from and p_to), '[]'::jsonb),
    'errands', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'place', x.place, 'started', x.started_at, 'done', x.done_at, 'status', x.status)
        order by coalesce(x.done_at, x.started_at, x.created_at) desc)
      from public.rider_errands x where x.rider_id = r.user_id and coalesce(x.done_at, x.started_at, x.created_at) between p_from and p_to), '[]'::jsonb));
end $$;
revoke all on function public.rider_jobs_ext(text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.rider_jobs_ext(text, text, text, timestamptz, timestamptz) to anon, authenticated;
