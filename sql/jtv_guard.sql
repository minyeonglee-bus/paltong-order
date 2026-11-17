-- JTV 메뉴(menu_config 분류 'JTV')는 jtv_places 위치(반경 radius_m) 배달만 (2026-11-17)
create table if not exists public.jtv_places (
  id serial primary key, name text not null, addr text, lat double precision not null, lng double precision not null,
  radius_m integer not null default 80, map_url text, active boolean not null default true, created_at timestamptz default now());
alter table public.jtv_places enable row level security;
drop policy if exists jtv_places_read on public.jtv_places;
create policy jtv_places_read on public.jtv_places for select using (active);

create or replace function public.orders_jtv_guard() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_has boolean; v_at boolean; l jsonb; it jsonb; v_exp numeric; o jsonb;
begin
  if tg_op = 'UPDATE' and new.items is not distinct from old.items and new.lat is not distinct from old.lat and new.lng is not distinct from old.lng then
    return new;
  end if;
  select exists (select 1 from jtv_places p where p.active and new.lat is not null and new.lng is not null
     and 6371000 * 2 * asin(sqrt(power(sin(radians(new.lat - p.lat)/2),2) + cos(radians(p.lat))*cos(radians(new.lat))*power(sin(radians(new.lng - p.lng)/2),2))) <= p.radius_m)
    into v_at;
  -- 1) JTV 메뉴(분류 'JTV')는 JTV 장소 배달만
  select exists (select 1 from jsonb_array_elements(coalesce(new.items,'[]')) e(it)
                 where e.it->>'id' in (select i->>'id' from menu_config m, jsonb_array_elements(m.data) c, jsonb_array_elements(c->'items') i where m.id=1 and c->>'cat'='JTV'))
    into v_has;
  if v_has and not v_at then raise exception 'jtv_only'; end if;
  -- 2) 손님 웹 주문이 JTV 장소로 가면 기존 메뉴 할인 없이 정가 (사장님 11/17)
  if v_at and coalesce(new.source,'web') = 'web' then
    for l in select * from jsonb_array_elements(coalesce(new.items,'[]')) loop
      if coalesce((l->>'custom')::boolean,false) then continue; end if;
      if tg_op = 'UPDATE' and not (coalesce((l->>'added')::boolean,false) and not coalesce((l->>'byAdmin')::boolean,false)) then continue; end if;   -- 수정 때는 손님이 추가한 줄만
      select i into it from menu_config m, jsonb_array_elements(m.data) c, jsonb_array_elements(c->'items') i where m.id=1 and i->>'id' = l->>'id' limit 1;
      if it is null or coalesce((it->>'sale')::numeric,0) <= 0 or (it->>'sale')::numeric >= (it->>'price')::numeric then continue; end if;
      v_exp := (it->>'price')::numeric;
      for o in select * from jsonb_array_elements(coalesce(l->'opts','[]')) loop
        if coalesce((o->>'note')::boolean,false) or o->>'g' is null or o->>'c' is null then continue; end if;
        v_exp := v_exp + coalesce((it->'options'->((o->>'g')::int)->'choices'->((o->>'c')::int)->>'delta')::numeric,0) * coalesce((o->>'n')::numeric,1);
      end loop;
      if coalesce((l->>'unitPrice')::numeric,0) < v_exp then raise exception 'jtv_price'; end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists orders_jtv_guard on public.orders;
create trigger orders_jtv_guard before insert or update on public.orders for each row execute function public.orders_jtv_guard();
