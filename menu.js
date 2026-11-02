/* =====================================================================
   메뉴 데이터 - 가격/옵션/메뉴 추가·삭제는 이 파일에서 수정하세요.
   id 는 영문/숫자로 된 고유값이어야 하고, 한번 정한 뒤에는 바꾸지 않는 것이 좋습니다
   (품절 상태가 id 기준으로 저장됩니다).

   옵션 그룹에 max:2 를 넣으면 '선택 안 함 ~ 최대 2개'까지 여러 개 고를 수 있습니다.
   max 가 없으면 한 개만 고르는 방식(첫 번째가 기본 선택)입니다.
   required:true → 필수 옵션 (손님이 꼭 골라야 담을 수 있음) / required:false → 필수 아님 (안 골라도 됨)
     · 값을 안 쓰면: 한 개만 고르기 = 필수(첫 번째 기본 선택), 여러 개 고르기·수량형 = 필수 아님
     · 한 개만 고르기 + required:false 이면 아무것도 선택 안 된 상태로 시작하고, 다시 누르면 선택 해제됩니다
     · 관리자 '메뉴 관리 → ✏️ 메뉴 수정'의 옵션 그룹마다 [필수 옵션 / 필수 아님] 으로 바꿀 수 있습니다
   requires:[메뉴id...] 를 넣으면 그 메뉴 중 하나가 장바구니에 있어야 주문할 수 있습니다 (셀프 볶음밥 참고).
   type:"count" 와 maxQty:2 를 쓰면 −/+ 버튼으로 0 ~ 2번까지 추가할 수 있습니다 (꼼장어 참고).
   sale:1200 을 넣으면 정가(price)에 줄을 긋고 할인가로 팝니다 (쭈꾸미삼겹살 참고).
   isNew:true → 맨 위 '신메뉴' 칸에도 보임 / isHot:true → 맨 위 '인기메뉴' 칸에도 보임 (관리자 메뉴 관리에서 켜고 끌 수 있음)
   ※ 할인가·카테고리 이동·품절은 관리자 화면 '메뉴 관리'에서 바로 바꿀 수 있습니다 (여기 값보다 우선).
   ===================================================================== */
const OPT_PART  = (d1=0) => ({ title:"부위", titleEn:"Type", choices:[{label:"뼈",en:"Bone-in",delta:0},{label:"무뼈",en:"Boneless",delta:d1}] });
/* 맵기 — 한정메뉴·메인 안주류에 자동으로 붙습니다 (아래 SPICY_CATS 참고) */
const OPT_SPICE = { title:"맵기", titleEn:"Spice level", choices:[{label:"보통",en:"Regular",delta:0},{label:"덜맵게",en:"Less spicy",delta:0},{label:"더맵게",en:"Extra spicy",delta:0}] };
const OPT_SIZE  = (d) => ({ title:"마리수", titleEn:"Size", choices:[{label:"반마리",en:"Half",delta:0},{label:"한마리",en:"Whole",delta:d}] });

/* 셀프 볶음밥은 이 메뉴 중 하나를 같이 주문해야 합니다 (남은 양념에 볶아드리는 메뉴) */
const FRIED_RICE_BASE = ["dakdoritang", "gukmuldakbal", "gomjangeo"];

window.PALTONG_MENU = [
  {
    cat: "★ 한정판매 ★", catEn: "★ LIMITED ★", limited: true,
    items: [
      { id:"nakji_deopbap", name:"낙지덮밥", en:"Spicy Octopus Rice Bowl", price:450, isLimited:true },
      { id:"nakji_bokkeum", name:"낙지볶음 (500g)", en:"Spicy Stir-fried Octopus (500g)", price:1000, isLimited:true },
    ]
  },
  {
    cat: "메인 안주류", catEn: "MAIN DISH",
    items: [
      { id:"jjukkumi_samgyeop", name:"쭈꾸미삼겹살", en:"Spicy Baby Octopus & Pork Belly", isNew:true, price:1500, sale:1200 },   // 신메뉴 · ₱1,500 → ₱1,200 할인
      { id:"gomjangeo", name:"꼼장어", en:"Eel", price:1400,
        options:[{ title:"추가", titleEn:"Add-on", type:"count",
          choices:[{ label:"150G 추가", en:"Extra 150g", delta:150, maxQty:2 }] }] },
      { id:"dakdoritang", name:"닭도리탕", en:"Dakdoritang", price:1350,
        options:[{ title:"부위", titleEn:"Type", choices:[{label:"뼈있는",en:"Bone-in",delta:0},{label:"순살",en:"Boneless",delta:50}] }] },
      { id:"jjukkumi", name:"쭈꾸미", en:"Pusit", price:1200 },
      { id:"odolppyeo", name:"오돌뼈", en:"Cartilage", price:900 },
      { id:"redwing", name:"빨간 날개", en:"Red Wing", price:900 },
      { id:"redsamgyeop", name:"빨간 삼겹", en:"Red Samgyeop", price:900 },
      { id:"jikhwa_dakbal", name:"직화 닭발", en:"Grilled Dakbal", price:800, options:[OPT_PART(100)] },   // 무뼈 +₱100
      { id:"gukmuldakbal", name:"국물닭발", en:"Dakbal Soup", isNew:true, price:800, options:[OPT_PART(100)] },   // 무뼈 +₱100
    ]
  },
  {
    cat: "치킨류", catEn: "CHICKEN",
    items: [
      { id:"fried_bone", name:"후라이드 치킨 (뼈)", en:"Fried (Bone-in)", price:440, options:[OPT_SIZE(400)] },
      { id:"fried_boneless", name:"후라이드 치킨 (순살)", en:"Fried (Boneless)", price:480, options:[OPT_SIZE(420)] },
      { id:"yangnyeom_bone", name:"양념 치킨 (뼈)", en:"Yangnyeom (Bone-in)", price:480, options:[OPT_SIZE(400)] },
      { id:"yangnyeom_boneless", name:"양념 치킨 (순살)", en:"Yangnyeom (Boneless)", price:500, options:[OPT_SIZE(420)] },
      { id:"garlic_bone", name:"마늘 치킨 (뼈)", en:"Garlic (Bone-in)", price:480, options:[OPT_SIZE(400)] },
      { id:"garlic_boneless", name:"마늘 치킨 (순살)", en:"Garlic (Boneless)", price:500, options:[OPT_SIZE(420)] },
      { id:"soy_bone", name:"간장 치킨 (뼈)", en:"Soy (Bone-in)", price:480, options:[OPT_SIZE(400)] },
      { id:"soy_boneless", name:"간장 치킨 (순살)", en:"Soy (Boneless)", price:500, options:[OPT_SIZE(420)] },
      { id:"spicysoy_bone", name:"땡초간장 치킨 (뼈)", en:"Spicy Soy (Bone-in)", price:480, options:[OPT_SIZE(400)] },
      { id:"spicysoy_boneless", name:"땡초간장 치킨 (순살)", en:"Spicy Soy (Boneless)", price:500, options:[OPT_SIZE(420)] },
      { id:"tonggu", name:"영계통구이", en:"Whole Roast Chicken", price:700 },
      { id:"tongjipfried", name:"똥집 후라이드", en:"Fried Gizzard", price:700 },
      { id:"tongjipbokkeum", name:"똥집볶음", en:"Stir-fried Gizzard", isNew:true, price:700 },
    ]
  },
  {
    cat: "사이드 & 안주류", catEn: "SIDES",
    items: [
      { id:"meoktae", name:"먹태", en:"Muktae", price:800 },
      { id:"odeng", name:"오뎅탕", en:"Fish Cake Soup", price:600 },
      { id:"tteokbokki", name:"떡볶이", en:"Tteokbokki", price:600 },
      { id:"cheeseball", name:"치즈볼", en:"Cheese Ball", price:500 },
      { id:"butterodari", name:"버터오다리", en:"Butter Squid", price:900 },
      { id:"jwipo", name:"쥐포", en:"Dried Filefish", price:500 },
      { id:"nurungji", name:"누룽지탕", en:"Scorched Rice Soup", price:220 },
      { id:"gyeranjjim", name:"계란찜", en:"Steamed Egg", price:220 },
      { id:"sausage", name:"모듬소세지", en:"Sausage Platter", price:900 },
    ]
  },
  {
    cat: "주먹밥류", catEn: "RICE BALL",
    items: [
      { id:"tunamayo", name:"참치 마요", en:"Tuna Mayo", price:250 },
      { id:"redtuna", name:"빨간 참치", en:"Spicy Tuna", price:250 },
      { id:"nalchial", name:"날치알", en:"Flying Fish Roe", price:240 },
      { id:"selfball", name:"셀프 주먹밥", en:"DIY Rice Ball", price:200 },
      { id:"selfbokkeum", name:"셀프 볶음밥", en:"DIY Fried Rice", price:100, requires: FRIED_RICE_BASE },
      { id:"selfcheesebokkeum", name:"셀프 치즈볶음밥", en:"DIY Cheese Fried Rice", price:300, requires: FRIED_RICE_BASE },
      { id:"rice", name:"공기밥", en:"Steamed Rice", price:50 },
    ]
  },
  {
    cat: "주류 및 음료", catEn: "DRINKS",
    items: [
      { id:"draftbeer", name:"생맥주", en:"Draft Beer", price:400,
        options:[{ title:"종류", titleEn:"Type", choices:[{label:"라이트",en:"San Miguel Light",delta:0},{label:"블랑카",en:"San Miguel Blanca",delta:60}] }] },   // 블랑카 +₱60
      { id:"jinro", name:"진로/막걸리/새로", en:"Jinro/Makgeolli/Saero", price:350,
        options:[{ title:"종류", titleEn:"Type", choices:[{label:"진로",en:"Jinro",delta:0},{label:"막걸리",en:"Makgeolli",delta:0},{label:"새로",en:"Saero",delta:0}] }] },
      { id:"chamisul", name:"참이슬/처음처럼", en:"Chamisul/Cheoeum", price:300,
        options:[{ title:"종류", titleEn:"Type", choices:[{label:"참이슬",en:"Chamisul",delta:0},{label:"처음처럼",en:"Cheoeum",delta:0}] }] },
      { id:"sanmiguel", name:"산미구엘", en:"San Miguel", price:100,
        options:[{ title:"맛", titleEn:"Flavor", choices:[{label:"라이트",en:"Light",delta:0},{label:"필센",en:"Pilsen",delta:0},{label:"애플",en:"Apple",delta:0}] }] },
      { id:"coolpis", name:"쿨피스", en:"Coolpis", price:90,
        options:[{ title:"맛", titleEn:"Flavor", choices:[{label:"복숭아",en:"Peach",delta:0},{label:"파인",en:"Pineapple",delta:0}] }] },
      { id:"soda", name:"콜라/사이다/로얄", en:"Coke/Sprite/Royal", price:80,
        options:[{ title:"종류", titleEn:"Type", choices:[{label:"콜라",en:"Coke",delta:0},{label:"사이다",en:"Sprite",delta:0},{label:"로얄",en:"Royal",delta:0}] }] },
    ]
  },
];

/* 한정메뉴 · 메인 안주류의 모든 메뉴에 '맵기' 옵션을 맨 뒤에 추가합니다.
   (다른 카테고리에도 붙이려면 SPICY_CATS 에 카테고리 이름을 추가하세요) */
const SPICY_CATS = ["★ 한정판매 ★", "메인 안주류"];
window.PALTONG_MENU.forEach(c => {
  if(!SPICY_CATS.includes(c.cat)) return;
  c.items.forEach(it => { if(!(it.options || []).some(g => g.title === "맵기")) it.options = [...(it.options || []), OPT_SPICE]; });
});
