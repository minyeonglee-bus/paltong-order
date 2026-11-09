-- 📦 재고 시작값 (직원 보고 2026-11-09 18:04) + 사장님이 알려준 레시피
-- per_unit 이 null 인 품목(용기·쭈꾸미 등)은 '1 unit 에 몇 개/몇 g'을 알기 전까지 자동 차감 안 함.

insert into public.inv_items(id, name, name_ko, cat, unit, per_unit, use_unit, low_at, sort) values
 -- Dry
 ('dakdori_bowl','Dakdoritang bowl','닭도리탕 그릇','dry','plastic',50,'pcs',1,10),
 ('eel_dry','Eel container','꼼장어 용기','dry','plastic',50,'pcs',1,11),
 ('c154','154 container','154 용기','korea','plastic',100,'pcs',3,20),
 ('c155','155 container','155 용기','korea','plastic',100,'pcs',0.5,21),
 ('c156','156 container','156 용기','korea','plastic',100,'pcs',3,22),
 ('c157','157 container','157 용기','korea','plastic',100,'pcs',3,23),
 ('chicken_powder','Chicken powder','치킨 파우더','dry','plastic',null,null,1,30),
 ('spoon','Spoon','숟가락','dry','plastic',null,null,1,31),
 ('parchment','Parchment paper','종이호일','dry','plastic',null,null,3,32),
 ('box_big','Chicken box big','치킨 박스 (대)','dry','pack',null,'pcs',3,33),
 ('box_small','Chicken box small','치킨 박스 (소)','dry','pack',null,'pcs',3,34),
 ('nurungji','Nurungji','누룽지','dry','pack',null,null,1,35),
 ('sesame_oil','Sesame oil','참기름','dry','pcs',null,null,1,36),
 ('roll_film','Roll film','롤 필름','dry','pcs',null,null,1,37),
 ('honey_mustard','Honey mustard (sachet)','허니머스타드 (소스)','dry','pack',null,null,1,38),
 -- Frozen
 ('maktae','Maktae','먹태','frozen','pcs',null,null,10,50),
 ('eel','Eel','꼼장어','frozen','pack',900,'g',2,51),
 ('pusit_kr','Pusit Korean','한국 쭈꾸미','frozen','pcs',null,'g',1,52),
 ('pusit_local','Local pusit','로컬 쭈꾸미','frozen','pcs',null,'g',1,53),
 ('samgyeop','Pork belly (samgyeop)','삼겹살','frozen','pcs',null,'g',1,54),
 ('odolppyeo','Odolpyeo','오돌뼈','frozen','pcs',null,null,1,55),
 ('cheese_ball','Cheese ball','치즈볼','frozen','pack',null,null,3,56),
 ('cheese_stick','Cheese stick','치즈스틱','frozen','pack',null,null,3,57),
 ('odari','Odari','오다리','frozen','pcs',null,null,3,58),
 ('odengtang','Odengtang','오뎅탕','frozen','pcs',null,null,3,59),
 ('crackers','Crackers','크래커','frozen','pack',null,null,3,60),
 ('jwipo','Jwipo','쥐포','frozen','pack',null,null,3,61),
 ('sausage','Sausage','소세지','frozen','pcs',null,null,3,62),
 ('nalchial','Nalchial','날치알','frozen','pcs',null,null,1,63),
 -- Drinks
 ('coolpis_peach','Coolpis peach','쿨피스 피치','drink','can',null,null,6,80),
 ('coolpis_zero','Coolpis zero','쿨피스 제로','drink','can',null,null,6,81),
 ('coolpis_pine','Coolpis pineapple','쿨피스 파인','drink','can',null,null,6,82)
on conflict (id) do nothing;

-- 시작 재고 (실사로 기록 → 기록에 남음)
insert into public.inv_moves(item_id, delta, kind, counted, by_name, note)
select v.id, v.n, 'count', v.n, 'Staff report', '2026-11-09 18:04 report' from (values
 ('dakdori_bowl',7),('eel_dry',5),('c154',11),('c156',0),('c155',1),('c157',22),('chicken_powder',3),('spoon',3),
 ('parchment',22),('box_big',15),('box_small',9),('nurungji',3),('sesame_oil',3),('roll_film',0),('honey_mustard',0),
 ('maktae',55),('eel',7),('pusit_kr',2),('pusit_local',0),('odolppyeo',0),('cheese_ball',16),('cheese_stick',11),('odari',12),
 ('odengtang',10),('crackers',12),('jwipo',11),('sausage',9),('nalchial',4)
) v(id, n)
where not exists (select 1 from public.inv_moves m where m.item_id = v.id and m.kind = 'count');
update public.inv_items set counted_at = '2026-11-09 18:04+08', counted_by = 'Staff report'
 where id in ('dakdori_bowl','eel_dry','c154','c156','c155','c157','chicken_powder','spoon','parchment','box_big','box_small','nurungji','sesame_oil','roll_film','honey_mustard',
  'maktae','eel','pusit_kr','pusit_local','odolppyeo','cheese_ball','cheese_stick','odari','odengtang','crackers','jwipo','sausage','nalchial') and counted_at is null;

-- 레시피
insert into public.inv_recipes(item_id, menu_id, name_kw, name_not, opt_ko, opt_not, per_opt_n, amount, note)
select * from (values
 -- 꼼장어: 1 pack 900 g, 1 order 450 g, 150G 추가 × 개수
 ('eel','gomjangeo',null,null,null,null,false,450::numeric,'1 order 450g'),
 ('dakdori_bowl','dakdoritang',null,null,null,null,false,1,'dakdoritang bowl'),
 ('dakdori_bowl',null,'dakdori|닭도리|chicken stew',null,null,null,false,1,'external dakdoritang'),
 ('eel','gomjangeo',null,null,'150G 추가',null,true,150,'+150g add-on'),
 ('eel',null,'hagfish|꼼장어|\meel\M',null,null,null,false,450,'external order'),
 ('eel_dry','gomjangeo',null,null,null,null,false,1,'eel container'),
 ('eel_dry',null,'hagfish|꼼장어|\meel\M',null,null,null,false,1,'external eel container'),
 -- 154: 무뼈 닭발 · 삼겹 · 한국 쭈꾸미
 ('c154','jikhwa_dakbal',null,null,'무뼈',null,false,1,'boneless dakbal'),
 ('c154','redsamgyeop',null,null,null,null,false,1,'samgyeop'),
 ('c154','m_mvg4m5sf',null,null,null,null,false,1,'korean pusit'),
 ('c154',null,'boneless.*dakbal|무뼈.*닭발','gukmul|soup',null,null,false,1,'external boneless dakbal'),
 ('c154',null,'red.*samgyeop|빨간.*삼겹',null,null,null,false,1,'external samgyeop'),
 ('c154',null,'from korea.*pusit|korean.*(pusit|octopus)|red pusit','pork|samgyeop',null,null,false,1,'external korean pusit'),
 -- 157: 뼈 닭발 · 국물닭발 · 소세지 · 누룽지 · 떡볶이
 ('c157','jikhwa_dakbal',null,null,'뼈',null,false,1,'dakbal bone'),
 ('c157','gukmuldakbal',null,null,null,null,false,1,'gukmul dakbal'),
 ('c157','sausage',null,null,null,null,false,1,'sausage'),
 ('c157','nurungji',null,null,null,null,false,1,'nurungji'),
 ('c157','tteokbokki',null,null,null,null,false,1,'tteokbokki'),
 ('c157','odeng',null,null,null,null,false,1,'odengtang'),
 ('c157',null,'odeng|fish ?cake soup|오뎅탕|어묵탕','half|반',null,null,false,1,'external odengtang'),
 ('c157',null,'gukmul|soup.*dakbal|국물.*닭발',null,null,null,false,1,'external gukmul dakbal'),
 ('c157',null,'sausage|소세지|소시지',null,null,null,false,1,'external sausage'),
 ('c157',null,'nurungji|누룽지|scorched',null,null,null,false,1,'external nurungji'),
 ('c157',null,'tteokbokki|떡볶이','fish ?cake soup|odeng',null,null,false,1,'external tteokbokki'),
 -- 155: 떡볶이 반 + 오뎅탕 반 (사장님 11/9)
 ('c155','tteok_odeng_half',null,null,null,null,false,1,'tteok-odeng-tang'),
 ('c155',null,'half.*(tteok|rice ?cake).*half.*(odeng|fish ?cake)|떡뎅|떡볶이\s*반.*오뎅탕?\s*반|tteok.?odeng',null,null,null,false,1,'external tteok-odeng-tang'),
 -- 156: 밥 메뉴 전부 — 주먹밥 · 볶음밥 · 공기밥 (사장님 11/9)
 ('c156','tunamayo',null,null,null,null,false,1,'rice ball'),
 ('c156','redtuna',null,null,null,null,false,1,'rice ball'),
 ('c156','nalchial',null,null,null,null,false,1,'rice ball'),
 ('c156','selfball',null,null,null,null,false,1,'rice ball'),
 ('c156','selfbokkeum',null,null,null,null,false,1,'fried rice'),
 ('c156','selfcheesebokkeum',null,null,null,null,false,1,'cheese fried rice'),
 ('c156','rice',null,null,null,null,false,1,'steamed rice'),
 ('c156',null,'(fried|plain|steamed|white) ?rice|rice ?ball|볶음밥|공기밥|공깃밥|주먹밥','rice ?cake',null,null,false,1,'external rice / rice ball'),
 -- 쭈꾸미삼겹살: 쭈꾸미 250 g + 삼겹 250 g (쭈꾸미 Local / From Korea)
 ('pusit_local','jjukkumi_samgyeop',null,null,null,'From Korea',false,250,'jjusam local pusit 250g'),
 ('pusit_kr','jjukkumi_samgyeop',null,null,'From Korea',null,false,250,'jjusam korean pusit 250g'),
 ('samgyeop','jjukkumi_samgyeop',null,null,null,null,false,250,'jjusam pork 250g'),
 -- 쭈꾸미 볶음 500 g
 ('pusit_local','jjukkumi',null,null,null,null,false,500,'jjukkumi bokkeum 500g'),
 ('pusit_kr','m_mvg4m5sf',null,null,null,null,false,500,'korean jjukkumi 500g'),
 ('pusit_kr',null,'from korea.*pusit|korean.*(pusit|octopus)|red pusit','pork|samgyeop',null,null,false,500,'external korean pusit 500g'),
 -- 쿨피스
 ('coolpis_peach','coolpis',null,null,'복숭아',null,false,1,null),
 ('coolpis_pine','coolpis',null,null,'파인',null,false,1,null),
 ('coolpis_zero','coolpis',null,null,'제로',null,false,1,null),
 ('coolpis_peach',null,'cool ?pi(s|ece).*(peach|\mp\M)|쿨피스.*(피치|복숭아)','zero|pine',null,null,false,1,'external'),
 ('coolpis_pine',null,'cool ?pi(s|ece).*pine|쿨피스.*파인',null,null,null,false,1,'external'),
 ('coolpis_zero',null,'cool ?pi(s|ece).*zero|쿨피스.*제로','pine',null,null,false,1,'external')
) v(item_id, menu_id, name_kw, name_not, opt_ko, opt_not, per_opt_n, amount, note)
where not exists (select 1 from public.inv_recipes);

-- 11/9 18:57 사장님: 154~157 = From Korea (따로 묶음, 3 plastic 알림), 꼼장어 용기·닭도리탕 그릇 = 현지 구매 (1 bundle 남으면 1 bundle 사기)
update public.inv_items set note = '🇰🇷 From Korea — 미리 주문 (배송 오래 걸림)' where id in ('c154','c155','c156','c157') and note is null;
update public.inv_items set note = '🛒 현지 구매 — 1 bundle(plastic)씩 사기' where id in ('dakdori_bowl','eel_dry') and note is null;
update public.inv_items set sub_id = 'c157' where id = 'c156' and sub_id is null;  -- 156 없는 동안 157 (사장님 11/9 19:31)
