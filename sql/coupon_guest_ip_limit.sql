-- 🎟 Guest coupon code: also limited by network (IP) — same code from the same IP within 24 h is refused (owner 11/24, after 2030 abuse W-8~10)
-- Layers for guest codes now: phone · device · IP(24 h).  Members unchanged.
create or replace function public.client_ip() returns text language sql stable as $$
  select nullif(trim(coalesce(
    (current_setting('request.headers', true)::json ->> 'cf-connecting-ip'),
    split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1))), '')
$$;

alter table public.orders add column if not exists client_ip text;
alter table public.coupon_redemptions add column if not exists ip text;
create index if not exists coupon_redemptions_code_ip on public.coupon_redemptions (code, ip, created_at);

-- remember the customer's IP on every new order (web orders come through PostgREST → header present)
create or replace function public.orders_client_ip() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.client_ip is null then new.client_ip := public.client_ip(); end if;
  return new;
end $$;
drop trigger if exists orders_client_ip on public.orders;
create trigger orders_client_ip before insert on public.orders for each row execute function public.orders_client_ip();

create or replace function public.coupon_ip_used(p_code text, p_ip text, p_except uuid default null)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_ip is not null and exists (select 1 from public.coupon_redemptions r
    where r.code = upper(p_code) and r.ip = p_ip and r.order_id is distinct from p_except
      and r.created_at > now() - interval '24 hours')
$$;

-- check before ordering (customer screen)
create or replace function public.check_coupon_code(p_code text, p_phone text, p_device text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb;
begin
  r := public.check_coupon_code(p_code, p_phone);
  if public.coupon_code_used(r->>'code', public.phone10(p_phone), public.device_hash(p_device)) then raise exception 'code_already_used'; end if;
  if public.coupon_ip_used(r->>'code', public.client_ip()) then raise exception 'code_already_used'; end if;
  return r;
end $function$;

-- ledger: guest code also checks / records the IP
create or replace function public.orders_coupon_ledger()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_ids uuid[]; x uuid; c public.member_coupons; v_ph text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.coupon_ids is not distinct from old.coupon_ids and new.coupon_id is not distinct from old.coupon_id
     and new.coupon_code is not distinct from old.coupon_code then
    return null;
  end if;
  if new.status = 'cancelled' then
    delete from public.coupon_redemptions where order_id = new.id;
    return null;
  end if;

  v_ids := coalesce(new.coupon_ids, case when new.coupon_id is not null then array[new.coupon_id] end, '{}'::uuid[]);
  delete from public.coupon_redemptions where order_id = new.id and coupon_id is not null and not (coupon_id = any(v_ids));
  foreach x in array v_ids loop
    select * into c from public.member_coupons where id = x;
    if not found then continue; end if;
    if exists (select 1 from public.coupon_redemptions where coupon_id = x and order_id <> new.id) then
      raise exception 'coupon_double_use';
    end if;
    if not exists (select 1 from public.coupon_redemptions where coupon_id = x and order_id = new.id) then
      begin
        insert into public.coupon_redemptions(order_id, coupon_id, code, phone, device_hash, user_id, ip)
        values (new.id, x, nullif(upper(c.code), ''), (select public.phone10(phone) from public.members where user_id = c.user_id), new.device_hash, c.user_id, new.client_ip);
      exception when unique_violation then raise exception 'coupon_double_use';
      end;
    end if;
    if c.order_id is not null and c.order_id <> new.id then raise exception 'coupon_double_use'; end if;
    if c.order_id is null then update public.member_coupons set used_at = coalesce(used_at, now()), order_id = new.id where id = x; end if;
  end loop;

  if new.coupon_code is not null and new.user_id is null then
    v_ph := public.phone10(new.cust_phone);
    if not exists (select 1 from public.coupon_redemptions where order_id = new.id and code = new.coupon_code and coupon_id is null) then
      if public.coupon_code_used(new.coupon_code, v_ph, new.device_hash, new.id) then raise exception 'code_already_used'; end if;
      if public.coupon_ip_used(new.coupon_code, new.client_ip, new.id) then raise exception 'code_already_used'; end if;
      begin
        insert into public.coupon_redemptions(order_id, code, phone, device_hash, ip) values (new.id, new.coupon_code, v_ph, new.device_hash, new.client_ip);
      exception when unique_violation then raise exception 'code_already_used';
      end;
      if v_ph is not null and tg_op = 'UPDATE' then
        insert into public.coupon_guest_uses(code, phone, order_id) values (new.coupon_code, v_ph, new.id) on conflict do nothing;
      end if;
    end if;
  end if;
  return null;
end $function$;

-- backfill IPs we know from the server logs (2030 abuse, 11/23)
update public.orders set client_ip = '131.226.102.88' where order_date = '2026-11-23' and order_prefix = 'W' and order_no in (8, 10) and client_ip is null;
update public.orders set client_ip = '180.190.22.169' where order_date = '2026-11-23' and order_prefix = 'W' and order_no = 9 and client_ip is null;
update public.coupon_redemptions r set ip = o.client_ip from public.orders o where o.id = r.order_id and r.ip is null and o.client_ip is not null;
