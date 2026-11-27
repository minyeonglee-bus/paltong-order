-- 🍶 소주 이벤트 (사장님 2026-11-27)
-- 영업일 11/27 · 11/28 (마닐라 오전 8시 기준), 쭈꾸미 · 쭈꾸미 삼겹(· 한국에서 온 쭈꾸미) 주문 시
-- 참이슬/처음처럼 1병 ₱200, 주문(테이블)당 최대 5병. 진로 · 새로 제외. 배달K(DK) 주문 제외. 매장 · 배달 · 웹 · 전화/바이버/카톡 주문 모두 적용.
-- 주문 items 가 들어오거나 바뀔 때마다 소주 줄을 다시 계산: 이벤트 병은 줄을 나눠 promo='soju200', promoOrig=원래 단가.
-- subtotal 은 소주 줄 금액 차이만큼 조정 (할인 · 매장 할인 % 도 맞춤). 화면 쪽 같은 규칙: common.js PT.sojuPromo.
-- 끝나면 그대로 둬도 됨 (날짜 밖이면 아무것도 안 함). 지우려면: drop trigger orders_promo_soju on public.orders;

create or replace function public.promo_soju_line(e jsonb) returns boolean
language sql immutable as $$
  select not coalesce((e->>'svc')::boolean, false)
     and (not coalesce((e->>'priceByAdmin')::boolean, false) or e ? 'promo')
     and (e->>'id' = 'chamisul'
          or (coalesce((e->>'custom')::boolean, false)
              and coalesce(e->>'name', '') || ' ' || coalesce(e->>'en', '') ~* '참이슬|처음처럼|chamisul|chum ?churum'
              and not (coalesce(e->>'name', '') || ' ' || coalesce(e->>'en', '') ~* '진로|jinro|새로|saero')))
$$;

create or replace function public.promo_soju_qual(e jsonb) returns boolean
language sql immutable as $$
  select not coalesce((e->>'svc')::boolean, false)
     and (e->>'id' in ('jjukkumi', 'jjukkumi_samgyeop', 'm_mvg4m5sf')
          or (coalesce((e->>'custom')::boolean, false)
              and coalesce(e->>'name', '') || ' ' || coalesce(e->>'en', '') ~* '쭈꾸미|쭈삼|jjuk|pusit'))
$$;

create or replace function public.orders_promo_soju() returns trigger
language plpgsql as $$
declare
  v_day date := ((coalesce(new.created_at, now()) at time zone 'Asia/Manila') - interval '8 hours')::date;
  v_on boolean; e jsonb; v_out jsonb := '[]'::jsonb;
  v_left int := 5; v_old int := 0; v_new int := 0; q int; n int; u int; v_pct int;
begin
  if new.items is null or jsonb_typeof(new.items) <> 'array' then return new; end if;
  if v_day not between date '2026-11-27' and date '2026-11-28' then return new; end if;
  if coalesce(new.channel, '') = 'DK' then return new; end if;
  if not exists (select 1 from jsonb_array_elements(new.items) x where public.promo_soju_line(x)) then return new; end if;
  v_on := exists (select 1 from jsonb_array_elements(new.items) x where public.promo_soju_qual(x));

  for e in select value from jsonb_array_elements(new.items) loop
    if public.promo_soju_line(e) then
      q := round(coalesce((e->>'qty')::numeric, 0))::int;
      u := round(coalesce((e->>'unitPrice')::numeric, 0))::int;
      v_old := v_old + u * q;
      if e ? 'promo' then
        u := coalesce(round((e->>'promoOrig')::numeric)::int, u);
        e := (e - 'promo' - 'promoOrig') || jsonb_build_object('unitPrice', u);
      end if;
      if v_on and v_left > 0 and u > 200 and q > 0 then
        n := least(q, v_left); v_left := v_left - n;
        v_out := v_out || jsonb_build_array(e || jsonb_build_object('qty', n, 'unitPrice', 200, 'promo', 'soju200', 'promoOrig', u));
        v_new := v_new + 200 * n;
        if q > n then
          v_out := v_out || jsonb_build_array(e || jsonb_build_object('qty', q - n));
          v_new := v_new + u * (q - n);
        end if;
      else
        v_out := v_out || jsonb_build_array(e);
        v_new := v_new + u * q;
      end if;
    else
      v_out := v_out || jsonb_build_array(e);
    end if;
  end loop;

  if v_out = new.items then return new; end if;
  new.items := v_out;
  new.subtotal := greatest(0, coalesce(new.subtotal, 0) + (v_new - v_old));
  new.discount := least(coalesce(new.discount, 0), new.subtotal);
  v_pct := nullif(substring(coalesce(new.store_discount_label, '') from '(\d+)%'), '')::int;
  if v_pct is not null then new.store_discount := floor(greatest(0, new.subtotal - coalesce(new.discount, 0)) * v_pct / 100.0);
  elsif new.store_discount is not null then new.store_discount := least(new.store_discount, greatest(0, new.subtotal - coalesce(new.discount, 0)));
  end if;
  return new;
end $$;

-- 이름 순서: orders_promo_soju 가 orders_total_calc 보다 먼저 돌아서 total 도 새 subtotal 로 계산됨
drop trigger if exists orders_promo_soju on public.orders;
create trigger orders_promo_soju before insert or update of items on public.orders
  for each row execute function public.orders_promo_soju();
