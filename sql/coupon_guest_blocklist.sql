-- 🎟 Guest coupon code — 3 layers made permanent + fake number check + "blocked once = never again" (owner 11/24)
-- 1) same code + same IP = once, forever (was 24 h)
-- 2) fake-looking phone (not 09XXXXXXXXX, 5 same digits in a row, last 7 digits with ≤2 different digits, 1234567-type runs) → no coupon
-- 3) a refused attempt (already used / fake number / already blocked) puts that IP + device + phone on coupon_blocks → no guest coupon ever again
create table if not exists public.coupon_blocks (
  kind text not null check (kind in ('ip', 'device', 'phone')),
  value text not null,
  reason text,
  code text,
  created_at timestamptz not null default now(),
  primary key (kind, value)
);
alter table public.coupon_blocks enable row level security;
revoke all on public.coupon_blocks from anon, authenticated;

create or replace function public.phone_fake(p text) returns boolean language sql immutable as $$
  with d as (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^63(9\d{9})$', '0\1') v)
  select v !~ '^09\d{9}$'
      or v ~ '(\d)\1{4}'
      or (select count(distinct c) from regexp_split_to_table(right(v, 7), '') c) <= 2
      or right(v, 7) in ('0123456','1234567','2345678','3456789','9876543','8765432','7654321','6543210')
  from d
$$;

create or replace function public.coupon_ip_used(p_code text, p_ip text, p_except uuid default null)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_ip is not null and exists (select 1 from public.coupon_redemptions r
    where r.code = upper(p_code) and r.ip = p_ip and r.order_id is distinct from p_except)
$$;

create or replace function public.coupon_blocked(p_ip text, p_dev text, p_phone10 text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.coupon_blocks b where (b.kind = 'ip' and b.value = p_ip)
      or (b.kind = 'device' and b.value = p_dev) or (b.kind = 'phone' and b.value = p_phone10))
$$;

create or replace function public.coupon_block_add(p_ip text, p_dev text, p_phone10 text, p_reason text, p_code text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.coupon_blocks(kind, value, reason, code)
  select k, v, p_reason, upper(p_code) from (values ('ip', p_ip), ('device', p_dev), ('phone', p_phone10)) x(k, v)
   where v is not null and v <> ''
  on conflict (kind, value) do nothing;
$$;

-- 🛡 new customer-screen check: returns {ok:false, err} instead of raising, so the block can be saved
create or replace function public.coupon_guard(p_code text, p_phone text, p_device text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; ip text := public.client_ip(); dev text := public.device_hash(p_device); ph text := public.phone10(p_phone); why text;
begin
  begin r := public.check_coupon_code(p_code, p_phone);   -- invalid / expired / sold out (typos are NOT blocked)
  exception when others then return jsonb_build_object('ok', false, 'err', sqlerrm); end;
  if public.coupon_blocked(ip, dev, ph) then why := 'coupon_blocked';
  elsif p_phone is not null and public.phone_fake(p_phone) then why := 'phone_fake';
  elsif public.coupon_code_used(r->>'code', ph, dev) or public.coupon_ip_used(r->>'code', ip) then why := 'code_already_used';
  end if;
  if why is not null then
    perform public.coupon_block_add(ip, dev, ph, why, r->>'code');
    return jsonb_build_object('ok', false, 'err', why);
  end if;
  return r || jsonb_build_object('ok', true);
end $$;
grant execute on function public.coupon_guard(text, text, text) to anon, authenticated;

-- old check (still raises) — same rules, for old cached pages
create or replace function public.check_coupon_code(p_code text, p_phone text, p_device text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb; ip text := public.client_ip(); dev text := public.device_hash(p_device); ph text := public.phone10(p_phone);
begin
  r := public.check_coupon_code(p_code, p_phone);
  if public.coupon_blocked(ip, dev, ph) then raise exception 'coupon_blocked'; end if;
  if p_phone is not null and public.phone_fake(p_phone) then raise exception 'phone_fake'; end if;
  if public.coupon_code_used(r->>'code', ph, dev) or public.coupon_ip_used(r->>'code', ip) then raise exception 'code_already_used'; end if;
  return r;
end $function$;

-- ledger (order insert): guest code also refused when blocked or fake number
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
      if public.coupon_blocked(new.client_ip, new.device_hash, v_ph) then raise exception 'coupon_blocked'; end if;
      if new.cust_phone is not null and public.phone_fake(new.cust_phone) then raise exception 'phone_fake'; end if;
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

-- 2030 abuse 11/23 (W-8·9·10): block their IPs, devices and phones
insert into public.coupon_blocks(kind, value, reason, code)
select k, v, '2030 abuse 11/23 W-8~10', '2030' from (
  select unnest(array['ip','device','phone']) k, unnest(array[client_ip, device_hash, public.phone10(cust_phone)]) v
    from public.orders where order_date = '2026-11-23' and order_prefix = 'W' and order_no between 8 and 10) x
 where v is not null
on conflict (kind, value) do nothing;
