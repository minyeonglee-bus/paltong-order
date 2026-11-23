-- 🛡 Guest coupon code — more layers (owner 11/24, picks 1·2·3·8·9 of the list)
-- 1) new device wait: a device first seen < 30 min ago can't use a coupon code (device_seen, filled by device_hello on page open)
-- 2) browser fingerprint: screen/timezone/fonts/canvas/GPU hash — survives private mode / clearing storage.
--    Matched together with the network (first 2 parts of the IP) so different people with the same iPhone model don't collide.
-- 3) private / incognito browsing → no coupon (reported by the page)
-- 8) keyboard-mash names (Ghjjjhh, Ggg, one letter) → refused + blocked like fake numbers
-- 9) more than 3 coupon checks from the same IP or device in an hour → locked for that hour
-- + orders with a guest code must come after a passing coupon_guard check from the same device (coupon_passes) — no side door.
create table if not exists public.device_seen (
  device_hash text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  ip text, fp text, private boolean, ua text
);
alter table public.device_seen enable row level security;
revoke all on public.device_seen from anon, authenticated;

create table if not exists public.coupon_attempts (
  id bigserial primary key, at timestamptz not null default now(),
  ip text, device_hash text, fp text, phone text, name text, code text, result text
);
create index if not exists coupon_attempts_ip_at on public.coupon_attempts (ip, at);
create index if not exists coupon_attempts_dev_at on public.coupon_attempts (device_hash, at);
alter table public.coupon_attempts enable row level security;
revoke all on public.coupon_attempts from anon, authenticated;

create table if not exists public.coupon_passes (
  id bigserial primary key, at timestamptz not null default now(),
  device_hash text not null, code text not null, fp text, ip text
);
create index if not exists coupon_passes_dev_code on public.coupon_passes (device_hash, code, at);
alter table public.coupon_passes enable row level security;
revoke all on public.coupon_passes from anon, authenticated;

alter table public.coupon_redemptions add column if not exists fp text;
alter table public.coupon_blocks drop constraint if exists coupon_blocks_kind_check;
alter table public.coupon_blocks add constraint coupon_blocks_kind_check check (kind in ('ip', 'device', 'phone', 'fp'));

-- network part of an IP: IPv4 a.b / IPv6 first 3 groups
create or replace function public.ip_net(p text) returns text language sql immutable as $$
  select case when p is null or p = '' then null
              when p like '%:%' then array_to_string((string_to_array(p, ':'))[1:3], ':')
              else split_part(p, '.', 1) || '.' || split_part(p, '.', 2) end
$$;
-- fingerprint + network = one key
create or replace function public.fp_key(p_fp text, p_ip text) returns text language sql immutable as $$
  select case when coalesce(p_fp, '') = '' then null else left(p_fp, 64) || '@' || coalesce(public.ip_net(p_ip), '?') end
$$;

create or replace function public.name_fake(p text) returns boolean language sql immutable as $$
  with n as (select trim(coalesce(p, '')) v)
  select length(v) < 2
      or (v ~ '^[A-Za-z .''-]+$' and (lower(v) ~ '([a-z])\1\1' or lower(v) ~ '[bcdfghjklmnpqrstvwxz]{5}'
          or exists (select 1 from regexp_split_to_table(lower(v), '[^a-z]+') w where length(w) >= 4 and w !~ '[aeiouy]')))
  from n
$$;

-- page open: remember when this device was first seen
create or replace function public.device_hello(p_device text, p_fp text default null, p_private boolean default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare dev text := public.device_hash(p_device); ua text := left(current_setting('request.headers', true)::json ->> 'user-agent', 300);
begin
  if dev is null then return jsonb_build_object('ok', false); end if;
  insert into public.device_seen(device_hash, ip, fp, private, ua) values (dev, public.client_ip(), left(p_fp, 64), p_private, ua)
  on conflict (device_hash) do update set last_seen = now(), ip = excluded.ip, fp = coalesce(excluded.fp, device_seen.fp),
    private = coalesce(excluded.private, device_seen.private), ua = coalesce(excluded.ua, device_seen.ua);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.device_hello(text, text, boolean) to anon, authenticated;

create or replace function public.coupon_blocked2(p_ip text, p_dev text, p_phone10 text, p_fpk text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.coupon_blocked(p_ip, p_dev, p_phone10)
      or (p_fpk is not null and exists (select 1 from public.coupon_blocks b where b.kind = 'fp' and b.value = p_fpk))
$$;
create or replace function public.coupon_fp_used(p_code text, p_fpk text, p_except uuid default null)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_fpk is not null and exists (select 1 from public.coupon_redemptions r
    where r.code = upper(p_code) and r.fp = p_fpk and r.order_id is distinct from p_except)
$$;

create or replace function public.coupon_guard(p_code text, p_phone text, p_device text, p_name text, p_fp text, p_private boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; ip text := public.client_ip(); dev text := public.device_hash(p_device); ph text := public.phone10(p_phone);
  fpk text := public.fp_key(p_fp, public.client_ip()); why text; block boolean := false; seen timestamptz; c text := upper(trim(coalesce(p_code, '')));
begin
  -- 9) rate limit: 3 checks per hour per IP / device
  if (select count(*) from public.coupon_attempts a where a.at > now() - interval '1 hour'
        and ((ip is not null and a.ip = ip) or (dev is not null and a.device_hash = dev))) >= 3 then
    why := 'coupon_rate';
  else
    begin r := public.check_coupon_code(p_code, p_phone);   -- invalid / expired / sold out (typos are NOT blocked)
    exception when others then why := sqlerrm; end;
    if why is null then
      c := r->>'code';
      select first_seen into seen from public.device_seen where device_hash = dev;
      if public.coupon_blocked2(ip, dev, ph, fpk) then why := 'coupon_blocked'; block := true;
      elsif p_private then why := 'private_mode';
      elsif dev is null or seen is null or seen > now() - interval '30 minutes' then why := 'device_too_new';
      elsif p_phone is not null and public.phone_fake(p_phone) then why := 'phone_fake'; block := true;
      elsif p_name is not null and public.name_fake(p_name) then why := 'name_fake'; block := true;
      elsif public.coupon_code_used(c, ph, dev) or public.coupon_ip_used(c, ip) or public.coupon_fp_used(c, fpk) then why := 'code_already_used'; block := true;
      end if;
    end if;
  end if;
  insert into public.coupon_attempts(ip, device_hash, fp, phone, name, code, result) values (ip, dev, fpk, ph, left(p_name, 80), c, coalesce(why, 'ok'));
  if dev is not null and seen is null and why is distinct from 'coupon_rate' then
    insert into public.device_seen(device_hash, ip, fp, private) values (dev, ip, left(p_fp, 64), p_private) on conflict do nothing;
  end if;
  if block then
    perform public.coupon_block_add(ip, dev, ph, why, c);
    if fpk is not null then insert into public.coupon_blocks(kind, value, reason, code) values ('fp', fpk, why, c) on conflict do nothing; end if;
  end if;
  if why is not null then return jsonb_build_object('ok', false, 'err', why); end if;
  insert into public.coupon_passes(device_hash, code, fp, ip) values (dev, c, fpk, ip);
  return r || jsonb_build_object('ok', true);
end $$;
grant execute on function public.coupon_guard(text, text, text, text, text, boolean) to anon, authenticated;

-- old 3-argument call (cached pages) → same rules without fingerprint / private flag
create or replace function public.coupon_guard(p_code text, p_phone text, p_device text)
returns jsonb language sql security definer set search_path to 'public' as $$
  select public.coupon_guard(p_code, p_phone, p_device, null, null, null)
$$;

-- ledger: a new guest-code order needs a passing check from the same device in the last 6 h
create or replace function public.orders_coupon_ledger()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_ids uuid[]; x uuid; c public.member_coupons; v_ph text; v_fp text;
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
      select p.fp into v_fp from public.coupon_passes p
       where p.device_hash = new.device_hash and p.code = upper(new.coupon_code) and p.at > now() - interval '6 hours' order by p.at desc limit 1;
      if tg_op = 'INSERT' and not found then raise exception 'coupon_check_required'; end if;
      if public.coupon_code_used(new.coupon_code, v_ph, new.device_hash, new.id) then raise exception 'code_already_used'; end if;
      if public.coupon_ip_used(new.coupon_code, new.client_ip, new.id) then raise exception 'code_already_used'; end if;
      if public.coupon_fp_used(new.coupon_code, v_fp, new.id) then raise exception 'code_already_used'; end if;
      if public.coupon_blocked2(new.client_ip, new.device_hash, v_ph, v_fp) then raise exception 'coupon_blocked'; end if;
      if new.cust_phone is not null and public.phone_fake(new.cust_phone) then raise exception 'phone_fake'; end if;
      if new.cust_name is not null and public.name_fake(new.cust_name) then raise exception 'name_fake'; end if;
      begin
        insert into public.coupon_redemptions(order_id, code, phone, device_hash, ip, fp) values (new.id, new.coupon_code, v_ph, new.device_hash, new.client_ip, v_fp);
      exception when unique_violation then raise exception 'code_already_used';
      end;
      if v_ph is not null and tg_op = 'UPDATE' then
        insert into public.coupon_guest_uses(code, phone, order_id) values (new.coupon_code, v_ph, new.id) on conflict do nothing;
      end if;
    end if;
  end if;
  return null;
end $function$;

-- 🧾 GCash / Maya sender (last 4 digits) — staff types it when confirming an online payment (owner pick 6)
alter table public.orders add column if not exists pay_from4 text;
-- other coupon orders paid from the same account (admin only)
create or replace function public.admin_payfrom_matches(p_last4 text, p_order uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'code', coalesce(o.order_prefix, '') || '-' || o.order_no, 'day', o.order_date,
      'name', o.cust_name, 'coupon', coalesce(o.coupon_code, o.coupon_title), 'discount', o.discount) order by o.created_at desc)
    from public.orders o where o.pay_from4 = p_last4 and o.id <> p_order and o.status <> 'cancelled'
      and (o.coupon_code is not null or o.coupon_id is not null or coalesce(array_length(o.coupon_ids, 1), 0) > 0)), '[]'::jsonb);
end $$;
grant execute on function public.admin_payfrom_matches(text, uuid) to authenticated;

-- 11/23 abuse: AllBank 3596
update public.orders set pay_from4 = '3596' where order_date = '2026-11-23' and order_prefix = 'W' and order_no between 8 and 10 and pay_from4 is null;
