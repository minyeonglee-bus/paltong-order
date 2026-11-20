-- 📥 배달K(DK) 웹 → 주문 앱 자동 접수 (2026-11-21)
-- 배달K 사장님 웹(www.deliveryk.com/order)을 켜 둔 PC의 크롬 확장 "빨통 DK 연결"이
-- 새 주문 카드를 읽어서 dk_inbox_add 로 보냄 → 관리자 📥 DK 목록 + 알림음 + 관리자 푸시
-- → 직원이 [등록]을 눌러 외부 주문 창에서 한 번 더 확인 후 저장 (자동 등록 아님).
-- 기존 50단계(dk_inbox · dk_inbox_cfg · admin_dk_inbox_key)에 이어서.

alter table public.dk_inbox add column if not exists dk_id text;
create index if not exists dk_inbox_dk_id on public.dk_inbox(dk_id);
alter table public.dk_inbox_cfg add column if not exists last_seen timestamptz;
alter table public.dk_inbox_cfg add column if not exists last_info text;

create or replace function public.dk_inbox_add(p_key text, p_title text default null, p_text text default null, p_app text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text; v_body text := left(trim(coalesce(p_text, '')), 4000); v_title text := left(trim(coalesce(p_title, '')), 300);
  v_id text; v_ord uuid; v_ordno int; r public.dk_inbox;
begin
  select key into v_key from public.dk_inbox_cfg where id = 1;
  if v_key is null or p_key is distinct from v_key then raise exception 'bad_key'; end if;
  if v_body = '' and v_title = '' then raise exception 'empty'; end if;
  update public.dk_inbox_cfg set last_seen = now() where id = 1;
  v_id := substring(v_body from '주문\s*아이디\s*[:#]?\s*(\d{5,})');
  -- 같은 DK 주문은 한 번만 (3일)
  if v_id is not null and exists (select 1 from public.dk_inbox where dk_id = v_id and created_at > now() - interval '3 days') then
    return jsonb_build_object('ok', true, 'dup', true);
  end if;
  -- 같은 알림이 2분 안에 또 오면 한 번만 (예전 알림 방식)
  if v_id is null and exists (select 1 from public.dk_inbox where coalesce(body,'') = v_body and coalesce(title,'') = v_title and created_at > now() - interval '2 minutes') then
    return jsonb_build_object('ok', true, 'dup', true);
  end if;
  -- 직원이 이미 손으로 넣은 DK 주문 (이름 칸 = DK 주문번호) → 목록에 안 띄우고 연결만
  if v_id is not null then
    select id, order_no into v_ord, v_ordno from public.orders
     where source = 'external' and channel = 'DK' and trim(cust_name) = v_id and created_at > now() - interval '3 days'
     order by created_at desc limit 1;
  end if;
  insert into public.dk_inbox(title, body, app, dk_id, status, order_id, handled_at)
  values (nullif(v_title, ''), nullif(v_body, ''), nullif(left(trim(coalesce(p_app, '')), 100), ''), v_id,
          case when v_ord is null then 'new' else 'done' end, v_ord, case when v_ord is null then null else now() end)
  returning * into r;
  delete from public.dk_inbox where created_at < now() - interval '14 days';
  if v_ord is null then
    begin
      perform public.push_send('📥 배달K 새 주문' || coalesce(' #' || v_id, ''),
        coalesce(nullif(v_title, ''), '') || ' — 관리자 화면 📥 DK에서 확인 후 등록하세요 · Check 📥 DK in admin', 'dk-' || coalesce(v_id, r.id::text), 'order');
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'existing', v_ordno);
end $$;

-- 확장이 5분마다 "살아 있어요" (배달K 주문 화면이 열려 있을 때만)
create or replace function public.dk_inbox_ping(p_key text, p_info text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  select key into v_key from public.dk_inbox_cfg where id = 1;
  if v_key is null or p_key is distinct from v_key then raise exception 'bad_key'; end if;
  update public.dk_inbox_cfg set last_seen = now(), last_info = left(p_info, 200) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_dk_inbox_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.dk_inbox_cfg;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into c from public.dk_inbox_cfg where id = 1;
  return jsonb_build_object('last_seen', c.last_seen, 'info', c.last_info);
end $$;

grant execute on function public.dk_inbox_add(text, text, text, text) to anon, authenticated;
grant execute on function public.dk_inbox_ping(text, text) to anon, authenticated;
grant execute on function public.admin_dk_inbox_status() to authenticated;
