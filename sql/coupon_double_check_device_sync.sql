-- =====================================================================
-- 쿠폰 중복 사용 이중 확인 + 홈 화면 앱(PWA) 주문 내역 연동  (2026-11-20)
--
-- [쿠폰 이중 확인]
--  1차: 기존 검사 (member_coupons.used_at + 행 잠금 / coupon_guest_uses 전화번호당 1번)
--  2차: coupon_redemptions 장부 — 주문에 쿠폰이 붙는 모든 경로(주문·상태 변경·취소 복구)를
--       orders 트리거가 장부에 기록. 유니크 인덱스라 같은 쿠폰이 두 주문에 들어가면 DB가 거절.
--       · 회원 쿠폰 1장 = 주문 1건 (coupon_id 유니크)
--       · 같은 코드 = 같은 전화번호 1번 (회원·비회원 합쳐서, code+phone 유니크)
--       · 비회원 같은 코드 = 같은 기기 1번 (code+device 유니크)
--       · 회원 → 로그아웃 후 비회원으로 같은 코드 재사용 / 비회원 사용 후 가입해서 코드 등록 → 막음
--       · 취소된 주문을 다시 살릴 때 그 쿠폰이 이미 다른 주문에 쓰였으면 막음 (coupon_double_use)
--
-- [기기 연동]
--  · 손님 웹이 기기 키(paltong_device)를 만들어 주문에 같이 보냄 → orders.device_hash (sha256)
--  · 아이폰은 Safari 와 홈 화면 앱의 저장소가 따로라서, 연동 코드(device_links)로 같은 그룹으로 묶음
--  · device_orders(기기키) → 그 기기 그룹의 주문 내역 (전화·주소는 안 내보냄)
-- =====================================================================

-- ---------- 공통 ----------
create or replace function public.phone10(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7
              then right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) end $$;

create or replace function public.device_hash(p text) returns text language sql immutable as $$
  select case when length(trim(coalesce(p, ''))) between 16 and 100
              then encode(sha256(convert_to(trim(p), 'UTF8')), 'hex') end $$;

alter table public.orders add column if not exists device_hash text;
alter table public.orders add column if not exists coupon_code text;
create index if not exists orders_device_hash_idx on public.orders(device_hash) where device_hash is not null;

-- ---------- 쿠폰 장부 ----------
create table if not exists public.coupon_redemptions(
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  coupon_id uuid,          -- 회원 쿠폰
  code text,               -- 쿠폰 코드 (회원 코드 쿠폰 · 비회원 코드)
  phone text,              -- 끝 10자리
  device_hash text,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.coupon_redemptions enable row level security;
create unique index if not exists coupon_redemptions_coupon_uq on public.coupon_redemptions(coupon_id) where coupon_id is not null;
create unique index if not exists coupon_redemptions_code_phone_uq on public.coupon_redemptions(code, phone) where code is not null and phone is not null;
create unique index if not exists coupon_redemptions_code_dev_uq on public.coupon_redemptions(code, device_hash) where code is not null and device_hash is not null and user_id is null;
create unique index if not exists coupon_redemptions_code_user_uq on public.coupon_redemptions(code, user_id) where code is not null and user_id is not null;
create index if not exists coupon_redemptions_order_idx on public.coupon_redemptions(order_id);

-- 이 코드가 (전화번호 / 기기 / 그 전화번호의 회원 등록) 기준으로 이미 쓰였는지
create or replace function public.coupon_code_used(p_code text, p_phone10 text, p_dev text, p_except uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coupon_redemptions r
                  where r.code = upper(p_code) and r.order_id is distinct from p_except
                    and ((p_phone10 is not null and r.phone = p_phone10) or (p_dev is not null and r.device_hash = p_dev)))
      or (p_phone10 is not null and exists (select 1 from public.coupon_guest_uses g
                  where g.code = upper(p_code) and g.phone = p_phone10 and g.order_id is distinct from p_except))
      or (p_phone10 is not null and exists (select 1 from public.coupon_code_claims k join public.members m on m.user_id = k.user_id
                  where k.code = upper(p_code) and public.phone10(m.phone) = p_phone10))
$$;
revoke all on function public.coupon_code_used(text, text, text, uuid) from public, anon, authenticated;

-- 기존 사용분 채우기 (11/20 확인: 겹치는 것 없음)
update public.orders set coupon_code = '2030' where id = '623b0a61-9788-433a-933d-946cee06401d' and coupon_code is null;
insert into public.coupon_redemptions(order_id, coupon_id, code, phone, device_hash, user_id)
select o.id, mc.id, nullif(upper(mc.code), ''), public.phone10(m.phone), o.device_hash, mc.user_id
  from public.orders o
  cross join lateral unnest(coalesce(o.coupon_ids, case when o.coupon_id is not null then array[o.coupon_id] end)) x(cid)
  join public.member_coupons mc on mc.id = x.cid
  left join public.members m on m.user_id = mc.user_id
 where o.status <> 'cancelled'
on conflict do nothing;
insert into public.coupon_redemptions(order_id, code, phone, device_hash)
select g.order_id, g.code, g.phone, o.device_hash from public.coupon_guest_uses g join public.orders o on o.id = g.order_id
 where o.status <> 'cancelled'
on conflict do nothing;

-- 주문 트리거: 장부 맞추기 (2차 확인)
create or replace function public.orders_coupon_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; x uuid; c public.member_coupons; v_ph text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.coupon_ids is not distinct from old.coupon_ids and new.coupon_id is not distinct from old.coupon_id
     and new.coupon_code is not distinct from old.coupon_code then
    return null;
  end if;
  if new.status = 'cancelled' then
    delete from public.coupon_redemptions where order_id = new.id;   -- 취소 → 쿠폰 다시 쓸 수 있음
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
        insert into public.coupon_redemptions(order_id, coupon_id, code, phone, device_hash, user_id)
        values (new.id, x, nullif(upper(c.code), ''), (select public.phone10(phone) from public.members where user_id = c.user_id), new.device_hash, c.user_id);
      exception when unique_violation then raise exception 'coupon_double_use';
      end;
    end if;
    -- 취소했다가 다시 살린 주문: 쿠폰을 다시 '사용됨'으로 (다른 주문에 이미 쓰였으면 막음)
    if c.order_id is not null and c.order_id <> new.id then raise exception 'coupon_double_use'; end if;
    if c.order_id is null then update public.member_coupons set used_at = coalesce(used_at, now()), order_id = new.id where id = x; end if;
  end loop;

  if new.coupon_code is not null and new.user_id is null then
    v_ph := public.phone10(new.cust_phone);
    if not exists (select 1 from public.coupon_redemptions where order_id = new.id and code = new.coupon_code and coupon_id is null) then
      if public.coupon_code_used(new.coupon_code, v_ph, new.device_hash, new.id) then raise exception 'code_already_used'; end if;
      begin
        insert into public.coupon_redemptions(order_id, code, phone, device_hash) values (new.id, new.coupon_code, v_ph, new.device_hash);
      exception when unique_violation then raise exception 'code_already_used';
      end;
      if v_ph is not null and tg_op = 'UPDATE' then   -- 새 주문은 place_order 가 직접 넣음
        insert into public.coupon_guest_uses(code, phone, order_id) values (new.coupon_code, v_ph, new.id) on conflict do nothing;
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists orders_coupon_ledger on public.orders;
create trigger orders_coupon_ledger after insert or update of status, coupon_ids, coupon_id, coupon_code on public.orders
  for each row execute function public.orders_coupon_ledger();

-- place_order: 기기 키 저장 + 비회원 코드 2차 확인 (본문 그대로 두고 필요한 줄만 바꿈)
do $$
declare d text := pg_get_functiondef('public.place_order(jsonb)'::regprocedure); n text;
begin
  if position('v_dev text' in d) > 0 then return; end if;   -- 이미 적용됨
  n := replace(d, E'  v_phone text;\nbegin', E'  v_phone text;\n  v_dev text := public.device_hash(p->>''device'');\nbegin');
  n := replace(n, $x$if exists (select 1 from public.coupon_guest_uses where code = vk.code and phone = v_phone) then raise exception 'code_already_used'; end if;$x$,
                  $x$if exists (select 1 from public.coupon_guest_uses where code = vk.code and phone = v_phone) then raise exception 'code_already_used'; end if;
    if public.coupon_code_used(vk.code, v_phone, v_dev) then raise exception 'code_already_used'; end if;$x$);
  n := replace(n, 'order_type, scheduled_at)', 'order_type, scheduled_at, device_hash, coupon_code)');
  n := replace(n, E'v_sched)\n  returning * into r;', E'v_sched, v_dev, nullif(v_code, ''''))\n  returning * into r;');
  if n = d or (length(n) - length(d)) < 150 then raise exception 'place_order patch failed'; end if;
  execute n;
end $$;

-- claim_coupon (회원 코드 등록): 같은 전화번호로 비회원 때 이미 쓴 코드면 막음
do $$
declare d text := pg_get_functiondef('public.claim_coupon(text)'::regprocedure); n text;
begin
  if position('coupon_code_used' in d) > 0 then return; end if;
  n := replace(d, '  insert into public.coupon_code_claims(code, user_id)',
    E'  if public.coupon_code_used(k.code, (select public.phone10(phone) from public.members where user_id = v_uid), null) then raise exception ''code_already_used''; end if;\n  insert into public.coupon_code_claims(code, user_id)');
  if n = d then raise exception 'claim_coupon patch failed'; end if;
  execute n;
end $$;

-- 비회원 코드 미리 확인 (기기 포함 버전)
create or replace function public.check_coupon_code(p_code text, p_phone text, p_device text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.check_coupon_code(p_code, p_phone);
  if public.coupon_code_used(r->>'code', public.phone10(p_phone), public.device_hash(p_device)) then raise exception 'code_already_used'; end if;
  return r;
end $$;
grant execute on function public.check_coupon_code(text, text, text) to anon, authenticated;

-- ---------- 기기 연동 ----------
create table if not exists public.device_groups(
  device_hash text primary key,
  grp uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists device_groups_grp_idx on public.device_groups(grp);
create table if not exists public.device_links(
  code text primary key,
  grp uuid not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  uses int not null default 0
);
alter table public.device_groups enable row level security;
alter table public.device_links enable row level security;

create or replace function public.device_grp(p_device text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h text := public.device_hash(p_device); g uuid;
begin
  if h is null then raise exception 'device_invalid'; end if;
  insert into public.device_groups(device_hash) values (h)
  on conflict (device_hash) do update set seen_at = now()
  returning grp into g;
  return g;
end $$;
revoke all on function public.device_grp(text) from public, anon, authenticated;

-- 이 기기(와 연동된 기기)에서 넣은 주문 — 전화·주소 없이
create or replace function public.device_orders(p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g uuid := public.device_grp(p_device);
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select o.id, o.order_no, o.order_prefix, o.created_at, o.status, o.subtotal, o.discount, o.total, o.delivery_fee,
           o.items, o.order_type, o.scheduled_at, o.coupon_title, (o.user_id is not null) as member
      from public.orders o
     where o.device_hash in (select device_hash from public.device_groups where grp = g)
       and o.created_at > now() - interval '180 days'
     order by o.created_at desc limit 50) x), '[]'::jsonb);
end $$;
grant execute on function public.device_orders(text) to anon, authenticated;

-- 연동 코드 만들기 (30일) — 로그인 중이면 회원도 같이 연결
create or replace function public.device_link_create(p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g uuid := public.device_grp(p_device); v_uid uuid := auth.uid(); v_code text; l public.device_links;
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is not null and not exists (select 1 from public.members where user_id = v_uid) then v_uid := null; end if;
  select * into l from public.device_links where grp = g and user_id is not distinct from v_uid
     and expires_at > now() + interval '20 days' order by created_at desc limit 1;
  if found then return jsonb_build_object('code', l.code, 'expires_at', l.expires_at); end if;
  if (select count(*) from public.device_links where grp = g and created_at > now() - interval '1 day') >= 20 then raise exception 'too_many'; end if;
  loop
    v_code := (select string_agg(substr(abc, 1 + floor(random() * length(abc))::int, 1), '') from generate_series(1, 10));
    exit when not exists (select 1 from public.device_links where code = v_code);
  end loop;
  insert into public.device_links(code, grp, user_id, expires_at) values (v_code, g, v_uid, now() + interval '30 days') returning * into l;
  return jsonb_build_object('code', l.code, 'expires_at', l.expires_at);
end $$;
grant execute on function public.device_link_create(text) to anon, authenticated;

-- 연동 코드 쓰기 — 이 기기를 코드 만든 기기 그룹에 합침. 회원 코드면 전화번호(로그인 칸 채우기용)
create or replace function public.device_link_redeem(p_device text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.device_links; g uuid := public.device_grp(p_device); v_phone text; v_name text;
begin
  select * into l from public.device_links where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found or l.expires_at < now() or l.uses >= 30 then raise exception 'link_invalid'; end if;
  if g <> l.grp then
    update public.device_groups set grp = l.grp where grp = g;
    update public.device_links set uses = uses + 1 where code = l.code;
  end if;
  if l.user_id is not null then select phone, name into v_phone, v_name from public.members where user_id = l.user_id; end if;
  return jsonb_build_object('ok', true, 'member_phone', v_phone, 'member_name', v_name);
end $$;
grant execute on function public.device_link_redeem(text, text) to anon, authenticated;
