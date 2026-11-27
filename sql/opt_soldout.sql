-- 🚫 옵션 품절 (사장님 2026-11-27)
-- 관리자 메뉴 화면에서 선택지별 품절 → menu_status(item_id = 'opt:메뉴id:선택지이름', sold_out = true).
-- 손님 웹 주문(source = 'web')과 손님 추가 주문(add_items 로 들어온 줄)에 품절 선택지가 있으면 'sold_out:...' 오류.
-- 11/27 23:20 사장님 "다이닝에도 포함" → 다이닝(T) 주문 생성 · 다이닝 메뉴 추가도 막음. 외부 주문(DK · 전화 등)은 안 막음. 수량형 옵션의 " ×2" 같은 꼬리는 떼고 비교.

create or replace function public.opt_soldout_names(p_items jsonb) returns text
language sql stable as $$
  select string_agg(distinct coalesce(e->>'name', e->>'id') || ' (' || (o->>'ko') || ')', ', ')
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e->'opts') = 'array' then e->'opts' else '[]'::jsonb end) o
    join public.menu_status ms
      on ms.sold_out and ms.item_id = 'opt:' || (e->>'id') || ':' || regexp_replace(coalesce(o->>'ko', ''), ' ×\d+$', '')
   where not coalesce((o->>'note')::boolean, false)
$$;

create or replace function public.orders_opt_soldout() returns trigger
language plpgsql as $$
declare v_out text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.source, 'web') not in ('web', 'dine') then return new; end if;
    v_out := public.opt_soldout_names(new.items);
  elsif new.source = 'dine' then
    -- 다이닝: 이번에 새로 들어온 추가 줄 (added = true, 예전 items 에 없던 것). 🔄 수정 줄은 added 가 없어서 제외
    select public.opt_soldout_names(coalesce(jsonb_agg(e), '[]'::jsonb)) into v_out
      from jsonb_array_elements(new.items) e
     where coalesce((e->>'added')::boolean, false) and not coalesce(old.items, '[]'::jsonb) @> jsonb_build_array(e);
  else
    -- add_items: 새 줄은 added = true, added_at = now() (같은 트랜잭션), 관리자 추가(byAdmin)는 제외
    select public.opt_soldout_names(coalesce(jsonb_agg(e), '[]'::jsonb)) into v_out
      from jsonb_array_elements(new.items) e
     where coalesce((e->>'added')::boolean, false) and not coalesce((e->>'byAdmin')::boolean, false)
       and e->>'added_at' is not null and (e->>'added_at')::timestamptz >= now() - interval '1 second';
  end if;
  if v_out is not null then raise exception 'sold_out:%', v_out; end if;
  return new;
end $$;

drop trigger if exists orders_opt_soldout on public.orders;
create trigger orders_opt_soldout before insert or update of items on public.orders
  for each row execute function public.orders_opt_soldout();
