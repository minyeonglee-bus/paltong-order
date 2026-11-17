-- JTV 메뉴(menu_config 분류 'JTV')는 jtv_places 위치(반경 radius_m) 배달만 (2026-11-17)
create table if not exists public.jtv_places (
  id serial primary key, name text not null, addr text, lat double precision not null, lng double precision not null,
  radius_m integer not null default 80, map_url text, active boolean not null default true, created_at timestamptz default now());
alter table public.jtv_places enable row level security;
drop policy if exists jtv_places_read on public.jtv_places;
create policy jtv_places_read on public.jtv_places for select using (active);

create or replace function public.orders_jtv_guard() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_has boolean; v_ok boolean;
begin
  if tg_op = 'UPDATE' and new.items is not distinct from old.items and new.lat is not distinct from old.lat and new.lng is not distinct from old.lng then
    return new;
  end if;
  select exists (select 1 from jsonb_array_elements(coalesce(new.items,'[]')) e(it)
                 where e.it->>'id' in (select i->>'id' from menu_config m, jsonb_array_elements(m.data) c, jsonb_array_elements(c->'items') i where m.id=1 and c->>'cat'='JTV'))
    into v_has;
  if not v_has then return new; end if;
  select exists (select 1 from jtv_places p where p.active and new.lat is not null and new.lng is not null
     and 6371000 * 2 * asin(sqrt(power(sin(radians(new.lat - p.lat)/2),2) + cos(radians(p.lat))*cos(radians(new.lat))*power(sin(radians(new.lng - p.lng)/2),2))) <= p.radius_m)
    into v_ok;
  if not v_ok then raise exception 'jtv_only'; end if;
  return new;
end $$;
drop trigger if exists orders_jtv_guard on public.orders;
create trigger orders_jtv_guard before insert or update on public.orders for each row execute function public.orders_jtv_guard();
