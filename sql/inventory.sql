-- =====================================================================
-- 📦 재고 (inventory) — 2026-11-09
-- 주문이 조리 단계(accepted / awaiting_payment / confirmed / delivering / done)에 들어가면
-- 레시피(inv_recipes)대로 재고가 자동으로 빠지고, 취소되거나 메뉴가 빠지면 되돌아감.
-- 직원이 센 숫자(실사)는 inv_count() 로 기록 → 차이가 기록에 남음.
-- 화면: /inventory (inventory.html), 관리자 로그인 필요.
-- =====================================================================

create table if not exists public.inv_items (
  id          text primary key,
  name        text not null,            -- 직원이 보는 이름 (영문)
  name_ko     text,
  cat         text not null default 'dry',   -- korea (한국에서 오는 용기) | dry | frozen | drink
  unit        text not null default 'pcs',   -- 세는 단위: plastic / pack / pcs / can ...
  per_unit    numeric,                  -- 1 unit 안에 몇 use_unit (예: 꼼장어 1 pack = 900 g). null = 아직 모름 → 자동 차감 안 함
  use_unit    text,                     -- 레시피에서 쓰는 단위 (g, pcs ...). null 이면 unit 과 같음 (per_unit 1)
  qty         numeric not null default 0,
  low_at      numeric,                  -- 이 숫자 이하면 '부족'
  box_size    numeric,                  -- Dry: 1 box = box_size × unit (n box + n plastic 으로 셈)
  counted_at  timestamptz,              -- 마지막 실사
  counted_by  text,
  active      boolean not null default true,
  sort        int not null default 0,
  note        text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.inv_recipes (
  id        bigserial primary key,
  item_id   text not null references public.inv_items(id) on delete cascade,
  menu_id   text,          -- 주문 항목 id (menu.js / 메뉴 관리)
  name_kw   text,          -- 외부 주문(직접 입력한 이름) 정규식, 대소문자 무시. 예: 'boneless.*dakbal'
  name_not  text,          -- 이 정규식에 걸리면 제외
  opt_ko    text,          -- 이 옵션을 고른 경우만 (opts[].ko 또는 en 과 같으면)
  opt_not   text,          -- 이 옵션을 고르면 제외
  per_opt_n boolean not null default false,  -- 옵션 개수(n)만큼 곱함 (꼼장어 150G 추가 ×2)
  amount    numeric not null,                -- 주문 1개당 use_unit 기준 양
  note      text,
  created_at timestamptz not null default now(),
  check (menu_id is not null or name_kw is not null)
);
create index if not exists inv_recipes_menu on public.inv_recipes(menu_id);

create table if not exists public.inv_moves (
  id         bigserial primary key,
  item_id    text not null references public.inv_items(id) on delete cascade,
  delta      numeric not null,          -- unit 기준 (+ 입고 / − 사용)
  kind       text not null,             -- order | count | in | waste | adjust
  order_id   uuid,
  order_ref  text,
  counted    numeric,                   -- kind=count: 센 숫자
  by_name    text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists inv_moves_item on public.inv_moves(item_id, created_at desc);
create index if not exists inv_moves_order on public.inv_moves(order_id) where order_id is not null;

create table if not exists public.inv_settings (
  id int primary key default 1 check (id = 1),
  start_at timestamptz not null default now(),   -- 이 시각 전에 만들어진 주문은 차감 안 함
  enabled  boolean not null default true
);
insert into public.inv_settings(id) values (1) on conflict do nothing;

-- qty 는 moves 합으로 유지
create or replace function public.inv_moves_apply() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update inv_items set qty = qty + new.delta, updated_at = now() where id = new.item_id;
  elsif tg_op = 'DELETE' then
    update inv_items set qty = qty - old.delta, updated_at = now() where id = old.item_id;
  end if;
  return null;
end $$;
drop trigger if exists inv_moves_apply on public.inv_moves;
create trigger inv_moves_apply after insert or delete on public.inv_moves for each row execute function public.inv_moves_apply();

-- 주문 1건이 써야 하는 재고 (unit 기준)
create or replace function public.inv_order_need(p_items jsonb)
returns table(item_id text, need numeric) language sql stable set search_path = public as $$
  with li as (
    select e.it, coalesce((e.it->>'qty')::numeric, 1) as q, coalesce(e.it->>'name','') || ' ' || coalesce(e.it->>'en','') as nm
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e(it)
  ), m as (
    select r.item_id, r.amount, r.per_opt_n, li.q, li.it, r.opt_ko
    from li join inv_recipes r on (
         (r.menu_id is not null and r.menu_id = li.it->>'id')
      or (r.menu_id is null and r.name_kw is not null and coalesce((li.it->>'custom')::boolean, false) and li.nm ~* r.name_kw))
    where (r.name_not is null or li.nm !~* r.name_not)
      and (r.opt_not is null or not exists (select 1 from jsonb_array_elements(coalesce(li.it->'opts','[]')) o
             where o->>'ko' = r.opt_not or o->>'en' ilike r.opt_not))
  ), m2 as (
    select m.item_id,
      case when m.opt_ko is null then m.amount * m.q
           else m.amount * m.q * coalesce((select sum(case when m.per_opt_n then coalesce((o->>'n')::numeric, 1) else 1 end)
                  from jsonb_array_elements(coalesce(m.it->'opts','[]')) o
                  where o->>'ko' = m.opt_ko or o->>'en' ilike m.opt_ko), 0)
      end as amt
    from m
  )
  select m2.item_id, sum(m2.amt / coalesce(nullif(i.per_unit, 0), case when i.use_unit is null then 1 end)) as need
  from m2 join inv_items i on i.id = m2.item_id
  where i.active and (i.per_unit is not null or i.use_unit is null)
  group by m2.item_id
  having sum(m2.amt) <> 0;
$$;

-- 주문 상태/메뉴가 바뀔 때마다: (지금 필요한 양) − (이미 뺀 양) 만큼만 기록
create or replace function public.inv_sync_order(p_order uuid) returns void language plpgsql security definer set search_path = public as $$
declare o record; s record;
begin
  select * into s from inv_settings where id = 1;
  if s is null or not s.enabled then return; end if;
  select id, status, items, created_at, coalesce(order_prefix,'') || coalesce(order_no::text,'') as ref into o from orders where id = p_order;
  if o.id is null then return; end if;
  if o.created_at < s.start_at and not exists (select 1 from inv_moves where order_id = p_order) then return; end if;
  insert into inv_moves(item_id, delta, kind, order_id, order_ref)
  select coalesce(w.item_id, h.item_id), -coalesce(w.need, 0) - coalesce(h.had, 0), 'order', p_order, o.ref
  from (select n.item_id, n.need from inv_order_need(o.items) n
        where o.status in ('accepted','awaiting_payment','confirmed','delivering','done')) w
  full join (select x.item_id, sum(x.delta) as had from inv_moves x where x.order_id = p_order and x.kind = 'order' group by x.item_id) h
    on h.item_id = w.item_id
  where round(-coalesce(w.need, 0) - coalesce(h.had, 0), 6) <> 0;
end $$;

create or replace function public.inv_orders_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform inv_sync_order(new.id);
  exception when others then
    raise warning 'inventory sync failed for order %: %', new.id, sqlerrm;   -- 재고 오류로 주문이 막히면 안 됨
  end;
  return null;
end $$;
drop trigger if exists orders_inventory_sync on public.orders;
create trigger orders_inventory_sync after insert or update of status, items on public.orders
  for each row execute function public.inv_orders_changed();

-- 실사: 센 숫자 기록 → 차이만큼 move
create or replace function public.inv_count(p_item text, p_counted numeric, p_by text default null, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare cur numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select qty into cur from inv_items where id = p_item for update;
  if cur is null then raise exception 'no_item'; end if;
  insert into inv_moves(item_id, delta, kind, counted, by_name, note) values (p_item, p_counted - cur, 'count', p_counted, p_by, p_note);
  update inv_items set counted_at = now(), counted_by = p_by where id = p_item;
  return p_counted - cur;
end $$;

-- 입고 / 버림 / 조정
create or replace function public.inv_move(p_item text, p_delta numeric, p_kind text, p_by text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_kind not in ('in','waste','adjust') then raise exception 'bad_kind'; end if;
  insert into inv_moves(item_id, delta, kind, by_name, note) values (p_item, p_delta, p_kind, p_by, p_note);
end $$;

-- 보안: 관리자만
alter table public.inv_items enable row level security;
alter table public.inv_recipes enable row level security;
alter table public.inv_moves enable row level security;
alter table public.inv_settings enable row level security;
drop policy if exists inv_items_admin on public.inv_items;
create policy inv_items_admin on public.inv_items for all using (is_admin()) with check (is_admin());
drop policy if exists inv_recipes_admin on public.inv_recipes;
create policy inv_recipes_admin on public.inv_recipes for all using (is_admin()) with check (is_admin());
drop policy if exists inv_moves_admin_read on public.inv_moves;
create policy inv_moves_admin_read on public.inv_moves for select using (is_admin());
drop policy if exists inv_settings_admin on public.inv_settings;
create policy inv_settings_admin on public.inv_settings for all using (is_admin()) with check (is_admin());
revoke all on function public.inv_sync_order(uuid) from public, anon, authenticated;
revoke all on function public.inv_order_need(jsonb) from public, anon;

alter table public.inv_items add column if not exists box_size numeric;

-- 부족 알림 (2026-11-09): low_at 또는 0 을 아래로 넘을 때 관리자 푸시 1번 (push_send)
create or replace function public.inv_moves_apply() returns trigger language plpgsql security definer set search_path = public as $$
declare i record; old_q numeric; new_q numeric; pcs text;
begin
  if tg_op = 'INSERT' then
    update inv_items set qty = qty + new.delta, updated_at = now() where id = new.item_id
      returning name, name_ko, unit, use_unit, per_unit, low_at, qty, note into i;
    new_q := i.qty; old_q := i.qty - new.delta;
    if i.low_at is not null and (
         (old_q > i.low_at and new_q <= i.low_at) or (old_q > 0 and new_q <= 0)) then
      begin
        pcs := case when i.per_unit is not null then ' (≈' || round(greatest(new_q, 0) * i.per_unit) || ' ' || coalesce(i.use_unit, '') || ')' else '' end;
        perform push_send(
          case when new_q <= 0 then '❌ 재고 없음 No stock: ' else '📦 재고 부족 Low stock: ' end || i.name,
          coalesce(i.name_ko || ' · ', '') || '남은 양 ' || trim(to_char(round(greatest(new_q, 0), 1), 'FM999990.0')) || ' ' || i.unit || pcs
            || coalesce(' · ' || nullif(i.note, ''), ' — 주문하세요 · please reorder'),
          'inv-' || new.item_id, 'msg');
      exception when others then raise warning 'inventory push failed: %', sqlerrm;
      end;
    end if;
  elsif tg_op = 'DELETE' then
    update inv_items set qty = qty - old.delta, updated_at = now() where id = old.item_id;
  end if;
  return null;
end $$;

-- 대체 품목 (2026-11-09): 재고 0 이하면 sub_id 에서 대신 뺌 (156 없는 동안 157)
alter table public.inv_items add column if not exists sub_id text references public.inv_items(id) on delete set null;
create or replace function public.inv_sync_order(p_order uuid) returns void language plpgsql security definer set search_path = public as $$
declare o record; s record;
begin
  select * into s from inv_settings where id = 1;
  if s is null or not s.enabled then return; end if;
  select id, status, items, created_at, coalesce(order_prefix,'') || coalesce(order_no::text,'') as ref into o from orders where id = p_order;
  if o.id is null then return; end if;
  if o.created_at < s.start_at and not exists (select 1 from inv_moves where order_id = p_order) then return; end if;
  insert into inv_moves(item_id, delta, kind, order_id, order_ref, note)
  select coalesce(w.item_id, h.item_id), -coalesce(w.need, 0) - coalesce(h.had, 0), 'order', p_order, o.ref, w.via
  from (
    select r.item_id, sum(r.need) as need, string_agg(distinct r.via, ', ') as via from (
      select case when d.use_sub then i.sub_id else n.item_id end as item_id,
             case when d.use_sub then n.need * coalesce(i.per_unit, 1) / coalesce(nullif(si.per_unit, 0), 1) else n.need end as need,
             case when d.use_sub then '대체 · instead of ' || i.name end as via
      from inv_order_need(o.items) n
      join inv_items i on i.id = n.item_id
      left join inv_items si on si.id = i.sub_id
      cross join lateral (select (i.sub_id is not null and coalesce(si.active, false)
          and not exists (select 1 from inv_moves x where x.order_id = p_order and x.item_id = n.item_id and x.kind = 'order')
          and (i.qty <= 0 or exists (select 1 from inv_moves x where x.order_id = p_order and x.item_id = i.sub_id and x.kind = 'order'
                                       and x.note = '대체 · instead of ' || i.name))) as use_sub) d
      where o.status in ('accepted','awaiting_payment','confirmed','delivering','done')
    ) r group by r.item_id
  ) w
  full join (select x.item_id, sum(x.delta) as had from inv_moves x where x.order_id = p_order and x.kind = 'order' group by x.item_id) h
    on h.item_id = w.item_id
  where round(-coalesce(w.need, 0) - coalesce(h.had, 0), 6) <> 0;
end $$;
