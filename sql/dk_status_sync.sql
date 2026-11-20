-- 🔄 배달K ↔ 주문 앱 상태 맞추기 (2026-11-21)
-- 크롬 확장이 배달K 주문 화면의 카드 상태를 15초마다 dk_status_report 로 보냄.
--   배달K 단계: 1 접수대기 · 2 주문접수 · 3 조리중 · 4 배달시작 · 5 곧도착 · 6 완료 · -1 취소 (카드가 사라지면 gone)
-- 배달K → 우리 앱: 배달시작/곧도착 → 'delivering' · 완료(또는 배달시작 뒤 사라짐) → 'done'
--                  취소(또는 조리 단계에서 사라짐) → 자동으로 안 바꾸고 관리자 푸시만
-- 우리 앱 → 배달K: 등록(조리 중 'confirmed') → 조리중(3) · 'delivering' → 배달시작(4) · 'done' → 완료(6)
--                  dk_status_report 가 할 일(todo)로 돌려주면 확장이 배달K 화면의 상태 버튼을 눌러서 맞춤.
--                  우리 앱에 등록 안 한 주문(직원이 메뉴 확인 전)은 안 건드림.

create table if not exists public.dk_order_sync (
  dk_id text primary key,
  order_id uuid,
  pickup boolean default false,
  dk_level int,              -- 마지막으로 본 배달K 단계
  dk_label text,
  dk_gone boolean default false,
  dk_seen_at timestamptz,
  push_level int,            -- 우리 앱 → 배달K 로 맞춘 단계
  push_error text,
  push_tried_at timestamptz,
  alerted text,              -- 이미 보낸 알림 (중복 방지)
  updated_at timestamptz default now()
);
alter table public.dk_order_sync enable row level security;
drop policy if exists dk_order_sync_admin on public.dk_order_sync;
create policy dk_order_sync_admin on public.dk_order_sync for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.dk_find_order(p_dk text)
returns public.orders language sql stable security definer set search_path = public as $$
  select * from public.orders
   where source = 'external' and channel = 'DK' and trim(cust_name) = p_dk and created_at > now() - interval '3 days'
   order by (status = 'cancelled'), created_at desc limit 1
$$;

create or replace function public.dk_status_report(p_key text, p_list jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text; it jsonb; v_dk text; v_lv int; v_gone boolean; v_pick boolean; s public.dk_order_sync; o public.orders;
  v_prev int; todo jsonb := '[]'::jsonb; v_target int;
begin
  select key into v_key from public.dk_inbox_cfg where id = 1;
  if v_key is null or p_key is distinct from v_key then raise exception 'bad_key'; end if;
  update public.dk_inbox_cfg set last_seen = now() where id = 1;

  for it in select * from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) loop
    v_dk := nullif(trim(it->>'dk'), ''); continue when v_dk is null;
    v_lv := nullif(it->>'level', '')::int; v_gone := coalesce((it->>'gone')::boolean, false); v_pick := coalesce((it->>'pickup')::boolean, false);
    select * into s from public.dk_order_sync where dk_id = v_dk;
    v_prev := s.dk_level;
    o := public.dk_find_order(v_dk);
    v_pick := v_pick or coalesce(o.order_type, '') = 'pickup';
    insert into public.dk_order_sync(dk_id, order_id, pickup, dk_level, dk_label, dk_gone, dk_seen_at, updated_at)
    values (v_dk, o.id, v_pick, case when v_gone then v_prev else v_lv end, nullif(it->>'label', ''), v_gone, now(), now())
    on conflict (dk_id) do update set order_id = coalesce(excluded.order_id, dk_order_sync.order_id), pickup = excluded.pickup or dk_order_sync.pickup,
      dk_level = case when v_gone then dk_order_sync.dk_level else coalesce(excluded.dk_level, dk_order_sync.dk_level) end,
      dk_label = coalesce(excluded.dk_label, dk_order_sync.dk_label), dk_gone = v_gone, dk_seen_at = now(), updated_at = now()
    returning * into s;
    continue when o.id is null;   -- 아직 우리 앱에 등록 안 한 주문

    -- 배달K → 우리 앱
    if not v_gone and v_lv = -1 or (v_gone and coalesce(s.dk_level, 0) < case when s.pickup then 5 else 4 end) then
      if o.status not in ('done', 'cancelled') and coalesce(s.alerted, '') not like '%cancel%' then
        begin perform public.push_send('⚠️ 배달K 주문 취소?' || ' #' || v_dk,
          'DK-' || o.order_no || ' — 배달K에서 ' || case when v_gone then '주문이 사라졌어요' else '취소됐어요' end || '. 확인 후 우리 앱에서도 취소하세요 · Check & cancel in the app', 'dkc-' || v_dk, 'order');
        exception when others then null; end;
        update public.dk_order_sync set alerted = coalesce(alerted, '') || ' cancel' where dk_id = v_dk;
      end if;
    elsif (not v_gone and v_lv = 6) or (v_gone and coalesce(s.dk_level, 0) >= case when s.pickup then 5 else 4 end) then
      if o.status in ('confirmed', 'delivering', 'accepted') then
        update public.orders set status = 'done', delivered_at = coalesce(delivered_at, now()), updated_at = now() where id = o.id;
      end if;
    elsif not v_gone and v_lv in (4, 5) and not s.pickup then
      if o.status in ('confirmed', 'accepted') then
        update public.orders set status = 'delivering', picked_up_at = coalesce(picked_up_at, now()), updated_at = now() where id = o.id;
      end if;
    end if;

    -- 우리 앱 → 배달K (할 일)
    -- 직원이 우리 앱에 등록(메뉴 확인)하면 배달K도 조리중(3)까지 — 접수대기(1)·주문접수(2)에서 (사장님 11/21)
    if not v_gone and v_lv between 1 and 5 then
      select * into o from public.orders where id = o.id;
      v_target := case when o.status = 'done' then 6 when o.status = 'delivering' and not s.pickup then 4
                       when o.status in ('confirmed', 'accepted') then 3 else null end;
      if v_target is not null and v_target > v_lv
         and (s.push_error is null or s.push_tried_at < now() - interval '10 minutes') then
        todo := todo || jsonb_build_object('dk', v_dk, 'target', v_target, 'order_no', o.order_no);
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'todo', todo);
end $$;

create or replace function public.dk_push_result(p_key text, p_dk text, p_ok boolean, p_level int default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text; s public.dk_order_sync; o public.orders;
begin
  select key into v_key from public.dk_inbox_cfg where id = 1;
  if v_key is null or p_key is distinct from v_key then raise exception 'bad_key'; end if;
  update public.dk_order_sync set push_tried_at = now(), push_level = case when p_ok then p_level else push_level end,
    push_error = case when p_ok then null else left(p_error, 200) end, dk_level = coalesce(p_level, dk_level), updated_at = now()
   where dk_id = p_dk returning * into s;
  if not p_ok and s.dk_id is not null and coalesce(s.alerted, '') not like '%push%' then
    o := public.dk_find_order(p_dk);
    begin perform public.push_send('⚠️ 배달K 상태 변경 실패 #' || p_dk,
      coalesce('DK-' || o.order_no || ' — ', '') || '배달K에서 직접 상태를 바꿔 주세요 · Please change it in DeliveryK (' || coalesce(p_error, '') || ')', 'dkp-' || p_dk, 'order');
    exception when others then null; end;
    update public.dk_order_sync set alerted = coalesce(alerted, '') || ' push' where dk_id = p_dk;
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.dk_status_report(text, jsonb) to anon, authenticated;
grant execute on function public.dk_push_result(text, text, boolean, int, text) to anon, authenticated;
revoke execute on function public.dk_find_order(text) from anon, authenticated, public;

-- (11/21) 외부 주문을 '새 주문(처리 필요)'으로 만들 수 있게: admin_create_external_order 의 p->>'status' = 'new'
--   → status 'new', confirmed_at null (그 외는 예전처럼 'confirmed'). 배달K 자동 등록이 씀.
--   적용: 함수 정의에서 'confirmed', now(), 'delivery' 를
--   case when p->>'status' = 'new' then 'new' else 'confirmed' end, case when p->>'status' = 'new' then null else now() end, 'delivery' 로 바꿈 (migration external_order_status_new)
