-- 📦 재고: 컨테이너(로컬) 그룹 + 🍗 치킨 냉동(체크박스 '주문필요') (사장님 2026-11-19)
-- 'korea' = 한국주문 컨테이너, 'container' = 컨테이너(1 pack = 50 pcs), 'chicken' = 치킨 냉동 (count_mode 'flag')

alter table public.inv_items add column if not exists need_order boolean not null default false;

insert into public.inv_items(id, name, name_ko, cat, unit, per_unit, use_unit, count_mode, low_at, sort) values
 ('radish_cup',  'Radish Cup',        '무 컵 (Radish)', 'container', 'pack', 50, 'pcs', 'bundle_pcs', 1, 30),
 ('sauce_cup_s', 'Sauce Cup Small',   '소스컵 소',      'container', 'pack', 50, 'pcs', 'bundle_pcs', 1, 31),
 ('sauce_cup_m', 'Sauce Cup Medium',  '소스컵 중',      'container', 'pack', 50, 'pcs', 'bundle_pcs', 1, 32),
 ('ck_yangnyeom','Yangnyeom sauce',   '양념소스',       'chicken',   '-',    null, null, 'flag', null, 90),
 ('ck_soy',      'Soy sauce',         '간장소스',       'chicken',   '-',    null, null, 'flag', null, 91),
 ('ck_garlic',   'Garlic sauce',      '마늘소스',       'chicken',   '-',    null, null, 'flag', null, 92),
 ('ck_powder',   'Chicken powder',    '치킨파우더',     'chicken',   '-',    null, null, 'flag', null, 93)
on conflict (id) do nothing;
