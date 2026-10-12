/* =====================================================================
   공통 모듈 - 데이터 연결(Supabase / 데모), 한·영 병기, 영수증 인쇄
   (보통은 수정할 필요 없습니다)
   ===================================================================== */
(function(){
const CFG  = window.PALTONG_CONFIG;
const MENU = window.PALTONG_MENU;
const ITEM_BY_ID = {};
MENU.forEach(c => c.items.forEach(it => { ITEM_BY_ID[it.id] = it; it.menuPrice = it.price; it.listPrice = it.price; it.homeCat = c.cat; it.baseNew = !!it.isNew; it.baseHot = !!it.isHot; }));
/* 메뉴판 원래 모양 (관리자 '메뉴 관리'의 카테고리 이동·할인가를 여기에 덧씌움) */
const MENU_BASE = MENU.map(c => ({ ...c, items: c.items.slice() }));
const CATS = MENU_BASE.map(c => ({ cat: c.cat, catEn: c.catEn }));
let menuOv = {}, menuCfgActive = false;
function applyMenuOverrides(ov){
  menuOv = ov || {};
  Object.values(ITEM_BY_ID).forEach(it => {
    const o = menuCfgActive ? {} : (menuOv[it.id] || {});   // 26단계: 관리자가 저장한 메뉴판이 있으면 그게 기준
    it.listPrice = +o.base_price > 0 ? +o.base_price : it.menuPrice;          // 정가: 관리자 값 우선 (25단계)
    const sale = o.sale_price != null ? +o.sale_price : (it.sale || 0);     // 관리자 값 우선 (0 = 할인 없음)
    it.price = sale > 0 && sale < it.listPrice ? sale : it.listPrice;
    it.onSale = it.price < it.listPrice;
    it.cat = o.cat && CATS.some(c => c.cat === o.cat) ? o.cat : it.homeCat;
    it.isNew = o.is_new != null ? !!o.is_new : (o.cat === "신메뉴" || it.baseNew);    // 🆕 신메뉴 표시
    it.isHot = o.is_hot != null ? !!o.is_hot : it.baseHot;                            // 🔥 인기 표시
  });
  const next = MENU_BASE.map(c => ({ ...c, items: [] }));
  MENU_BASE.forEach(c => c.items.forEach(it => { const n = next.find(x => x.cat === it.cat) || next.find(x => x.cat === it.homeCat); if(n) n.items.push(it); }));
  MENU.length = 0; next.forEach(c => MENU.push(c));
  try{ GLOSS = null; }catch(e){ /* 처음 불릴 때는 아직 선언 전 */ }
}
/* 주문 날짜 (마닐라 날짜 YYYY-MM-DD) — 주문번호는 날짜마다 1번부터 (27단계) */
const manilaDay = d => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
/* 영업일 기준: 오전 8:00 ~ 다음날 오전 7:59 를 하루로 봄 (SQL 33단계와 같은 값) */
const DAY_START_HOUR = 8;
const bizDay = d => manilaDay(new Date(d).getTime() - DAY_START_HOUR * 3600e3);
const bizStart = day => new Date(`${day}T${String(DAY_START_HOUR).padStart(2, "0")}:00:00+08:00`);
const orderDay = o => o.order_date || bizDay(o.created_at);
/* 가격 지문: 메뉴별 정가·할인가·옵션 추가금 (바뀌면 가격 비밀번호 필요 — SQL menu_price_sig 와 같음) */
function priceSig(data){
  const o = {};
  (data || []).forEach(c => (c.items || []).forEach(it => { o[it.id] = { p: +it.price, s: +(it.sale || 0),
    o: (it.options || []).flatMap(g => (g.choices || []).map(ch => [g.title, ch.label, +(ch.delta || 0)])) }; }));
  return Object.keys(o).sort().map(k => [k, o[k]]);
}
/* 관리자가 저장한 메뉴판(26단계 menu_config)으로 교체 — 손님에게는 숨긴 메뉴 제외 */
function loadMenuData(data, opts = {}){
  if(!Array.isArray(data) || !data.length) return false;
  menuCfgActive = true;
  MENU_BASE.length = 0; CATS.length = 0;
  data.forEach(c => {
    const cc = { cat: String(c.cat), catEn: String(c.catEn || c.cat), limited: !!c.limited, items: [] };
    (c.items || []).forEach(raw => {
      const it = JSON.parse(JSON.stringify(raw));
      it.price = +it.price; it.menuPrice = it.price; it.listPrice = it.price; it.homeCat = cc.cat; it.cat = cc.cat;
      it.baseNew = !!it.isNew; it.baseHot = !!it.isHot;
      ITEM_BY_ID[it.id] = it;                                  // 예전 주문의 메뉴도 찾을 수 있게 남겨둠
      if(!it.hidden || opts.includeHidden) cc.items.push(it);
    });
    MENU_BASE.push(cc); CATS.push({ cat: cc.cat, catEn: cc.catEn });
  });
  applyMenuOverrides({});
  return true;
}
/* 지금 메뉴판을 저장용 JSON으로 (관리자 메뉴 편집) */
function exportMenu(){
  const pick = it => {
    const o = { id: it.id, name: it.name, en: it.en || "", price: it.listPrice };
    if(it.onSale) o.sale = it.price;
    if(it.saleDine) o.saleDine = true;   // 🍽 다이닝에도 할인가 적용 (R15)
    if(it.isNew) o.isNew = true; if(it.isHot) o.isHot = true; if(it.isLimited) o.isLimited = true; if(it.hidden) o.hidden = true;
    if(it.requires && it.requires.length) o.requires = it.requires.slice();
    if(it.options && it.options.length) o.options = JSON.parse(JSON.stringify(it.options));
    return o;
  };
  return MENU_BASE.map(c => ({ cat: c.cat, catEn: c.catEn, ...(c.limited ? { limited: true } : {}),
    items: MENU_BASE.flatMap(x => x.items).filter(it => it.cat === c.cat).map(pick) }));
}
applyMenuOverrides({});

/* ---------------- helpers ---------------- */
/* ---------- 번역 전 정리 ----------
   필리핀 손님이 쓰는 호칭(ma'am, sir, po …)은 번역기가 '엄마'·'선생님'으로 바꿔버려서, 번역하기 전에 빼거나 쉬운 말로 바꿉니다.
   예: "Yes ma'am" → "Yes" → "네" / "Salamat po!" → "Thank you!" → "감사합니다!" */
const TR_EN_FIX = [
  [/\bopo\b/gi, "yes"], [/\bsalamat\b/gi, "thank you"], [/\bsige\b/gi, "okay"], [/\bingat\b/gi, "take care"],
  [/\bwala\b/gi, "none"], [/\bmeron\b/gi, "there is"], [/\bpaki\b/gi, "please"],
  [/(^|[\s,.!?])(ma['’`´]?a?m|madam|maddam|sir+|ser|po|poh|kuya|maam)(?=$|[\s,.!?…~]+)/gi, "$1"],
];
const TR_KO_FIX = [[/고객님|손님께서|사장님/g, ""]];
function cleanForTranslate(t, to){
  let x = String(t || "");
  (to === "ko" ? TR_EN_FIX : TR_KO_FIX).forEach(([re, rep]) => { x = x.replace(re, rep); });
  x = x.replace(/\s+([,.!?…~])/g, "$1").replace(/([,.!?])\1+/g, "$1").replace(/^[\s,.]+|[\s,]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return x === "" ? null : x;
}
/* ---------- 번역된 한국어 → 존댓말 ----------
   번역기가 반말로 내놓아도("고마워", "알았어", "배달해?") 끝을 공손하게 바꿉니다 ("감사합니다", "알겠습니다", "배달해요?") */
const POLITE_WORDS = [
  [/(^|\s)고마워(요)?$/, "$1감사합니다"], [/(^|\s)고맙다$/, "$1감사합니다"], [/(^|\s)감사해$/, "$1감사합니다"],
  [/(^|\s)미안(해|하다)?$/, "$1죄송합니다"], [/(^|\s)죄송해$/, "$1죄송합니다"],
  [/(^|\s)알았어$/, "$1알겠습니다"], [/(^|\s)알겠어$/, "$1알겠습니다"], [/(^|\s)알았다$/, "$1알겠습니다"],
  [/^응$/, "네"], [/^그래$/, "네"], [/^아니$/, "아니요"], [/^좋아$/, "좋아요"], [/^안녕$/, "안녕하세요"], [/^물론$/, "물론이죠"],
  [/(^|\s)부탁해$/, "$1부탁드립니다"], [/(^|\s)부탁한다$/, "$1부탁드립니다"],
];
const POLITE_PRON = [
  // '너'(you)는 손님·가게 어느 쪽 말인지 몰라서 빼고 번역 (한국어는 주어를 생략해도 자연스러움)
  [/(^|\s)(너는|넌|네가|니가|너를|널|너에게|너한테|너의|너도|너)(?=\s|$)/g, "$1"],
  [/(^|\s)(나는|난)(?=\s|$)/g, "$1저는"], [/(^|\s)내가(?=\s|$)/g, "$1제가"], [/(^|\s)(나를|날)(?=\s|$)/g, "$1저를"],
  [/(^|\s)(나에게|나한테)(?=\s|$)/g, "$1저에게"], [/(^|\s)(나의|내)(?=\s)/g, "$1제"], [/(^|\s)우리는(?=\s|$)/g, "$1저희는"], [/(^|\s)우리(?=\s)/g, "$1저희"],
];
const HG = ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? { L: Math.floor(c / 588), V: Math.floor(c % 588 / 28), T: c % 28 } : null; };
const HJ = (L, V, T) => String.fromCharCode(0xAC00 + L * 588 + V * 28 + T);
function politeEnd(s){
  if(!/[가-힣]$/.test(s) || /(요|니다|세요|죠|시오|네|예)$/.test(s) && !/(이)?네$/.test(s.slice(-2)) && /(요|니다|세요|죠|시오)$/.test(s)) return s;
  if(/^(네|예)$/.test(s)) return s;
  for(const [re, rep] of POLITE_WORDS) if(re.test(s)) return s.replace(re, rep);
  if(/줘$/.test(s)) return s.replace(/줘$/, "주세요");
  if(/이다$/.test(s)) return s.replace(/이다$/, "입니다");
  if(/는다$/.test(s)) return s.replace(/는다$/, "습니다");
  if(/다$/.test(s) && s.length >= 2){
    const p = s[s.length - 2], h = HG(p);
    if(h && (h.T === 0 || h.T === 4)) return s.slice(0, -2) + HJ(h.L, h.V, 17) + "니다";   // 한다→합니다, 크다→큽니다
    if(h) return s.slice(0, -1) + "습니다";                                                  // 했다→했습니다, 있다→있습니다
  }
  if(/[니냐]$/.test(s)) return s.slice(0, -1) + "나요";       // 먹니?→먹나요?
  if(/이야$/.test(s)) return s.replace(/이야$/, "이에요");
  if(/야$/.test(s)) return s.replace(/야$/, "예요");
  if(/지$/.test(s)) return s + "요";
  const h = HG(s[s.length - 1]);
  if(/[래게군걸데까네]$/.test(s) || (h && h.T === 0 && [0, 1, 4, 5, 6, 9, 10, 14, 15].includes(h.V))) return s + "요";   // 해→해요, 있어→있어요, 갈게→갈게요
  return s;
}
function politeKo(text){
  if(!text || !/[가-힣]/.test(text)) return text;
  let t = String(text);
  POLITE_PRON.forEach(([re, rep]) => { t = t.replace(re, rep); });
  t = t.replace(/[ \t]{2,}/g, " ").replace(/(^|\n)[ \t]+/g, "$1");
  return t.split("\n").map(line => line.replace(/([^.!?…~,]+)([.!?…~,]*)/g, (m, body, punct) => {
    const lead = body.match(/^\s*/)[0], core = body.trim(); if(!core) return m;
    return lead + politeEnd(core) + punct;
  })).join("\n");
}

/* ---------- Google 번역 (Cloud Translation API, 관리자 화면에서 호출) ----------
   지도와 같은 Google 키를 씁니다. Google Cloud에서 'Cloud Translation API'를 켜고, 키의 API 제한에 추가하세요. */
const gTr = { key: null, off: false };
function setTranslateKey(k){ gTr.key = (k || "").trim() || null; gTr.off = false; }
async function googleTranslate(text, to, key){
  const r = await fetch("https://translation.googleapis.com/language/translate/v2?key=" + encodeURIComponent(key || gTr.key), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: to === "en" ? "ko" : "en", target: to, format: "text" }) });
  const j = await r.json().catch(() => ({}));
  if(!r.ok || !j.data){ const m = (j.error && j.error.message) || ("HTTP " + r.status);
    if(!key && /disabled|not been used|blocked|API key not valid|PERMISSION_DENIED|referer/i.test(m)) gTr.off = true;   // 설정 문제 → 이번 접속 동안 MyMemory 사용
    throw new Error(m); }
  return j.data.translations[0].translatedText;
}
/* '한글 / English' 한 줄짜리 → [한글, English] (뒤쪽에 한글이 없을 때만 나눔) */
function splitKoEn(t){
  const m = /^([\s\S]*[가-힣][\s\S]*) \/ ([^가-힣]*[A-Za-z][^가-힣]*)$/.exec(String(t || ""));
  return m ? [m[1].trim(), m[2].trim()] : [String(t || ""), null];
}
/* 손님 채팅에 보일 글: 병기하지 않음 — EN → 영어, 한 · 한/EN → 한국어
   (자동응답은 한/영 따로 저장, 가게 답장이 '한글 / English' 형식이면 나눠서 보여줌) */
function msgText(m){
  if(m.sender === "cust") return m.body || "";
  const sp = splitKoEn(m.body || "");
  if(sp[1]) return LANG === "en" ? sp[1] : sp[0];                       // '한글 / English' 형식
  if(LANG === "en") return m.body_en || m.body || "";                   // 한국어로 쓴 글 → 영어 번역
  return m.body_ko || m.body || "";                                     // 영어로 쓴 가게 답장 → 한국어 번역
}
/* 예약 시간 표시 (마닐라 시간) — 예: 10/02 19:30 / Oct 2, 7:30 PM */
function schedLabel(d, lang){
  const x = new Date(d), tz = { timeZone:"Asia/Manila" };
  return lang === "en" ? x.toLocaleString("en-US", { ...tz, month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })
    : x.toLocaleString("en-GB", { ...tz, month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).replace(/^(\d+)\/(\d+),?/, "$2/$1");
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const peso = n => "₱" + Number(n||0).toLocaleString("en-PH");
const ls = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
};

/* ---------------- 언어 (한/영 병기 기본) ---------------- */
let LANG = ls.get("paltong_lang", CFG.DEFAULT_LANG || "both");
function setLang(l){ LANG = l; ls.set("paltong_lang", l); }
/* HTML 용: 병기 모드에서는 한글 + 작은 영문 */
function L(ko, en){
  if(!en || ko === en) return esc(ko || en);
  if(LANG === "ko") return esc(ko);
  if(LANG === "en") return esc(en);
  return `${esc(ko)} <span class="en">${esc(en)}</span>`;
}
/* 텍스트 용 (버튼, 토스트, 영수증) */
function T(ko, en){
  if(!en || ko === en) return ko || en;
  if(LANG === "ko") return ko;
  if(LANG === "en") return en;
  return `${ko} / ${en}`;
}

const STATUS = {
  new:               { ko:"주문 확인 중",     en:"Checking order",        color:"#e5a731" },
  accepted:          { ko:"주문 접수",        en:"Order accepted",        color:"#2a9d8f" },
  awaiting_payment:  { ko:"조리 중·입금 대기", en:"Cooking · awaiting payment", color:"#d33d2a" },
  receipt_submitted: { ko:"결제 확인 중",     en:"Verifying payment",     color:"#7a5cd3" },
  confirmed:         { ko:"조리 중",          en:"Preparing",             color:"#2f8f4e" },
  delivering:        { ko:"배달 중",          en:"Out for delivery",      color:"#2a6fd3" },
  done:              { ko:"배달 완료",        en:"Delivered",             color:"#6b6b6b" },
  cancelled:         { ko:"취소됨",           en:"Cancelled",             color:"#9c8a7a" },
};
const payInfo = code => CFG.PAYMENTS[code] || { label: code, labelEn: code };
/* 주문번호 앞 글자 (40단계): W = 웹사이트 · P = 전화·카카오톡·메세지·바이버 · DK = 외부 기타 · T = 다이닝(홀) */
const P_CHANNEL_RE = /(전화|카톡|카카오|메세지|메시지|문자|바이버|페이스북|viber|kakao|phone|call|message|sms|facebook)/i;
const orderPrefix = o => o.order_prefix || (o.source === "dine" ? "T" : o.source === "external" ? (P_CHANNEL_RE.test(o.channel || "") ? "P" : "DK") : "W");
const orderCode = o => `${orderPrefix(o)}-${o.order_no ?? ""}`;
const isDine = o => o && o.source === "dine";
/* 매일 오전 7:50 ~ 8:00 (마닐라) 마감 정산 시간 — 주문 받지 않음 (41단계, 서버에서도 막음) */
const inClosingWindow = (at = Date.now()) => { const m = new Date(at + 8 * 3600e3), t = m.getUTCHours() * 60 + m.getUTCMinutes(); return t >= 470 && t < 480; };
const isOnlinePay = code => code !== "cash";

/* 옵션/항목 표시 */
function lineName(l, mode){
  const it = ITEM_BY_ID[l.id] || {};
  const ko = l.name || it.name, en = l.en || it.en;
  return mode === "html" ? L(ko, en) : T(ko, en);
}
/* 37단계 서비스: svc:true 줄은 ₱0, origUnit = 원래 1개 가격 (영수증에 '서비스 ₱… 상당'으로 표시) */
const isSvc = l => !!(l && l.svc);
const svcValue = o => (o.items || []).filter(isSvc).reduce((s, l) => s + (l.origUnit || 0) * (l.qty || 1), 0);
function lineOpt(l){
  if(!l.opts || !l.opts.length) return "";
  return l.opts.map(o => T(o.ko, o.en)).join(", ");
}

/* ---------------- 이미지 압축 (영수증 사진) ---------------- */
async function compressImage(file, maxSide = 1600, quality = 0.82){
  try{
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", quality));
  }catch(e){ return file; }
}
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

/* ---------------- 회원 · 쿠폰 공통 ---------------- */
/* 휴대폰번호 → 표준형(63XXXXXXXXXX) : 09171234567 / 9171234567 / +63 917 123 4567 모두 같은 번호로 처리 */
function normPhone(v){
  let d = String(v || "").replace(/\D/g, "");
  if(d.length === 11 && d.startsWith("09")) d = "63" + d.slice(1);
  else if(d.length === 10 && d.startsWith("9")) d = "63" + d;
  return d;
}
const phoneEmail = ph => `${normPhone(ph)}@member.paltong.app`;
/* 배달기사 아이디: 휴대폰번호 숫자 11자리 (09로 시작) */
const riderPhone = v => { let d = String(v || "").replace(/\D/g, ""); if(d.startsWith("63") && d.length === 12) d = "0" + d.slice(2); return d; };
const riderEmail = v => `${riderPhone(v)}@rider.paltong.app`;
/* 표시용: 09603249922 형식 (띄어쓰기 없음) */
const prettyPhone = ph => { const d = normPhone(ph); return d.startsWith("63") && d.length === 12 ? "0" + d.slice(2) : ph; };
/* 회원 아이디 형식: 09 로 시작하는 숫자 11자리만 허용 */
const isMemberPhone = v => /^09\d{9}$/.test(String(v || ""));
function couponDiscount(c, subtotal){
  if(!c || c.discount_type === "item") return 0;            // 🎁 메뉴 무료 쿠폰은 할인 대신 ₱0 메뉴 줄 (47단계)
  const raw = c.discount_type === "percent" ? Math.min(c.max_discount ?? Infinity, Math.floor(subtotal * c.amount / 100)) : c.amount;
  return Math.max(0, Math.min(subtotal, raw));
}
function couponValue(c){
  if(c.discount_type === "item") return T(`🎁 ${c.item_name || ""} 무료`, `🎁 Free ${c.item_en || c.item_name || ""}`);
  return c.discount_type === "percent" ? `${c.amount}%` : peso(c.amount);
}
/* 쿠폰 '값' (금액 제한 확인용): 금액 = 금액, % = 계산된 할인, 메뉴 무료 = 그 메뉴 값 */
function couponFace(c, subtotal){
  if(!c) return 0;
  if(c.discount_type === "item") return c.item_price || c.amount || 0;
  if(c.discount_type === "percent") return Math.min(c.max_discount ?? Infinity, Math.floor(subtotal * c.amount / 100));
  return c.amount || 0;
}
const couponsFace = (list, subtotal) => (list || []).reduce((s, c) => s + couponFace(c, subtotal), 0);
function couponCond(c){
  const parts = [];
  if(c.discount_type === "percent" && c.max_discount) parts.push(T(`최대 ${peso(c.max_discount)} 할인`, `max ${peso(c.max_discount)} off`));
  if(c.discount_type === "item") parts.push(T(`${peso(c.item_price || c.amount)} 상당`, `worth ${peso(c.item_price || c.amount)}`));
  if(c.stackable) parts.push(T("다른 쿠폰과 같이 사용 가능", "stackable"));
  parts.push(c.min_order ? T(`${peso(c.min_order)} 이상 주문`, `min. order ${peso(c.min_order)}`) : T("최소금액 없음", "no minimum"));
  if(c.expires_at){ const x = new Date(c.expires_at); parts.push(T(`${x.getMonth()+1}/${x.getDate()}까지`, `until ${x.getMonth()+1}/${x.getDate()}`)); }
  return parts.join(" · ");
}
/* 예전 주문 줄을 현재 메뉴 가격으로 다시 계산 (없는 메뉴면 null) */
function repriceLine(l){
  const it = ITEM_BY_ID[l.id]; if(!it) return null;
  let p = it.price; const groups = it.options || [];
  for(const [i, o] of (l.opts || []).entries()){
    if(o.note) continue;                                   // 관리자 메모 (가격 없음)
    const g = groups[o.g ?? i]; if(!g) return null;
    const c = o.c != null ? g.choices[o.c] : g.choices.find(c => (c.en || c.label) === o.en || c.label === o.ko);
    if(!c) return null;
    p += (c.delta || 0) * (o.n || 1);
  }
  return p;
}
/* 스탬프 보상 안내 문구 (설정값 기준) */
function stampRewards(st){
  st = st || {}; const out = [];
  const val = (type, amt) => type === "percent" ? `${amt}%` : peso(amt);
  if(st.stamp_half_at > 0 && st.stamp_half_at < st.stamp_goal && st.stamp_half_amount > 0) out.push({ at: st.stamp_half_at, v: val(st.stamp_half_type, st.stamp_half_amount) });
  if(st.stamp_amount > 0) out.push({ at: st.stamp_goal || 10, v: val(st.stamp_type || "amount", st.stamp_amount) });
  return out;
}
function stampText(st){
  const r = stampRewards(st);
  return { ko: r.map(x => `${x.at}번째 ${x.v} 쿠폰`).join(" · "), en: r.map(x => `${x.v} coupon at ${x.at}`).join(" · ") };
}
function couponUsable(c, subtotal){
  if(c.used_at) return false;
  if(c.expires_at && new Date(c.expires_at) < new Date()) return false;
  return subtotal >= (c.min_order || 0) && couponFace(c, subtotal) < subtotal;   // 쿠폰 값은 음식값보다 작아야 (47단계)
}
/* ---------- 쿠폰 중복 사용 (sql/30-coupon-stack.sql 과 같은 규칙) ----------
   종류: welcome 가입 · stamp 스탬프 · birthday 생일 · code 코드 · admin 매장선물
   settings.coupon_stack = ["birthday+code", "code+code", ...]  (알파벳 순 짝)
   settings.coupon_stack_max = 한 주문 최대 장수 */
const COUPON_KINDS = [["welcome","가입 축하","Welcome"], ["stamp","스탬프","Stamp"], ["birthday","생일","Birthday"], ["code","쿠폰 코드","Code"], ["admin","매장 선물","Gift"], ["stack","중복 가능","Stackable"]];
const couponKind = c => c && c.stackable ? "stack" : ["welcome","stamp","birthday","code"].includes(c && c.source) ? c.source : "admin";
const stackKey = (a, b) => a < b ? `${a}+${b}` : `${b}+${a}`;
function stackMax(st){ return Math.max(1, Math.round(+((st || {}).coupon_stack_max ?? 1)) || 1); }
/* 이 쿠폰들을 한 주문에 같이 쓸 수 있는지 */
function couponStackOk(list, st, subtotal){
  if(subtotal != null && list.length && couponsFace(list, subtotal) >= subtotal) return false;   // 쿠폰 합계는 음식값보다 작게
  if(list.length <= 1) return true;
  if(list.length > stackMax(st)) return false;
  const allow = new Set((st || {}).coupon_stack || []);
  for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++)
    if(!allow.has(stackKey(couponKind(list[i]), couponKind(list[j])))) return false;
  return true;
}
/* 여러 장 할인 합계: 쿠폰마다 메뉴 합계 기준으로 계산해 더함 (메뉴 합계를 넘지 않음) */
function couponsDiscount(list, subtotal){
  return Math.min(subtotal, (list || []).reduce((s, c) => s + couponDiscount(c, subtotal), 0));
}
/* 혜택이 가장 큰 조합 고르기 (할인 + 무료 메뉴 값, 같으면 장수가 적은 쪽) — 쿠폰 합계는 음식값보다 작게 */
function bestCoupons(coupons, subtotal, st){
  const ok = (coupons || []).filter(c => couponUsable(c, subtotal))
    .sort((x, y) => couponFace(y, subtotal) - couponFace(x, subtotal)).slice(0, 15);
  const max = Math.min(stackMax(st), ok.length);
  let best = [], bestD = 0;
  (function walk(start, pick){
    const d = couponsFace(pick, subtotal);
    if(d > bestD || (d === bestD && pick.length < best.length)){ best = pick; bestD = d; }
    if(pick.length >= max) return;
    for(let i = start; i < ok.length; i++){ const next = pick.concat(ok[i]); if(couponStackOk(next, st, subtotal)) walk(i + 1, next); }
  })(0, []);
  return best;
}
function stackRulesText(st){
  const rules = (st || {}).coupon_stack || [];
  if(!rules.length) return T("쿠폰은 주문 1건에 1장만 쓸 수 있어요", "One coupon per order");
  const nm = k => { const x = COUPON_KINDS.find(y => y[0] === k); return x ? T(x[1], x[2]) : k; };
  return T(`최대 ${stackMax(st)}장까지 함께 사용 가능: `, `Up to ${stackMax(st)} coupons together: `)
    + rules.map(r => { const [a, b] = r.split("+"); return a === b ? T(`${nm(a)} 여러 장`, `multiple ${nm(a)}`) : `${nm(a)} + ${nm(b)}`; }).join(", ");
}
/* 휴대폰 입력칸: 09 고정 · 숫자 11자리까지만 · 0917 123 4567 형식으로 표시 */
function phoneDigits(v){
  let d = String(v || "").replace(/\D/g, "");
  if(d.startsWith("63")) d = d.slice(2);
  if(d.startsWith("09")) d = d.slice(2); else if(d.startsWith("9")) d = d.slice(1); else if(d.startsWith("0")) d = d.slice(1);
  // 09 가 이미 있는데 습관처럼 09… 또는 9… 부터 다시 친 경우: 넘친 앞부분을 버림
  while(d.length > 9 && d.startsWith("09")) d = d.slice(2);
  if(d.length > 9 && d.startsWith("9")) d = d.slice(1);
  return "09" + d.slice(0, 9);
}
const phoneFmt = d => [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(" ");
function phoneMask(el){
  if(!el || el._pm) return; el._pm = true;
  el.setAttribute("inputmode", "numeric"); el.removeAttribute("maxlength"); el.placeholder = "09•• ••• ••••";
  const apply = () => { const d = phoneDigits(el.value); const f = phoneFmt(d); if(el.value !== f) el.value = f; };
  if(el.value) apply();
  el.addEventListener("focus", () => { if(!el.value) el.value = "09"; setTimeout(() => { try{ el.setSelectionRange(el.value.length, el.value.length); }catch(e){} }, 0); });
  el.addEventListener("blur", () => { if(el.value.replace(/\D/g, "") === "09") el.value = ""; });
  el.addEventListener("keydown", e => { if((e.key === "Backspace" || e.key === "Delete") && el.value.replace(/\D/g, "").length <= 2 && el.selectionStart === el.selectionEnd) e.preventDefault(); });
  el.addEventListener("input", apply);
}
const phoneValue = el => { const d = String(el && el.value || "").replace(/\D/g, ""); return d === "09" ? "" : d; };
const phoneOk = v => /^09\d{9}$/.test(String(v || "").replace(/\D/g, ""));

/* 영문만 입력 (이름·주소): 한글 등은 자동으로 지워지고 안내가 뜹니다 */
const EN_NAME = /[^A-Za-z\u00C0-\u024F .,'\-]/g;
const EN_ADDR = /[^A-Za-z0-9\u00C0-\u024F .,'#&()\/\-]/g;
let enWarnAt = 0;
function englishOnly(el, re){
  if(!el || el._en) return; el._en = true;
  el.setAttribute("autocapitalize", "words"); el.setAttribute("lang", "en");
  const clean = () => {
    const v = el.value, c = v.replace(re, "");
    if(c !== v){
      const pos = Math.max(0, (el.selectionStart || c.length) - (v.length - c.length));
      el.value = c; try{ el.setSelectionRange(pos, pos); }catch(e){}
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if(Date.now() - enWarnAt > 2500){ enWarnAt = Date.now(); toast(T("영문으로 입력해주세요","Please type in English"), 2200); }
    }
  };
  el.addEventListener("input", e => { if(!e.isComposing) clean(); });
  el.addEventListener("compositionend", () => setTimeout(clean, 0));
}
const hasHangul = s => /[\u3131-\uD79D]/.test(String(s || ""));

/* 번역 전에 메뉴 이름·옵션을 메뉴판의 영어 이름으로 바꿔둠 (예: 국물닭발 → Dakbal Soup) */
let GLOSS = null;
function glossary(){
  if(GLOSS) return GLOSS;
  const m = new Map();
  const add = (ko, en) => { ko = String(ko || "").trim(); if(ko && en && /[\u3131-\uD79D]/.test(ko) && !m.has(ko)) m.set(ko, en); };
  MENU.forEach(c => {
    add(c.cat.replace(/★/g, "").trim(), c.catEn.replace(/★/g, "").trim());
    c.items.forEach(it => {
      add(it.name, it.en); add(it.name.replace(/\s*\(.*?\)\s*/g, "").trim(), it.en.replace(/\s*\(.*?\)\s*/g, "").trim());
      add(it.name.replace(/\s+/g, ""), it.en);
      add(it.name.replace(/\s*\(.*?\)\s*/g, "").replace(/\s+/g, ""), it.en.replace(/\s*\(.*?\)\s*/g, "").trim());
      // 옵션은 선택지 이름만 (그룹 제목 '추가'·'맵기' 같은 일반 단어, '보통'·'뼈' 는 문장을 망가뜨려 제외)
      (it.options || []).forEach(g => (g.choices || []).forEach(ch => { if(!["보통","뼈"].includes(ch.label)) add(ch.label, ch.en); }));
    });
  });
  GLOSS = [...m.entries()].sort((a, b) => b[0].length - a[0].length);
  return GLOSS;
}
function menuToEnglish(text){
  let t = String(text || "");
  for(const [ko, en] of glossary()) if(t.includes(ko)) t = t.split(ko).join(` ${en} `);
  return t.replace(/ {2,}/g, " ").trim();
}
/* 지역별 배달비 (sql/12 의 match_zone 과 같은 규칙) */
function matchZone(zones, addr){
  const a = " " + String(addr || "").replace(/[ñÑ]/g, "n").toLowerCase().replace(/metro manila/g, " ") + " ";
  return (zones || []).find(z => (z.keywords || []).some(k => k && a.includes(String(k).trim().replace(/[ñÑ]/g, "n").toLowerCase()))) || null;
}
const zoneFee = (z, sub) => !z ? null : (z.free_over != null && z.free_over !== "" && sub >= +z.free_over) ? 0 : +z.fee;

/* 서버 오류 → 손님이 이해할 수 있는 문장 */
function errMsg(e){
  const m = String((e && (e.message || e.error_description)) || e || "");
  const map = [
    [/Invalid login credentials/i, ["휴대폰번호 또는 비밀번호가 맞지 않습니다", "Wrong phone number or password"]],
    [/already registered|already exists|duplicate/i, ["이미 가입된 번호입니다. 로그인해주세요", "This number is already registered. Please log in"]],
    [/invalid_phone_format/, ["휴대폰 번호는 09로 시작하는 11자리 숫자로만 입력해주세요 (예: 09xx xxx xxxx)", "Use an 11-digit number starting with 09 (e.g. 09xx xxx xxxx)"]],
    [/Database error saving new user/i, ["휴대폰 번호는 09로 시작하는 11자리 숫자로만 입력해주세요 (예: 09xx xxx xxxx)", "Use an 11-digit number starting with 09 (e.g. 09xx xxx xxxx)"]],
    [/Password should be|password too short/i, ["비밀번호는 6자 이상이어야 합니다", "Password must be at least 6 characters"]],
    [/Signups not allowed|signup is disabled/i, ["지금은 회원가입을 받을 수 없습니다 (가게에 문의)", "Sign-up is currently disabled"]],
    [/rate limit/i, ["가입 설정 문제입니다. 가게에 문의해주세요 (관리자: Supabase에서 Confirm email 끄기)", "Sign-up setup issue. Please contact the store"]],
    [/Email not confirmed|confirm_required/i, ["가입 설정 문제입니다. 가게에 문의해주세요 (Confirm email 끄기 필요)", "Sign-up setup issue. Please contact the store"]],
    [/coupon_min_order:(\d+)/, m2 => [`최소 주문금액 ${peso(m2[1])} 이상일 때 사용할 수 있습니다`, `Minimum order ${peso(m2[1])}`]],
    [/coupon_expired/, ["기간이 지난 쿠폰입니다", "This coupon has expired"]],
    [/coupon_invalid/, ["이미 사용했거나 사용할 수 없는 쿠폰입니다", "Coupon is not available"]],
    [/coupon_stack_max:(\d+)/, m2 => [`쿠폰은 한 주문에 ${m2[1]}장까지 쓸 수 있습니다`, `Up to ${m2[1]} coupons per order`]],
    [/coupon_stack_not_allowed/, ["함께 쓸 수 없는 쿠폰이 섞여 있습니다", "These coupons can't be used together"]],
    [/coupon_over_total:(\d+)/, m2 => [`쿠폰 금액(무료 메뉴 포함)은 음식값 ${peso(m2[1])}보다 적어야 해요`, `Coupons (incl. free items) must be less than the food total ${peso(m2[1])}`]],
    [/item_required/, ["무료로 줄 메뉴를 골라주세요", "Choose the free menu item"]],
    [/coupon_login_required|login_required/, ["로그인이 필요합니다", "Please log in"]],
    [/code_invalid/, ["없는 쿠폰 코드입니다", "Invalid coupon code"]],
    [/code_expired/, ["등록 기간이 끝난 코드입니다", "This code has expired"]],
    [/code_sold_out/, ["선착순 수량이 모두 소진되었습니다", "This code has run out"]],
    [/code_already_used/, ["이미 등록한 코드입니다", "You already used this code"]],
    [/closing_time/, ["오전 7:50~8:00은 마감 정산 시간이라 주문을 받지 않아요. 8시부터 다시 주문할 수 있어요", "Orders pause 7:50–8:00 AM for daily closing. Please order again from 8:00 AM"]],
    [/store_closed/, ["지금은 영업 종료라 주문을 받을 수 없어요", "We are closed right now — orders are not available"]],
    [/sold_out/, ["품절된 메뉴가 있습니다", "Some items are sold out"]],
    [/review_too_many/, ["확인 대기 중인 리뷰가 3개 있어요. 가게에서 확인한 뒤 다시 올려주세요", "You have 3 reviews waiting. Please wait until the store checks them"]],
    [/review_disabled/, ["지금은 리뷰 인증을 받지 않습니다", "Review rewards are currently off"]],
    [/already_decided/, ["이미 처리된 리뷰입니다", "Already processed"]],
    [/fee_required/, ["배달료를 먼저 정해주세요", "Set the delivery fee first"]],
    [/pin_required/, ["배달 위치를 지도에 찍어주세요 (배달비 자동 계산)", "Please mark your location on the map (for the delivery fee)"]],
    [/service_not_allowed/, ["완료·취소된 주문은 서비스를 바꿀 수 없어요", "Done or cancelled orders can't be changed"]],
    [/Could not find the function public\.admin_set_items|admin_set_items/, ["서비스 기능 SQL(37-order-service.sql)을 먼저 실행해주세요", "Run sql/37-order-service.sql first"]],
    [/add_not_allowed/, ["배달이 출발해서 더 추가할 수 없어요. 채팅으로 문의해주세요", "The rider already left. Please message us"]],
    [/chat_closed/, ["종료된 채팅입니다", "This chat has ended"]],
    [/too_many_chats|too_many_messages/, ["잠시 후 다시 시도해주세요", "Please try again in a moment"]],
    [/birthday_locked/, ["생일은 한 번만 등록할 수 있어요. 바꾸려면 가게에 문의해주세요", "Birthday can only be set once. Please contact us to change it"]],
    [/birthday_invalid/, ["생일 날짜를 확인해주세요", "Please check the date"]],
    [/price_pin_wrong/, ["가격 비밀번호가 틀렸어요", "Wrong price password"]],
    [/price_pin_short/, ["비밀번호는 4자리 이상으로 해주세요", "Use at least 4 characters"]],
    [/admin_save_menu|menu_config/, ["Supabase에서 sql/26-menu-editor.sql 을 먼저 실행하세요", "Run sql/26-menu-editor.sql in Supabase first"]],
    [/admin_set_menu_price/, ["Supabase에서 sql/25-menu-price-pin.sql 을 먼저 실행하세요", "Run sql/25-menu-price-pin.sql in Supabase first"]],
    [/price_pin_required/, ["가격 비밀번호가 필요해요", "Price password required"]],
    [/invalid_menu/, ["메뉴 정보가 올바르지 않아요 (이름·가격 확인)", "Invalid menu (check names and prices)"]],
    [/done_locked/, ["배달 완료된 주문은 취소할 수 없어요", "Delivered orders can't be cancelled"]],
    [/admin_create_external_order/, ["Supabase에서 sql/29-external-orders.sql 을 먼저 실행하세요", "Run sql/29-external-orders.sql in Supabase first"]],
    [/admin_create_dine_order|admin_dine_pay/, ["Supabase에서 sql/40-dining-prefix.sql 을 먼저 실행하세요", "Run sql/40-dining-prefix.sql in Supabase first"]],
    [/errand_title/, ["심부름 내용을 적어주세요", "Write what the errand is"]],
    [/errand_not_found/, ["지워진 심부름이에요", "This errand was deleted"]],
    [/admin_rider_detail|admin_errand|rider_errand/, ["Supabase에서 sql/38-rider-errands.sql 을 먼저 실행하세요", "Run sql/38-rider-errands.sql in Supabase first"]],
    [/not a rider/, ["없는 기사예요 (지워졌거나 주소가 잘못됨)", "Rider not found"]],
    [/admin_riders|admin_assign_rider|admin_add_rider|rider_orders|get_tracking/, ["Supabase에서 sql/28-rider-tracking.sql 을 먼저 실행하세요", "Run sql/28-rider-tracking.sql in Supabase first"]],
    [/not_rider/, ["기사로 등록된 계정이 아니에요 (관리자 화면 🛵 기사에서 등록)", "This account is not registered as a rider"]],
    [/not_ready:(\w+)/, ["아직 출발할 수 없어요 — 매장에서 결제 확인·조리 완료 후 출발해주세요", "Not ready yet — wait until the store confirms payment"]],
    [/not_delivering/, ["먼저 '픽업·출발'을 눌러주세요", "Tap 'Picked up' first"]],
    [/not_your_order/, ["다른 기사에게 배정된 주문이에요", "This order is assigned to another rider"]],
    [/rider_inactive/, ["사용 중지된 기사예요", "This rider is deactivated"]],
    [/order_closed/, ["완료·취소된 주문은 기사를 바꿀 수 없어요", "Closed orders can't be reassigned"]],
    [/pickup_order/, ["픽업 주문에는 기사를 배정하지 않아요", "Pickup orders don't need a rider"]],
    [/rider_account_missing/, ["기사 계정을 만들지 못했어요. 다시 시도해주세요", "Couldn't create the rider account. Please try again"]],
    [/is_admin_account/, ["관리자 계정은 기사로 등록할 수 없어요", "Admin accounts can't be riders"]],
    [/schedule_invalid/, ["예약 시간은 지금부터 15분 뒤 ~ 14일 안으로 골라주세요", "Pick a time between 15 minutes and 14 days from now"]],
  ];
  for(const [re, v] of map){ const mm = m.match(re); if(mm){ const r = typeof v === "function" ? v(mm) : v; return T(r[0], r[1]); } }
  return T("오류가 발생했습니다. 잠시 후 다시 시도해주세요", "Something went wrong. Please try again") + (m ? ` (${m.slice(0, 80)})` : "");
}

/* =====================================================================
   데이터 계층
   ===================================================================== */
const DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

function makeSupabaseApi(){
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storageKey: window.PT_AUTH_KEY || "paltong_admin_auth" }
  });
  const unwrap = ({ data, error }) => { if(error) throw error; return data; };
  return {
    demo: false,
    /* ---- 손님 ---- */
    async placeOrder(p){ return unwrap(await sb.rpc("place_order", { p })); },
    async getOrder(id){ return unwrap(await sb.rpc("get_order", { p_id: id })); },
    async uploadReceipt(id, blob){
      const path = `${id}/${Date.now()}.jpg`;
      unwrap(await sb.storage.from("receipts").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false }));
      unwrap(await sb.rpc("attach_receipt", { p_id: id, p_path: path }));
    },
    async confirmCash(id){ unwrap(await sb.rpc("confirm_cash", { p_id: id })); },
    async uploadExtraReceipt(id, blob){
      const path = `${id}/extra-${Date.now()}.jpg`;
      unwrap(await sb.storage.from("receipts").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false }));
      unwrap(await sb.rpc("attach_extra_receipt", { p_id: id, p_path: path }));
    },
    async quoteDelivery(lat, lng, addr){ return unwrap(await sb.rpc("quote_delivery", { p_lat: lat, p_lng: lng, p_addr: addr || "" })); },
    async addItems(id, items, sub){ return unwrap(await sb.rpc("add_items", { p_id: id, p_items: items, p_sub: sub })); },
    async setItems(id, items){ return unwrap(await sb.rpc("admin_set_items", { p_id: id, p_items: items })); },   // 37단계: 관리자 서비스
    /* ---- 채팅 (손님) ---- */
    async chatOrderThread(orderId){ return unwrap(await sb.rpc("chat_order_thread", { p_order: orderId })); },
    async chatNewInquiry(name, phone){ return unwrap(await sb.rpc("chat_new_inquiry", { p_name: name, p_phone: phone })); },
    async chatFetch(tid, after){ return unwrap(await sb.rpc("chat_fetch", { p_thread: tid, p_after: after || 0 })); },
    async chatSend(tid, body){ unwrap(await sb.rpc("chat_send", { p_thread: tid, p_body: body })); },
    async chatFaq(tid, i, lang){
      const r = await sb.rpc("chat_faq", { p_thread: tid, p_idx: i, p_lang: lang || (LANG === "en" ? "en" : "ko") });
      if(r.error && /p_lang|function .*chat_faq/i.test(r.error.message || "")) return unwrap(await sb.rpc("chat_faq", { p_thread: tid, p_idx: i }));   // 17단계 SQL 실행 전
      unwrap(r); },
    async chatUnread(tid){ return unwrap(await sb.rpc("chat_unread", { p_thread: tid })); },
    async cancelOrder(id){ unwrap(await sb.rpc("cancel_order", { p_id: id })); },
    async getMenuStatus(opts = {}){
      try{ const c = await sb.from("menu_config").select("data").eq("id", 1).maybeSingle(); if(!c.error && c.data && c.data.data) loadMenuData(c.data.data, opts); }catch(e){}
      let r = await sb.from("menu_status").select("item_id,sold_out,sale_price,cat,is_new,is_hot,base_price");
      if(r.error) r = await sb.from("menu_status").select("item_id,sold_out,sale_price,cat,is_new,is_hot");   // 25단계 SQL 실행 전
      if(r.error) r = await sb.from("menu_status").select("item_id,sold_out,sale_price,cat");   // 24단계 SQL 실행 전
      if(r.error) r = await sb.from("menu_status").select("item_id,sold_out");                // 22단계 SQL 실행 전
      const rows = unwrap(r), m = {}, ov = {};
      rows.forEach(x => { if(x.sold_out) m[x.item_id] = true; ov[x.item_id] = { sale_price: x.sale_price, cat: x.cat, is_new: x.is_new, is_hot: x.is_hot, base_price: x.base_price }; });
      applyMenuOverrides(ov); return m;
    },
    /* 관리자: 할인가 (null = 메뉴판 기본, 0 = 할인 없음) · 카테고리 이동 (null = 원래 자리) */
    async setMenuOverride(itemId, patch){
      unwrap(await sb.from("menu_status").upsert({ item_id: itemId, ...patch, updated_at: new Date().toISOString() }));
    },
    /* 가격 바꾸기 — 가격 비밀번호 필요 (25단계 SQL). patch: { base_price: 정가|null, sale_price: 할인가|0 } */
    async setMenuPrice(itemId, patch, pin){ unwrap(await sb.rpc("admin_set_menu_price", { p_item: itemId, p_patch: patch, p_pin: String(pin || "") })); },
    async changePricePin(oldPin, newPin){ unwrap(await sb.rpc("admin_change_price_pin", { p_old: String(oldPin || ""), p_new: String(newPin || "") })); },
    onMenuStatus(cb){
      sb.channel("menu_status").on("postgres_changes", { event:"*", schema:"public", table:"menu_status" }, () => cb())
        .on("postgres_changes", { event:"*", schema:"public", table:"menu_config" }, () => cb()).subscribe();
    },
    /* 관리자: 메뉴판 전체 저장 (가격·옵션 추가금이 바뀌면 가격 비밀번호 필요 — 26단계 SQL) */
    async saveMenu(data, pin){ unwrap(await sb.rpc("admin_save_menu", { p_menu: data, p_pin: pin == null ? null : String(pin) })); },
    async resetMenu(pin){ unwrap(await sb.rpc("admin_reset_menu", { p_pin: String(pin || "") })); },
    /* ---- 관리자 ---- */
    async signIn(email, password){
      unwrap(await sb.auth.signInWithPassword({ email, password }));
      const isAdmin = unwrap(await sb.rpc("is_admin"));
      if(!isAdmin){ await sb.auth.signOut({ scope: "local" }); throw new Error("관리자로 등록되지 않은 계정입니다 (admins 테이블 확인)"); }
    },
    async signOut(){ await sb.auth.signOut({ scope: "local" }); },
    async hasSession(){
      // 열 때 인터넷이 잠깐 불안정해도 로그인 화면으로 튕기지 않게 몇 번 다시 시도
      for(let i = 0; i < 4; i++){
        let sess = null;
        try{ sess = (await sb.auth.getSession()).data.session; }catch(e){}
        if(!sess){
          let saved = null; try{ saved = localStorage.getItem(window.PT_AUTH_KEY || "paltong_admin_auth"); }catch(e){}
          if(!saved) return false;                                   // 저장된 로그인 없음 = 진짜 로그아웃
          await new Promise(r => setTimeout(r, 800 * (i + 1))); continue;   // 저장은 돼 있는데 갱신 실패 → 잠깐 뒤 다시
        }
        try{ return !!unwrap(await sb.rpc("is_admin")); }
        catch(e){ if(/JWT|401|403|not authorized|permission/i.test(String(e.message || e))) return false; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
      }
      return false;
    },
    async listOrders(sinceISO){
      return unwrap(await sb.from("orders").select("*").gte("created_at", sinceISO).order("created_at", { ascending:false }).limit(300));
    },
    /* 하루치 주문 (영업일 기준 오전 8:00 ~ 다음날 7:59 — 주문마다 저장된 영업일 order_date 로 찾음) */
    async listOrdersByDay(day){
      return unwrap(await sb.from("orders").select("*").eq("order_date", day).order("created_at", { ascending:false }).limit(1000));
    },
    async updateOrder(id, patch){
      return unwrap(await sb.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single());
    },
    async receiptUrl(path){
      const d = unwrap(await sb.storage.from("receipts").createSignedUrl(path, 60 * 30));
      return d.signedUrl;
    },
    async setSoldOut(itemId, soldOut){
      unwrap(await sb.from("menu_status").upsert({ item_id: itemId, sold_out: soldOut, updated_at: new Date().toISOString() }));
    },
    onOrdersChange(cb){
      sb.channel("orders_admin").on("postgres_changes", { event:"*", schema:"public", table:"orders" }, p => cb(p)).subscribe();
    },

    /* ---- 회원 ---- */
    async memberSignUp(phone, password, name){
      const d = unwrap(await sb.auth.signUp({ email: phoneEmail(phone), password, options: { data: { phone: normPhone(phone), name } } }));
      if(!d.session){ throw new Error("confirm_required"); }
    },
    async memberSignIn(phone, password){ unwrap(await sb.auth.signInWithPassword({ email: phoneEmail(phone), password })); },
    async memberSignOut(){ await sb.auth.signOut({ scope: "local" }); },
    async myAccount(){
      const { data } = await sb.auth.getSession(); if(!data.session) return null;
      return unwrap(await sb.rpc("my_account"));
    },
    async updateProfile(name, addr){ unwrap(await sb.rpc("update_profile", { p_name: name, p_addr: addr })); },
    async claimCoupon(code){ return unwrap(await sb.rpc("claim_coupon", { p_code: code })); },
    async setBirthday(d){ unwrap(await sb.rpc("set_birthday", { p: d })); },
    async birthdayCheck(){ return unwrap(await sb.rpc("birthday_check")); },
    async forgetAddress(addr){ unwrap(await sb.rpc("forget_address", { p_addr: addr })); },
    async submitReview(blob){
      const { data } = await sb.auth.getSession(); if(!data.session) throw new Error("login_required");
      const path = `${data.session.user.id}/${Date.now()}.jpg`;
      try{ unwrap(await sb.storage.from("reviews").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false })); }
      catch(e){ if(/row-level security|unauthorized|403/i.test(String(e.message || e))) throw new Error("review_too_many"); throw e; }
      return unwrap(await sb.rpc("submit_review", { p_path: path }));
    },
    async myOrders(){
      const { data } = await sb.auth.getSession(); if(!data.session) return [];
      return unwrap(await sb.from("orders").select("id,order_no,created_at,status,subtotal,discount,total,items")
        .eq("user_id", data.session.user.id).order("created_at", { ascending:false }).limit(30));
    },
    /* ---- 관리자: 회원/쿠폰 ---- */
    async getSettings(){ return unwrap(await sb.from("shop_settings").select("*").eq("id", 1).single()); },
    async saveSettings(patch){ unwrap(await sb.from("shop_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1)); },
    /* 영업 중 / 영업 종료 (36단계 SQL) */
    async setStoreOpen(on){ unwrap(await sb.rpc("admin_set_store_open", { p_open: !!on })); },
    onSettings(cb){ sb.channel("shop_settings").on("postgres_changes", { event:"*", schema:"public", table:"shop_settings" }, () => cb()).subscribe(); },
    async listCodes(){ return unwrap(await sb.from("coupon_codes").select("*").order("created_at", { ascending:false })); },
    async saveCode(row){ unwrap(await sb.from("coupon_codes").upsert(row)); },
    async deleteCode(code){ unwrap(await sb.from("coupon_codes").delete().eq("code", code)); },
    async listMembers(q){ return unwrap(await sb.rpc("admin_list_members", { p_q: q || "" })); },
    async memberCoupons(uid){ return unwrap(await sb.from("member_coupons").select("*").eq("user_id", uid).order("created_at", { ascending:false }).limit(50)); },
    async grantCoupon(uid, p){ unwrap(await sb.rpc("admin_grant_coupon", { p_user: uid, p })); },
    async deleteMemberCoupon(id){ unwrap(await sb.from("member_coupons").delete().eq("id", id)); },
    async setStamps(uid, n){ unwrap(await sb.rpc("admin_set_stamps", { p_user: uid, p_stamps: n })); },
    async resetPassword(uid, pw){ unwrap(await sb.rpc("admin_reset_password", { p_user: uid, p_pw: pw })); },
    /* ---- 관리자: 리뷰 인증 ---- */
    async listReviews(status){ return unwrap(await sb.rpc("admin_list_reviews", { p_status: status || "" })); },
    async reviewUrl(path){ const d = unwrap(await sb.storage.from("reviews").createSignedUrl(path, 60 * 30)); return d.signedUrl; },
    async decideReview(id, ok, note){ unwrap(await sb.rpc("admin_decide_review", { p_id: id, p_ok: ok, p_note: note || "" })); },
    onReviewsChange(cb){
      sb.channel("reviews_admin").on("postgres_changes", { event:"*", schema:"public", table:"reviews" }, () => cb()).subscribe();
    },
    /* ---- 관리자: 채팅 · 번역 · 생일 · 라라무브 ---- */
    async listThreads(){ return unwrap(await sb.from("chat_threads").select("*, orders(order_no,status)").order("last_at", { ascending:false }).limit(100)); },
    async threadMessages(tid){ return unwrap(await sb.from("chat_messages").select("*").eq("thread_id", tid).order("id", { ascending:true }).limit(500)); },
    async adminChatSend(tid, body){ unwrap(await sb.rpc("admin_chat_send", { p_thread: tid, p_body: body })); },
    async adminBotPost(orderId, ko, en){ unwrap(await sb.rpc("admin_bot_post", { p_order: orderId, p_ko: ko, p_en: en })); },
    /* 웹 푸시 (21단계 SQL) */
    async pushInfo(){ return unwrap(await sb.rpc("admin_push_info")); },
    async pushSubscribe(endpoint, p256dh, auth, label){ unwrap(await sb.rpc("admin_push_subscribe", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_label: label })); },
    async pushUnsubscribe(endpoint){ unwrap(await sb.rpc("admin_push_unsubscribe", { p_endpoint: endpoint })); },
    async pushTest(){ return unwrap(await sb.rpc("admin_push_test")); },
    async adminChatRead(tid){ unwrap(await sb.rpc("admin_chat_read", { p_thread: tid })); },
    async closeThread(tid){ unwrap(await sb.from("chat_threads").update({ status: "closed" }).eq("id", tid)); },
    onChatChange(cb){
      sb.channel("chat_admin").on("postgres_changes", { event:"*", schema:"public", table:"chat_messages" }, () => cb())
        .on("postgres_changes", { event:"*", schema:"public", table:"chat_threads" }, () => cb()).subscribe();
    },
    async translateMsg(id){ return unwrap(await sb.rpc("admin_translate_msg", { p_id: id })); },
    async translateOrder(id){ return unwrap(await sb.rpc("admin_translate_order", { p_id: id })); },
    /* 번역: Google 번역(키가 있으면) → 실패하면 무료 MyMemory */
    async translateText(t){ return this.translateTo(t, "en"); },
    /* to = "ko" (영어→한국어) | "en" (한국어→영어) */
    async translateTo(t, to){
      if(!t || (to === "en" ? !/[가-힣]/.test(t) : (/[가-힣]/.test(t) || !/[A-Za-z]/.test(t)))) return t;
      const c = cleanForTranslate(t, to); if(c === null || c === "") return to === "ko" ? "고객님" : t;   // 호칭만 있을 때
      t = c;
      const fin = r => to === "ko" ? politeKo(r) : r;   // 한국어 번역은 항상 존댓말로
      if(gTr.key && !gTr.off){ try{ return fin(await googleTranslate(t, to)); }catch(e){ console.warn("Google 번역 실패 → MyMemory", e); } }
      if(to === "en") return unwrap(await sb.rpc("admin_translate_text", { p_text: t }));
      return fin(unwrap(await sb.rpc("admin_translate_to", { p_text: t, p_to: to })));
    },
    async setMsgEn(id, en){ unwrap(await sb.from("chat_messages").update({ body_en: en }).eq("id", id)); },
    async setMsgKo(id, ko){ unwrap(await sb.from("chat_messages").update({ body_ko: ko }).eq("id", id)); },
    async adminChatSend2(tid, body, en, ko){
      const r = await sb.rpc("admin_chat_send2", { p_thread: tid, p_body: body, p_en: en || null, p_ko: ko || null });
      if(r.error && /admin_chat_send2|function/i.test(r.error.message || "")) return this.adminChatSend(tid, body);   // 18단계 SQL 실행 전
      unwrap(r); },
    async lalamoveFee(orderId, url){ return unwrap(await sb.rpc("admin_lalamove_fee", { p_order: orderId, p_url: url || "" })); },
    async applyFee(orderId, fee, url){ return unwrap(await sb.rpc("admin_apply_fee", { p_order: orderId, p_fee: fee, p_url: url || "" })); },
    async adminAccept(id){ unwrap(await sb.rpc("admin_accept", { p_order: id })); },
    async setFeeLink(orderId, fee, url){ return unwrap(await sb.rpc("admin_set_fee", { p_order: orderId, p_fee: fee, p_url: url || "", p_source: "lalamove" })); },
    async startCooking(id){ return unwrap(await sb.rpc("admin_start_cooking", { p_order: id })); },
    async setFee(orderId, fee){ return unwrap(await sb.rpc("admin_set_fee", { p_order: orderId, p_fee: fee, p_url: "", p_source: "manual" })); },
    async linkFee(orderId, url){ return unwrap(await sb.rpc("admin_link_fee", { p_order: orderId, p_url: url || "" })); },
    async setMemberBirthday(uid, d){ unwrap(await sb.rpc("admin_set_birthday", { p_user: uid, p: d || null })); },
    async secretStatus(){ return unwrap(await sb.rpc("admin_secret_status")); },
    async setLalamove(key, secret){ unwrap(await sb.rpc("admin_set_lalamove", { p_key: key, p_secret: secret })); },
    async testLalamove(){ return unwrap(await sb.rpc("admin_test_lalamove")); },

    /* ---- 배달기사 (28단계) ---- */
    async listRiders(){ return unwrap(await sb.rpc("admin_riders")) || []; },
    /* 기사 계정 만들기: 아이디 = 휴대폰번호 → 09xxxxxxxxx@rider.paltong.app
       관리자 로그인이 풀리지 않도록 저장하지 않는 별도 연결로 가입시킨 뒤, 관리자 함수로 기사 등록 + 비밀번호 지정 */
    async addRider(phone, name, password){
      const email = riderEmail(phone);
      const tmp = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:"paltong-rider-signup" } });
      const r = await tmp.auth.signUp({ email, password, options:{ data:{ rider:true, name } } });
      if(r.error && !/already|registered|exists/i.test(r.error.message || "")) throw r.error;
      const uid = unwrap(await sb.rpc("admin_add_rider", { p_email: email, p_name: name, p_phone: riderPhone(phone) }));
      unwrap(await sb.rpc("admin_rider_password", { p_user: uid, p_pw: password }));
      return uid;
    },
    async updateRider(uid, p){ unwrap(await sb.rpc("admin_update_rider", { p_user: uid, p_name: p.name ?? null, p_phone: p.phone ?? null, p_active: p.active ?? null })); },
    async riderPassword(uid, pw){ unwrap(await sb.rpc("admin_rider_password", { p_user: uid, p_pw: pw })); },
    async createExternalOrder(p){ return unwrap(await sb.rpc("admin_create_external_order", { p, p_base: location.origin })); },
    async assignRider(orderId, riderId){ return unwrap(await sb.rpc("admin_assign_rider", { p_order: orderId, p_rider: riderId || null, p_base: location.origin })); },
    async riderTrail(orderId){ return unwrap(await sb.from("rider_track").select("lat,lng").eq("order_id", orderId).order("id", { ascending:false }).limit(300)).reverse(); },
    onRidersChange(cb){
      sb.channel("riders_admin")
        .on("postgres_changes", { event:"*", schema:"public", table:"rider_locations" }, p => cb(p))
        .on("postgres_changes", { event:"*", schema:"public", table:"riders" }, p => cb(p))
        .on("postgres_changes", { event:"*", schema:"public", table:"rider_errands" }, p => cb(p)).subscribe();
    },
    /* ---- 🍽 다이닝 (40단계) ---- */
    async createDineOrder(items, memo){ return unwrap(await sb.rpc("admin_create_dine_order", { p_items: items, p_memo: memo || null })); },
    async deleteExternal(id){ return unwrap(await sb.rpc("admin_delete_external_order", { p_id: id })); },
    /* ---- 👤 주문 받은 직원 (45단계) ---- */
    async staffList(){ return unwrap(await sb.rpc("admin_staff_list")) || []; },
    async staffAdd(name, pin){ return unwrap(await sb.rpc("admin_staff_add", { p_name: name, p_pin: String(pin || "") })); },
    async staffCheck(id, pin){ return unwrap(await sb.rpc("admin_staff_check", { p_staff: id, p_pin: String(pin || "") })); },
    async setOrderStaff(orderId, id, pin){ return unwrap(await sb.rpc("admin_set_order_staff", { p_order: orderId, p_staff: id, p_pin: String(pin || "") })); },
    async staffChangePin(id, oldPin, newPin){ unwrap(await sb.rpc("admin_staff_change_pin", { p_staff: id, p_old: String(oldPin || ""), p_new: String(newPin || "") })); },
    async staffResetPin(id, ownerPin, newPin){ unwrap(await sb.rpc("admin_staff_reset_pin", { p_staff: id, p_owner: String(ownerPin || ""), p_new: String(newPin || "") })); },
    async staffRemove(id, pin){ unwrap(await sb.rpc("admin_staff_remove", { p_staff: id, p_pin: String(pin || "") })); },
    async dinePay(id, payment){ return unwrap(await sb.rpc("admin_dine_pay", { p_id: id, p_payment: payment })); },
    /* 📒 Cash Book(MONEY TRACKER)으로 그날 결제 완료 매출 보내기 (42단계 SQL) */
    async cashbookPush(day){ return unwrap(await sb.rpc("cashbook_push", { p_day: day })); },
    /* ---- 기사 상세 · 심부름 (38단계) ---- */
    async riderDetail(uid, day){ return unwrap(await sb.rpc("admin_rider_detail", { p_rider: uid, p_day: day || null })); },
    async saveErrand(p){ return unwrap(await sb.rpc("admin_errand_save", { p })); },
    async errandStatus(id, status){ unwrap(await sb.rpc("admin_errand_status", { p_id: id, p_status: status })); },
    async deleteErrand(id){ unwrap(await sb.rpc("admin_errand_delete", { p_id: id })); },
    async errandTrail(id){ return unwrap(await sb.rpc("admin_errand_trail", { p_id: id })) || []; },
    onRiderDetailChange(uid, cb){
      sb.channel("rider_detail_" + uid)
        .on("postgres_changes", { event:"*", schema:"public", table:"rider_locations", filter:`user_id=eq.${uid}` }, p => cb(p))
        .on("postgres_changes", { event:"*", schema:"public", table:"rider_errands" }, p => cb(p))
        .on("postgres_changes", { event:"*", schema:"public", table:"orders" }, p => cb(p)).subscribe();
    },
  };
}

/* ----- 데모 모드: 같은 브라우저 안(탭 간)에서만 동작하는 연습용 ----- */
function makeDemoApi(){
  const KEY = "paltong_demo_orders", RKEY = "paltong_demo_receipts", MKEY = "paltong_demo_menu";
  const all = () => ls.get(KEY, []);
  const save = arr => { ls.set(KEY, arr); ping(); };
  let bc = null; try{ bc = new BroadcastChannel("paltong_demo"); }catch(e){}
  const listeners = { orders: [], menu: [], reviews: [], chat: [], settings: [] };
  window.addEventListener("storage", e => { if(e.key === "paltong_demo_settings") listeners.settings.forEach(f => { try{ f({}); }catch(x){} }); });
  function ping(kind = "orders"){ try{ bc && bc.postMessage(kind); }catch(e){} }
  const fire = kind => listeners[kind].forEach(f => { try{ f({}); }catch(e){} });
  if(bc) bc.onmessage = e => fire(e.data);
  window.addEventListener("storage", e => { if(e.key === KEY) fire("orders"); if(e.key === MKEY || e.key === "paltong_demo_menu_ov" || e.key === "paltong_demo_menu_cfg") fire("menu"); if(e.key === "paltong_demo_reviews") fire("reviews"); if(e.key === "paltong_demo_threads" || e.key === "paltong_demo_msgs") fire("chat"); });
  const pub = o => o && ({
    id:o.id, order_no:o.order_no, created_at:o.created_at, status:o.status, items:o.items, subtotal:o.subtotal,
    delivery_fee:o.delivery_fee, total:o.total, cust_name:o.cust_name, cust_phone:o.cust_phone, cust_addr:o.cust_addr,
    memo:o.memo, payment:o.payment, eta_min:o.eta_min, admin_note:o.admin_note, has_receipt:!!o.receipt_path,
    receipt_at:o.receipt_at, confirmed_at:o.confirmed_at, lat:o.lat??null, lng:o.lng??null, discount:o.discount||0, store_discount:o.store_discount||0, store_discount_label:o.store_discount_label||null, coupon_title:o.coupon_title||null, user_id:o.user_id||null,
    memo_en:o.memo_en||null, tracking_url:o.tracking_url||null, paid_total:o.paid_total ?? null, extra_receipt_at:o.extra_receipt_at||null,
    fee_source:o.fee_source||null, distance_km:o.distance_km ?? null, items_added_at:o.items_added_at||null,
    order_type:o.order_type||"delivery", scheduled_at:o.scheduled_at||null, zone_name:o.zone_name||null, zone_fee:o.zone_fee ?? null, zone_free_over:o.zone_free_over ?? null, fee_adjusted_at:o.fee_adjusted_at||null,
    extra_due: o.payment !== "cash" && o.paid_total != null && o.total > o.paid_total ? o.total - o.paid_total : 0,
    chat_unread: ((TH().find(t => t.order_id === o.id) || {}).cust_unread) || 0 });
  /* 데모용 회원 저장소 */
  const U = () => ls.get("paltong_demo_users", {}), setU = v => ls.set("paltong_demo_users", v);
  const MB = () => ls.get("paltong_demo_members", {}), setMB = v => ls.set("paltong_demo_members", v);
  const CP = () => ls.get("paltong_demo_coupons", []), setCP = v => ls.set("paltong_demo_coupons", v);
  const CD = () => ls.get("paltong_demo_codes", []), setCD = v => ls.set("paltong_demo_codes", v);
  const TRACK_MSG = "안녕하세요\n아래 계정으로 로그인 하시면\n배송 위치 확인이 대략적으로 가능하십니다.\n\nID: trackerpaltong@gmail.com\nPw : malate2026@";
  const TRACK_MSG_EN = "Hello!\nLog in with the account below to see the approximate delivery location.\n\nID: trackerpaltong@gmail.com\nPw : malate2026@";
  const ST = () => Object.assign({ welcome_enabled:true, welcome_amount:100, welcome_min_order:500, welcome_days:30,
    stamp_enabled:true, stamp_goal:10, stamp_type:"percent", stamp_amount:15, stamp_max_discount:null,
    stamp_half_at:5, stamp_half_type:"amount", stamp_half_amount:200, stamp_min_order:0, stamp_days:60, review_enabled:true,
    store_lat:(CFG.STORE_LOCATION||{}).lat || 14.5695, store_lng:(CFG.STORE_LOCATION||{}).lng || 120.989, store_addr:"Malate, Manila",
    fee_mode:"auto", fee_base:49, fee_base_km:0, fee_per_km:6, fee_per_km2:5, fee_tier_km:5, fee_round:1, fee_max_km:15, fee_markup:0, default_eta:40,
    lalamove_enabled:false, lalamove_env:"production", lalamove_service:"MOTORCYCLE",
    chat_greeting:"안녕하세요, 빨통입니다! 확인 후 바로 답변드릴게요 😊", chat_greeting_en:"Hi, this is PAL TONG! We'll reply shortly. 😊",
    chat_faq:[{"q": "영업시간이 어떻게 되나요?", "q_en": "Opening hours?", "a": "24시간 영업합니다.", "a_en": "We are open 24 hours."}, {"q": "연락처가 어떻게 되나요?", "q_en": "Contact?", "a": "Call · Viber · WhatsApp: 09951550156\n카카오톡: paltongmalate", "a_en": "Call · Viber · WhatsApp: 09951550156\nKakaoTalk: paltongmalate"}, {"q": "한화(원화)로 결제 가능한가요?", "q_en": "Can I pay in KRW?", "a": "직접적인 계좌이체는 불가능합니다만, Purple GLN 이나 네이버페이 다운로드 후 GLN 접속 후 결제 부탁드립니다.\n환율이 좀 높긴하지만, 현지뱅크 큐알 스캔하시면 한화를 현지은행으로 입금이 가능합니다.\n결제 후 결제한 은행 클릭 후 영수증 올려주시면 됩니다.\n\n[네이버페이 해외결제 이용방법]\n1. 네이버페이 앱 다운로드\n2. 네이버 아이디로 로그인 및 본인인증\n3. 검색창에 GLN 검색\n4. 상단 국기를 필리핀으로 변경\n5. 스캔하기 클릭 후 QR 스캔하여 결제", "a_en": "Direct bank transfer in KRW is not possible, but you can pay with Purple GLN or Naver Pay (GLN).\nThe exchange rate is a little high, but scanning our local bank QR lets you send KRW to our local bank.\nAfter paying, tap the bank you paid to and upload the receipt.\n\n[How to pay with Naver Pay abroad]\n1. Download the Naver Pay app\n2. Log in with your Naver ID and verify yourself\n3. Search \"GLN\"\n4. Change the flag at the top to the Philippines\n5. Tap Scan and scan our QR to pay"}, {"q": "배달비는 얼마인가요?", "q_en": "Delivery fee?", "a": "• 말라테 Malate: 배달비 없음 (무료)\n• 에르미타 Ermita: 배달비 없음 (무료)\n• 파사이 Pasay: ₱1,000 이상 무료 (미만 ₱100)\n• 뉴포트·마카티·파라냐케 탐보: ₱1,500 이상 무료 (미만 ₱150)\n• 만달루용·올티가스·파식·BGC·타기그: 배달비 ₱250\n• 그 외 지역은 따로 안내드립니다 (그랩·라라무브 가능)\n주소를 입력하면 배달비가 자동으로 계산돼요.", "a_en": "• Malate: free delivery\n• Ermita: free delivery\n• Pasay: free over ₱1,000 (otherwise ₱100)\n• Newport · Makati · Parañaque Tambo: free over ₱1,500 (otherwise ₱150)\n• Mandaluyong · Ortigas · Pasig · BGC · Taguig: ₱250\n• Other areas: we will let you know (Grab / Lalamove available)\nThe fee is calculated automatically from your address."}, {"q": "픽업 가능한가요?", "q_en": "Pickup?", "a": "네! 주문할 때 “픽업”을 선택하시면 이름과 연락처만 적으면 됩니다. 준비되면 알려드려요.", "a_en": "Yes! Choose Pickup when ordering — we will tell you when it is ready."}, {"q": "결제 방법은?", "q_en": "Payment methods?", "a": "GCash, Maya, Metrobank 송금 또는 현금결제(배달: 기사님께 / 픽업: 매장에서)가 가능합니다.", "a_en": "GCash, Maya, Metrobank transfer or cash (to the rider for delivery / at the store for pickup)."}],
    chat_quick:["네, 확인했습니다! / Noted, thank you!", "지금 조리 중이에요. 조금만 기다려주세요 🙏 / We are cooking now.", "기사님이 출발했어요! / The rider is on the way!"],
    birthday_enabled:true, birthday_percent:5, birthday_max_discount:null, translate_email:null,
    coupon_stack:[], coupon_stack_max:2,
    msg_delivering:"🛵 배달이 출발했어요! 조금만 기다려주세요.", msg_delivering_en:"🛵 Your order is on the way! It will arrive soon.",
    msg_arrived:"✅ 배달이 도착했습니다. 맛있게 드세요! 빨통을 이용해주셔서 감사합니다 🙏", msg_arrived_en:"✅ Your order has arrived. Enjoy your meal! Thank you for choosing PAL TONG 🙏",
    msg_pickup_ready:"🏃 주문하신 음식이 준비되었습니다! 가게로 와주세요.", msg_pickup_ready_en:"🏃 Your order is ready for pickup! Please come to the store.",
    msg_near:"🛵 곧 도착합니다! 픽업 준비 부탁드립니다.", msg_near_en:"🛵 Your rider is almost there! Please get ready to receive your order.", near_radius_m:500,
    track_keyword:"samsung", track_msg:TRACK_MSG, track_msg_en:TRACK_MSG_EN,
    fee_mode:"zone", zone_other:"auto",
    delivery_zones:[{ name:"말라테 Malate", keywords:["malate"], free_over:0, fee:0 },
      { name:"에르미타 Ermita", keywords:["ermita"], free_over:0, fee:0 },
      { name:"뉴포트 Newport", keywords:["newport","resorts world"], free_over:1500, fee:150 },
      { name:"파사이 Pasay", keywords:["pasay"], free_over:1000, fee:100 },
      { name:"마카티 Makati", keywords:["makati"], free_over:1500, fee:150 },
      { name:"파라냐케 탐보 Tambo", keywords:["tambo"], free_over:1500, fee:150 },
      { name:"만달루용·올티가스·파식·BGC·타기그", keywords:["mandaluyong","ortigas","pasig","bonifacio","bgc","taguig"], free_over:null, fee:250 }] }, ls.get("paltong_demo_settings", {}));
  const TH = () => ls.get("paltong_demo_threads", []), setTH = v => { ls.set("paltong_demo_threads", v); ping("chat"); fire("chat"); };
  const MS = () => ls.get("paltong_demo_msgs", []), setMS = v => { ls.set("paltong_demo_msgs", v); ping("chat"); fire("chat"); };
  const chatOpen = t => t.status === "open" && (!t.order_id || !["done","cancelled"].includes((all().find(o => o.id === t.order_id) || {}).status));
  function chatPost(tid, sender, body, bodyEn){
    const m = MS(); const id = m.reduce((x, y) => Math.max(x, y.id), 0) + 1;
    m.push({ id, thread_id: tid, sender, body, body_en: bodyEn || null, created_at: new Date().toISOString() }); setMS(m);
    const t = TH(); const th = t.find(x => x.id === tid);
    if(th){ th.last_at = new Date().toISOString(); th.last_preview = body.slice(0, 80);
      if(sender === "cust") th.admin_unread = (th.admin_unread || 0) + 1; if(sender === "admin") th.cust_unread = (th.cust_unread || 0) + 1; setTH(t); }
  }
  const roadKm = (lat, lng) => { const st = ST(), R = Math.PI / 180, a2 = Math.sin((lat - st.store_lat) * R / 2) ** 2 + Math.cos(st.store_lat * R) * Math.cos(lat * R) * Math.sin((lng - st.store_lng) * R / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(a2)) * 1.3 * 10) / 10; };
  const distanceFee = km => { const s = ST(), r = Math.max(1, s.fee_round);
    const f = s.fee_base + Math.min(Math.max(0, km - s.fee_base_km), Math.max(0, s.fee_tier_km - s.fee_base_km)) * s.fee_per_km
      + Math.max(0, km - Math.max(s.fee_tier_km, s.fee_base_km)) * s.fee_per_km2 + (s.fee_markup || 0);
    return Math.ceil(f / r) * r; };
  const totalOf = o => o.delivery_fee == null ? null : Math.max(0, o.subtotal - (o.discount || 0) - (o.store_discount || 0)) + o.delivery_fee;
  const demoQuotes = {};
  const RV = () => ls.get("paltong_demo_reviews", []), setRV = v => { ls.set("paltong_demo_reviews", v); ping("reviews"); fire("reviews"); };
  const SESSION_KEY = "paltong_demo_member_" + (window.PT_AUTH_KEY || "admin");
  const me = () => ls.get(SESSION_KEY, null);
  const days = n => n == null || n === "" ? null : new Date(Date.now() + n * 864e5).toISOString();
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  const pushAddr = (list, a) => [a, ...(list || []).filter(x => x.trim().toLowerCase() !== a.trim().toLowerCase())].slice(0, 5);
  function addCoupon(uid, c){ const a = CP(); a.unshift(Object.assign({ id: uuid(), user_id: uid, discount_type:"amount", min_order:0, max_discount:null,
    used_at:null, order_id:null, created_at: new Date().toISOString() }, c)); setCP(a); }
  function statusHook(o, prev){
    if(o.status === prev) return;
    if(o.status === "cancelled"){ setCP(CP().map(c => c.order_id === o.id ? { ...c, used_at:null, order_id:null } : c)); }
    if(o.status === "cancelled" && o.user_id && o.stamp_given){ o.stamp_given = false; removeStamp(o.user_id); }   // 완료 후 취소 → 스탬프 회수
    if(o.status === "done" && o.user_id && !o.stamp_given){
      const st = ST(); if(!st.stamp_enabled || o.subtotal < st.stamp_min_order) return;
      o.stamp_given = true; addStamp(o.user_id);
    }
  }
  /* 스탬프 1개 적립 + 보상 쿠폰 (sql/9-stamp-review.sql 의 add_stamp 와 같은 규칙) */
  function addStamp(uid){
    const st = ST(); if(!st.stamp_enabled || !(st.stamp_goal >= 1)) return;
    const m = MB(); const mem = m[uid]; if(!mem) return;
    const v = (mem.stamps || 0) + 1; mem.stamps = v;
    if(st.stamp_half_at > 0 && st.stamp_half_at < st.stamp_goal && st.stamp_half_amount > 0 && v === st.stamp_half_at)
      addCoupon(uid, { title:`스탬프 ${st.stamp_half_at}개 쿠폰 Stamp reward`, discount_type: st.stamp_half_type, amount: st.stamp_half_amount, source:"stamp", expires_at: days(st.stamp_days) });
    if(v >= st.stamp_goal){
      if(st.stamp_amount > 0) addCoupon(uid, { title:`스탬프 ${st.stamp_goal}개 쿠폰 Stamp reward`, discount_type: st.stamp_type, amount: st.stamp_amount,
        max_discount: st.stamp_type === "percent" ? st.stamp_max_discount : null, source:"stamp", expires_at: days(st.stamp_days) });
      mem.stamps = v - st.stamp_goal;
    }
    setMB(m);
  }
  /* 스탬프 1개 회수 (sql/19-stamp-cancel.sql 의 remove_stamp 와 같은 규칙) */
  function removeStamp(uid){
    const st = ST(), m = MB(), mem = m[uid]; if(!mem) return;
    const v = mem.stamps || 0;
    const dropCoupon = n => { const c = CP().find(x => x.user_id === uid && x.source === "stamp" && !x.used_at && x.title.startsWith(`스탬프 ${n}개`)); if(c) setCP(CP().filter(x => x.id !== c.id)); return !!c; };
    if(v > 0){ if(st.stamp_half_at > 0 && v === st.stamp_half_at && st.stamp_half_amount > 0) dropCoupon(st.stamp_half_at); mem.stamps = v - 1; }
    else if(dropCoupon(st.stamp_goal)) mem.stamps = Math.max(0, st.stamp_goal - 1);
    setMB(m);
  }
  const mut = (id, fn) => { const a = all(); const o = a.find(x => x.id === id); if(!o) throw new Error("not found"); const prev = o.status; fn(o);
    if(prev === "done" && o.status !== "done") throw new Error("done_locked");   // 23단계 SQL 과 같음
    if(o.delivery_fee != null) o.total = totalOf(o);
    statusHook(o, prev);
    if(["done","cancelled"].includes(o.status) && prev !== o.status){ const t = TH(); t.forEach(x => { if(x.order_id === o.id) x.status = "closed"; }); setTH(t); }
    o.updated_at = new Date().toISOString(); save(a); fire("orders"); return o; };
  return {
    demo: true,
    async placeOrder(p){
      if(ST().store_open === false) throw new Error("store_closed");   // 36단계 SQL 과 같음
      const ms = ls.get(MKEY, {});
      const out = p.items.filter(i => ms[i.id]).map(i => i.id);
      if(out.length) throw new Error("sold_out:" + out.join(","));
      const uid = me() && MB()[me()] ? me() : null;
      let disc = 0;
      const ids = [...new Set([p.coupon_id, ...(p.coupon_ids || [])].filter(Boolean))], used = [];
      if(ids.length){
        if(!uid) throw new Error("coupon_login_required");
        const st = ST();
        if(ids.length > 1 && ids.length > stackMax(st)) throw new Error("coupon_stack_max:" + stackMax(st));
        for(const id of ids){
          const c = CP().find(x => x.id === id && x.user_id === uid);
          if(!c || c.used_at) throw new Error("coupon_invalid");
          if(c.expires_at && new Date(c.expires_at) < new Date()) throw new Error("coupon_expired");
          if(p.subtotal < c.min_order) throw new Error("coupon_min_order:" + c.min_order);
          used.push(c);
        }
        if(!couponStackOk(used, st)) throw new Error("coupon_stack_not_allowed");
        disc = couponsDiscount(used, p.subtotal);
      }
      let sched = null;
      if(p.scheduled_at){ const t = new Date(p.scheduled_at); if(isNaN(t) || t < Date.now() + 15*60e3 || t > Date.now() + 14*864e5) throw new Error("schedule_invalid"); sched = t.toISOString(); }
      const a = all();
      const today = bizDay(new Date());
      const o = { id: uuid(), order_no: (a.filter(x => orderDay(x) === today).reduce((m,x)=>Math.max(m,x.order_no),0) + 1), order_date: today,
        created_at: new Date().toISOString(), status:"new", items:p.items, subtotal:p.subtotal, delivery_fee:null, total:null,
        cust_name:p.name, cust_phone:p.phone, cust_addr:p.addr, memo:p.memo||null, payment:p.payment, lang:p.lang,
        user_id: uid, coupon_id: used.length ? used[0].id : null, coupon_ids: used.length ? used.map(c => c.id) : null,
        coupon_title: used.length ? used.map(c => c.title).join(" + ") : null, discount: disc, stamp_given:false,
        lat: p.lat ?? null, lng: p.lng ?? null, scheduled_at: sched };
      const pickup = p.order_type === "pickup"; o.order_type = pickup ? "pickup" : "delivery";
      if(pickup){ o.cust_addr = "매장 픽업 / Store pickup"; o.lat = o.lng = null; }
      const zst = ST(), zz = !pickup && zst.fee_mode === "zone" ? matchZone(zst.delivery_zones, p.addr) : null;
      const q = p.quote_id && demoQuotes[p.quote_id];
      if(pickup){ o.delivery_fee = 0; o.fee_source = "pickup"; o.total = totalOf(o); }
      else if(zz){ o.delivery_fee = zoneFee(zz, o.subtotal); o.fee_source = "zone"; o.zone_name = zz.name; o.zone_fee = +zz.fee;
        o.zone_free_over = zz.free_over == null || zz.free_over === "" ? null : +zz.free_over; o.eta_min = zst.default_eta; o.total = totalOf(o); }
      else if(!pickup && zst.fee_mode !== "manual" && (zst.fee_mode !== "zone" || zst.zone_other === "auto")){
        if(p.lat == null) throw new Error("pin_required");
        const km = roadKm(p.lat, p.lng); o.delivery_fee = distanceFee(km); o.fee_source = "distance"; o.distance_km = km; o.eta_min = zst.default_eta; o.total = totalOf(o); }
      else if(!pickup && q && p.lat != null && Math.abs(q.lat - p.lat) < 0.0005 && Math.abs(q.lng - p.lng) < 0.0005){
        o.status = "awaiting_payment"; o.delivery_fee = q.fee; o.fee_source = q.source; o.distance_km = q.km; o.eta_min = ST().default_eta; o.total = totalOf(o);
      }
      a.push(o); save(a); fire("orders");
      if(used.length) setCP(CP().map(x => ids.includes(x.id) ? { ...x, used_at: new Date().toISOString(), order_id: o.id } : x));
      if(uid && !pickup){ const m = MB(); const x = m[uid]; if(x){ x.name = p.name || x.name; x.addr = p.addr.trim(); x.addresses = pushAddr(x.addresses, p.addr.trim());
        x.addr_pins = x.addr_pins || {}; if(p.lat != null) x.addr_pins[p.addr.trim()] = { lat: p.lat, lng: p.lng }; setMB(m); } }
      return { id:o.id, order_no:o.order_no, discount: disc, status: o.status, total: o.total };
    },
    async getOrder(id){ return pub(all().find(o => o.id === id)) || null; },
    async uploadReceipt(id, blob){
      const url = await blobToDataURL(blob);
      const r = ls.get(RKEY, {}); r[id] = url; ls.set(RKEY, r);
      mut(id, o => { if(o.status !== "awaiting_payment" || o.payment === "cash") throw new Error("not allowed");
        o.receipt_path = id; o.receipt_at = new Date().toISOString(); o.status = "receipt_submitted"; o.paid_total = o.total; });
    },
    async uploadExtraReceipt(id, blob){
      const url = await blobToDataURL(blob); const k = id + "/extra";
      const r = ls.get(RKEY, {}); r[k] = url; ls.set(RKEY, r);
      mut(id, o => { if(!(o.payment !== "cash" && o.paid_total != null && o.total > o.paid_total && ["receipt_submitted","confirmed","delivering"].includes(o.status))) throw new Error("not allowed");
        o.extra_receipt_path = k; o.extra_receipt_at = new Date().toISOString(); });
    },
    async quoteDelivery(lat, lng, addr){
      const st = ST(); if(st.fee_mode === "manual") return { ok:false, reason:"manual" };
      if(st.fee_mode === "zone"){ const z = matchZone(st.delivery_zones, addr);
        if(z) return { ok:true, source:"zone", zone:z.name, fee:+z.fee, free_over: z.free_over == null || z.free_over === "" ? null : +z.free_over, eta: st.default_eta };
        if(st.zone_other !== "auto") return { ok:false, reason:"other_area" }; }
      if(lat == null) return { ok:false, reason:"pin_required" };
      const km = roadKm(lat, lng);
      return { ok:true, fee: distanceFee(km), km, source:"distance", eta: st.default_eta };
    },
    async addItems(id, items, sub){
      const ms = ls.get(MKEY, {}); const out = items.filter(i => ms[i.id]).map(i => i.id); if(out.length) throw new Error("sold_out:" + out.join(","));
      const o = mut(id, o => {
        if(ST().store_open === false) throw new Error("store_closed");
        if(!["new","accepted","awaiting_payment","receipt_submitted","confirmed"].includes(o.status)) throw new Error("add_not_allowed");
        o.items = o.items.concat(items.map(i => ({ ...i, added:true, added_at:new Date().toISOString() }))); o.subtotal += sub;
        const cs = CP().filter(x => x.order_id === o.id); if(cs.length) o.discount = couponsDiscount(cs, o.subtotal);
        const pm = /(\d+)%/.exec(o.store_discount_label || ""); if(pm) o.store_discount = Math.floor(Math.max(0, o.subtotal - (o.discount || 0)) * +pm[1] / 100);
        if(o.fee_source === "zone" && o.zone_fee != null) o.delivery_fee = o.zone_free_over != null && o.subtotal >= o.zone_free_over ? 0 : o.zone_fee;
        o.items_added_at = new Date().toISOString(); });
      return { total:o.total, subtotal:o.subtotal, delivery_fee:o.delivery_fee };
    },
    async setItems(id, items){   // 37단계 SQL admin_set_items 와 같은 계산
      return mut(id, o => {
        if(["done","cancelled"].includes(o.status)) throw new Error("service_not_allowed");
        o.items = JSON.parse(JSON.stringify(items)); o.subtotal = o.items.reduce((s, l) => s + Math.round(l.unitPrice) * Math.round(l.qty), 0);
        const cs = CP().filter(x => x.order_id === o.id); o.discount = cs.length ? couponsDiscount(cs, o.subtotal) : Math.min(o.discount || 0, o.subtotal);
        const pm = /(\d+)%/.exec(o.store_discount_label || "");
        o.store_discount = pm ? Math.floor(Math.max(0, o.subtotal - (o.discount || 0)) * +pm[1] / 100) : Math.min(o.store_discount || 0, Math.max(0, o.subtotal - (o.discount || 0))); });
    },
    async chatOrderThread(orderId){
      const o = all().find(x => x.id === orderId); if(!o) throw new Error("not found");
      const t = TH(); let th = t.find(x => x.order_id === orderId);
      if(!th){ th = { id: uuid(), kind:"order", order_id: orderId, user_id: o.user_id, cust_name: o.cust_name, cust_phone: o.cust_phone, status:"open", admin_unread:0, cust_unread:0, last_at:new Date().toISOString(), last_preview:null, created_at:new Date().toISOString() }; t.push(th); setTH(t); }
      return th.id;
    },
    async chatNewInquiry(name, phone){
      if(!/^09\d{9}$/.test(phone)) throw new Error("invalid_phone_format");
      const uid = me() && MB()[me()] ? me() : null; const t = TH();
      if(uid){ const ex = t.find(x => x.user_id === uid && x.kind === "inquiry" && x.status === "open"); if(ex) return ex.id; }
      const th = { id: uuid(), kind:"inquiry", order_id:null, user_id: uid, cust_name: name, cust_phone: phone, status:"open", admin_unread:0, cust_unread:0, last_at:new Date().toISOString(), last_preview:null, created_at:new Date().toISOString() };
      t.push(th); setTH(t); return th.id;
    },
    async chatFetch(tid, after){
      const t = TH(); const th = t.find(x => x.id === tid); if(!th) throw new Error("not found");
      if(th.cust_unread){ th.cust_unread = 0; ls.set("paltong_demo_threads", t); }
      return { open: chatOpen(th), kind: th.kind, order_id: th.order_id, faq: (ST().chat_faq || []).map(f => f.q), faq_en: (ST().chat_faq || []).map(f => f.q_en || f.q),
        messages: MS().filter(m => m.thread_id === tid && m.id > (after || 0)).map(m => ({ id:m.id, sender:m.sender, body:m.body, body_en: m.sender !== "cust" ? m.body_en || null : null, body_ko: m.sender !== "cust" ? m.body_ko || null : null, created_at:m.created_at })) };
    },
    async chatSend(tid, body){
      body = String(body || "").trim(); if(!body) throw new Error("invalid message");
      const th = TH().find(x => x.id === tid); if(!th) throw new Error("not found"); if(!chatOpen(th)) throw new Error("chat_closed");
      const first = !MS().some(m => m.thread_id === tid && m.sender === "cust");
      chatPost(tid, "cust", body); const st = ST(), g = (st.chat_greeting || "").trim(); if(first && g) chatPost(tid, "bot", g, st.chat_greeting_en);
    },
    async chatFaq(tid, i, lang){ lang = lang || (LANG === "en" ? "en" : "ko"); const f = (ST().chat_faq || [])[i]; const th = TH().find(x => x.id === tid); if(!f || !th) throw new Error("not found"); if(!chatOpen(th)) throw new Error("chat_closed");
      const m = MS(); let id = m.reduce((x, y) => Math.max(x, y.id), 0);
      const qe = f.q_en || f.q, qb = lang === "en" ? qe : f.q;
      m.push({ id: ++id, thread_id: tid, sender:"cust", body:qb, body_en:qe, created_at:new Date().toISOString() }, { id: ++id, thread_id: tid, sender:"bot", body:f.a, body_en:f.a_en || null, created_at:new Date().toISOString() }); setMS(m); },
    async chatUnread(tid){ return ((TH().find(x => x.id === tid) || {}).cust_unread) || 0; },
    async confirmCash(id){ mut(id, o => { if(o.status !== "awaiting_payment" || o.payment !== "cash") throw new Error("not allowed"); o.status = "confirmed"; o.confirmed_at = new Date().toISOString(); }); },
    async cancelOrder(id){ mut(id, o => { if(!["new","accepted"].includes(o.status)) throw new Error("not allowed"); o.status = "cancelled"; }); },
    async getMenuStatus(opts = {}){ const cfg = ls.get("paltong_demo_menu_cfg", null); if(cfg) loadMenuData(cfg, opts); applyMenuOverrides(ls.get("paltong_demo_menu_ov", {})); return ls.get(MKEY, {}); },
    async saveMenu(data, pin){
      const old = ls.get("paltong_demo_menu_cfg", null);
      if(old && JSON.stringify(priceSig(old)) !== JSON.stringify(priceSig(data))){
        if(pin == null) throw new Error("price_pin_required");
        if(String(pin) !== ls.get("paltong_demo_price_pin", "1234")) throw new Error("price_pin_wrong"); }
      ls.set("paltong_demo_menu_cfg", data); ping("menu"); fire("menu"); },
    async resetMenu(pin){ if(String(pin) !== ls.get("paltong_demo_price_pin", "1234")) throw new Error("price_pin_wrong"); ls.del("paltong_demo_menu_cfg"); ls.del("paltong_demo_menu_ov"); ping("menu"); fire("menu"); },
    async setMenuPrice(itemId, patch, pin){ if(String(pin) !== ls.get("paltong_demo_price_pin", "1234")) throw new Error("price_pin_wrong"); return this.setMenuOverride(itemId, patch); },
    async changePricePin(oldPin, newPin){ if(String(oldPin) !== ls.get("paltong_demo_price_pin", "1234")) throw new Error("price_pin_wrong"); if(String(newPin || "").length < 4) throw new Error("price_pin_short"); ls.set("paltong_demo_price_pin", String(newPin)); },
    async setMenuOverride(itemId, patch){ const o = ls.get("paltong_demo_menu_ov", {}); o[itemId] = { ...(o[itemId] || {}), ...patch }; ls.set("paltong_demo_menu_ov", o); ping("menu"); fire("menu"); },
    onMenuStatus(cb){ listeners.menu.push(cb); },
    async signIn(){ ls.set("paltong_demo_admin", true); },
    async signOut(){ ls.del("paltong_demo_admin"); },
    async hasSession(){ return !!ls.get("paltong_demo_admin", false); },
    async listOrders(since){ return all().filter(o => o.created_at >= since).sort((a,b) => b.created_at.localeCompare(a.created_at)); },
    async listOrdersByDay(day){ return all().filter(o => orderDay(o) === day).sort((a,b) => b.created_at.localeCompare(a.created_at)); },
    async updateOrder(id, patch){ const b = all().find(x => x.id === id) || {}, old = b.tracking_url, oldSt = b.status;
      const o = mut(id, o => Object.assign(o, patch)); await this.trackNotify(id, old, o.tracking_url);
      if(o.status !== oldSt){ const st = ST(); let k = null;   // 배달 출발·도착·픽업 준비 자동 안내 (20단계 SQL 과 같음)
        if(o.status === "delivering") k = o.order_type === "pickup" ? "msg_pickup_ready" : "msg_delivering";
        else if(o.status === "done" && o.order_type !== "pickup") k = "msg_arrived";
        if(k && (st[k] || "").trim()){ let ko = st[k], en = st[k + "_en"] || "";
          if(k === "msg_delivering" && o.tracking_url){ ko += "\n📍 주문 화면의 '배달 위치 확인' 버튼으로 위치를 볼 수 있어요."; en += "\n📍 Tap 'Track my rider' on your order page to see where it is."; }
          await this.botPost(id, ko, en); } }
      return o; },
    /* 추적 링크에 'samsung' 등 단어가 새로 들어오면 손님 채팅에 로그인 안내 (16단계 SQL 트리거와 같은 동작) */
    async trackNotify(id, oldUrl, newUrl){
      const st = ST(), k = String(st.track_keyword || "").trim().toLowerCase();
      if(!k || !String(st.track_msg || "").trim() || !newUrl || newUrl === oldUrl) return;
      if(newUrl.toLowerCase().includes(k) && !String(oldUrl || "").toLowerCase().includes(k)) await this.botPost(id, st.track_msg, st.track_msg_en);
    },
    async receiptUrl(path){ return ls.get(RKEY, {})[path] || ""; },
    async setSoldOut(itemId, v){ const m = ls.get(MKEY, {}); if(v) m[itemId] = true; else delete m[itemId]; ls.set(MKEY, m); ping("menu"); fire("menu"); },
    onOrdersChange(cb){ listeners.orders.push(cb); },
    /* ---- 회원 (데모) ---- */
    async memberSignUp(phone, password, name){
      if(!isMemberPhone(phone)) throw new Error("invalid_phone_format");
      const ph = normPhone(phone), u = U();
      if(u[ph]) throw new Error("already registered");
      if(String(password).length < 6) throw new Error("Password should be at least 6 characters");
      const id = uuid(); u[ph] = { id, pw: password }; setU(u);
      const m = MB(); m[id] = { user_id:id, phone:ph, name, addr:null, addresses:[], stamps:0, created_at:new Date().toISOString() }; setMB(m);
      const st = ST(); if(st.welcome_enabled && st.welcome_amount > 0) addCoupon(id, { title:"가입 축하 쿠폰 Welcome", amount:st.welcome_amount, min_order:st.welcome_min_order, source:"welcome", expires_at: days(st.welcome_days) });
      ls.set(SESSION_KEY, id);
    },
    async memberSignIn(phone, password){ const u = U()[normPhone(phone)]; if(!u || u.pw !== password) throw new Error("Invalid login credentials"); ls.set(SESSION_KEY, u.id); },
    async memberSignOut(){ ls.del(SESSION_KEY); },
    async myAccount(){
      const id = me(); const m = id && MB()[id]; if(!m) return null;
      const now = new Date();
      return { member: m, settings: ST(), coupons: CP().filter(c => c.user_id === id && !c.used_at && (!c.expires_at || new Date(c.expires_at) > now)),
        reviews: RV().filter(r => r.user_id === id).slice(0, 5).map(r => ({ id:r.id, status:r.status, admin_note:r.admin_note, created_at:r.created_at })) };
    },
    async updateProfile(name, addr){ const m = MB(); const x = m[me()]; if(!x) throw new Error("login_required"); x.name = name; x.addr = addr; if(addr) x.addresses = pushAddr(x.addresses, addr); setMB(m); },
    async forgetAddress(addr){ const m = MB(); const x = m[me()]; if(!x) return; x.addresses = (x.addresses || []).filter(a => a !== addr); if(x.addr === addr) x.addr = null; setMB(m); },
    async setBirthday(d){ const m = MB(); const x = m[me()]; if(!x) throw new Error("login_required"); if(x.birthday) throw new Error("birthday_locked");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) throw new Error("birthday_invalid"); x.birthday = d; x.birthday_set_at = new Date().toISOString(); setMB(m); },
    async birthdayCheck(){
      const m = MB(); const x = m[me()]; const st = ST(); if(!x || !x.birthday || !st.birthday_enabled) return null;
      const today = new Date(); today.setHours(0,0,0,0); const [, mm, dd] = x.birthday.split("-").map(Number);
      for(const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]){
        const d = new Date(y, mm - 1, dd); const lo = new Date(d - 7 * 864e5), hi = new Date(+d + 7 * 864e5);
        if(today >= lo && today <= hi && (x.birthday_coupon_year || 0) < y && new Date(x.birthday_set_at) <= lo){
          addCoupon(x.user_id, { title:"생일 축하 쿠폰 Happy Birthday", discount_type:"percent", amount: st.birthday_percent, max_discount: st.birthday_max_discount, source:"birthday", expires_at: new Date(+hi + 864e5).toISOString() });
          x.birthday_coupon_year = y; setMB(m); return CP()[0];
        }
      }
      return null;
    },
    async claimCoupon(code){
      const id = me(); if(!id || !MB()[id]) throw new Error("login_required");
      const codes = CD(); const k = codes.find(x => x.code === String(code).trim().toUpperCase());
      if(!k || !k.active) throw new Error("code_invalid");
      if(k.ends_at && new Date(k.ends_at) < new Date()) throw new Error("code_expired");
      if(k.total_limit != null && k.claimed_count >= k.total_limit) throw new Error("code_sold_out");
      const claimed = ls.get("paltong_demo_code_claims", []);   // 한 아이디당 한 번 (쿠폰을 지워도 기록은 남음)
      if(claimed.includes(id + "|" + k.code) || CP().some(c => c.user_id === id && c.code === k.code)) throw new Error("code_already_used");
      ls.set("paltong_demo_code_claims", claimed.concat(id + "|" + k.code));
      addCoupon(id, { title:k.title, discount_type:k.discount_type, amount:k.amount, max_discount:k.max_discount, min_order:k.min_order, source:"code", code:k.code,
        expires_at: k.valid_days ? days(k.valid_days) : (k.ends_at || null) });
      k.claimed_count = (k.claimed_count || 0) + 1; setCD(codes);
      return CP()[0];
    },
    async submitReview(blob){
      const id = me(); if(!id || !MB()[id]) throw new Error("login_required");
      if(!ST().review_enabled) throw new Error("review_disabled");
      if(RV().filter(r => r.user_id === id && r.status === "pending").length >= 3) throw new Error("review_too_many");
      const r = { id: uuid(), user_id: id, image_path: await blobToDataURL(blob), status:"pending", admin_note:null, created_at: new Date().toISOString(), decided_at:null };
      setRV([r, ...RV()]); return r;
    },
    async myOrders(){ const id = me(); return id ? all().filter(o => o.user_id === id).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 30) : []; },
    /* ---- 관리자: 회원/쿠폰 (데모) ---- */
    async getSettings(){ return ST(); },
    async saveSettings(patch){ ls.set("paltong_demo_settings", Object.assign(ST(), patch)); fire("settings"); ping("settings"); },
    async setStoreOpen(on){ ls.set("paltong_demo_settings", Object.assign(ST(), { store_open: !!on, store_status_at: new Date().toISOString() })); fire("settings"); ping("settings"); },
    onSettings(cb){ listeners.settings.push(cb); },
    async listCodes(){ return CD(); },
    async saveCode(row){ const a = CD(); const i = a.findIndex(x => x.code === row.code); if(i >= 0) a[i] = { ...a[i], ...row }; else a.unshift({ claimed_count:0, created_at:new Date().toISOString(), ...row }); setCD(a); },
    async deleteCode(code){ setCD(CD().filter(x => x.code !== code)); },
    async listMembers(q){
      const now = new Date(), o = all();
      return Object.values(MB()).filter(m => !q || (m.phone||"").includes(q) || (m.name||"").toLowerCase().includes(String(q).toLowerCase()))
        .map(m => ({ ...m, done_orders: o.filter(x => x.user_id === m.user_id && x.status === "done").length,
          coupons: CP().filter(c => c.user_id === m.user_id && !c.used_at && (!c.expires_at || new Date(c.expires_at) > now)).length }))
        .sort((a,b) => b.created_at.localeCompare(a.created_at));
    },
    async memberCoupons(uid){ return CP().filter(c => c.user_id === uid); },
    async grantCoupon(uid, p){ addCoupon(uid, { title: p.title || "매장 선물 쿠폰 Gift", discount_type: p.discount_type || "amount", amount: +p.amount,
      max_discount: p.max_discount ? +p.max_discount : null, min_order: +(p.min_order || 0), source:"admin", expires_at: days(p.days ? +p.days : null) }); },
    async deleteMemberCoupon(id){ setCP(CP().filter(c => c.id !== id)); },
    async setStamps(uid, n){ const m = MB(); if(m[uid]){ m[uid].stamps = Math.max(0, n); setMB(m); } },
    async resetPassword(uid, pw){ if(String(pw).length < 6) throw new Error("password too short"); const u = U(); for(const k in u) if(u[k].id === uid) u[k].pw = pw; setU(u); },
    async listReviews(status){ const m = MB(); return RV().filter(r => !status || r.status === status).map(r => ({ ...r, name:(m[r.user_id]||{}).name, phone:(m[r.user_id]||{}).phone, stamps:(m[r.user_id]||{}).stamps })); },
    async reviewUrl(path){ return path; },
    async decideReview(id, ok, note){
      const a = RV(); const r = a.find(x => x.id === id); if(!r) throw new Error("not found"); if(r.status !== "pending") throw new Error("already_decided");
      r.status = ok ? "approved" : "rejected"; r.admin_note = (note || "").trim() || null; r.decided_at = new Date().toISOString(); setRV(a);
      if(ok) addStamp(r.user_id);
    },
    onReviewsChange(cb){ listeners.reviews.push(cb); },
    async listThreads(){ const o = all(); return TH().map(t => ({ ...t, orders: t.order_id ? (({ order_no, status }) => ({ order_no, status }))(o.find(x => x.id === t.order_id) || {}) : null })).sort((a,b) => b.last_at.localeCompare(a.last_at)); },
    async threadMessages(tid){ return MS().filter(m => m.thread_id === tid); },
    async adminChatSend(tid, body){ chatPost(tid, "admin", body); const t = TH(); const th = t.find(x => x.id === tid); if(th){ th.admin_unread = 0; setTH(t); } },
    async adminChatRead(tid){ const t = TH(); const th = t.find(x => x.id === tid); if(th && th.admin_unread){ th.admin_unread = 0; setTH(t); } },
    async closeThread(tid){ const t = TH(); const th = t.find(x => x.id === tid); if(th){ th.status = "closed"; setTH(t); } },
    onChatChange(cb){ listeners.chat.push(cb); },
    async translateMsg(id){ const m = MS(); const x = m.find(y => y.id === id); if(!x) return null; x.body_en = "[EN] " + x.body; setMS(m); return x.body_en; },
    async translateOrder(id){ const o = mut(id, o => { o.memo_en = o.memo ? "[EN] " + o.memo : null; }); return o.memo_en; },
    async translateText(t){ return /[\u3131-\uD79D]/.test(t) ? "[EN] " + t : t; },
    async translateTo(t, to){ if(to === "en") return this.translateText(t); if(/[\u3131-\uD79D]/.test(t) || !/[A-Za-z]/.test(t)) return t;
      const c = cleanForTranslate(t, "ko"); return c ? "[KO] " + c : "고객님"; },
    async setMsgEn(id, en){ const m = MS(); const x = m.find(y => y.id === id); if(x){ x.body_en = en; setMS(m); } },
    async setMsgKo(id, ko){ const m = MS(); const x = m.find(y => y.id === id); if(x){ x.body_ko = ko; setMS(m); } },
    async adminChatSend2(tid, body, en, ko){ await this.adminChatSend(tid, body); const m = MS(); const x = m[m.length - 1]; x.body_en = en || null; x.body_ko = ko || null; setMS(m); },
    async lalamoveFee(orderId, url){ const o = all().find(x => x.id === orderId); return o && (o.lat != null || /\d{10,}/.test(url || "")) ? { fee: 180, raw: 172, source: /\d{10,}/.test(url || "") ? "order" : "quote" } : { error: "데모 모드: 라라무브에 연결하지 않습니다" }; },
    async setFee(orderId, fee, url, source){
      const before = all().find(x => x.id === orderId); if(!before) throw new Error("not found");
      const old = before.delivery_fee, oldUrl = before.tracking_url;
      const o = mut(orderId, o => { o.delivery_fee = fee; o.fee_source = source || "manual"; if(old !== fee) o.fee_adjusted_at = new Date().toISOString(); if(url) o.tracking_url = url; });
      await this.trackNotify(orderId, oldUrl, o.tracking_url);
      if(old === fee) return { total:o.total, changed:false, fee };
      let ko = `🛵 배달료가 ₱${fee}(으)로 수정되었습니다. 최종 금액 ₱${o.total}`, en = `🛵 Delivery fee updated to ₱${fee}. New total ₱${o.total}.`;
      if(o.payment !== "cash" && o.paid_total != null){ const d = o.total - o.paid_total;
        if(d > 0){ ko += `\n추가로 ₱${d}를 보내주세요 (주문 화면에서 영수증 첨부)`; en += `\nPlease send ₱${d} more and upload the receipt on your order page.`; }
        else if(d < 0){ ko += `\n₱${-d}는 돌려드릴게요`; en += `\nWe will refund ₱${-d}.`; } }
      else if(o.payment === "cash"){ ko += `\n현금 ₱${o.total}을 준비해주세요`; en += `\nPlease prepare ₱${o.total} in cash.`; }
      await this.botPost(orderId, ko, en);
      return { total:o.total, changed:true, fee, old_fee:old };
    },
    async applyFee(orderId, fee, url){ return this.setFee(orderId, fee, url, "manual"); },
    async setFeeLink(orderId, fee, url){ return this.setFee(orderId, fee, url, "lalamove"); },
    async botPost(orderId, ko, en){ const tid = await this.chatOrderThread(orderId); chatPost(tid, "admin", ko, en); const m = MS(); m[m.length - 1].sender = "bot"; setMS(m); },
    async adminBotPost(orderId, ko, en){ return this.botPost(orderId, ko, en); },
    async pushInfo(){ return { public_key: "BG0LRAmDY96tS__f-jaCzabokdyLULcquSg9xWLcuUN1tcd3ccFoB_c5iiulhD6P2Ntnranzty1Kd2C58YNRi3o", devices: ls.get("paltong_demo_push", []).length, demo: true }; },
    async pushSubscribe(endpoint){ const a = ls.get("paltong_demo_push", []).filter(x => x !== endpoint); a.push(endpoint); ls.set("paltong_demo_push", a); },
    async pushUnsubscribe(endpoint){ ls.set("paltong_demo_push", ls.get("paltong_demo_push", []).filter(x => x !== endpoint)); },
    async pushTest(){ return { demo: true, results: ls.get("paltong_demo_push", []).map(e => ({ endpoint: e, status: 201 })) }; },
    async adminAccept(id){
      const o = mut(id, o => { if(o.status !== "new") throw new Error("not allowed"); o.status = "accepted"; });
      const cash = o.payment === "cash";
      await this.botPost(id,
        (cash ? "✅ 주문이 접수되었습니다! 수정되는 부분이 있으면 다시 안내드리겠습니다. 조리가 시작되면 다시 알려드릴게요." : "✅ 주문이 접수되었습니다! 수정되는 부분이 있으면 다시 안내드리겠습니다. 조리가 시작되면 입금 부탁드립니다.")
          + (o.scheduled_at ? "\n⏰ 예약 시간 " + schedLabel(o.scheduled_at, "ko") : ""),
        (cash ? "✅ Your order is accepted! We will let you know if anything changes, and when cooking starts." : "✅ Your order is accepted! We will let you know if anything changes. Please pay once cooking starts.")
          + (o.scheduled_at ? "\n⏰ Scheduled for " + schedLabel(o.scheduled_at, "en") : ""));
    },
    async startCooking(id){
      const o = mut(id, o => { if(!["new","accepted"].includes(o.status)) throw new Error("not allowed"); if(o.delivery_fee == null) throw new Error("fee_required");
        if(o.payment === "cash"){ o.status = "confirmed"; o.confirmed_at = new Date().toISOString(); } else o.status = "awaiting_payment"; });
      const pk = o.order_type === "pickup";
      if(o.payment === "cash") await this.botPost(id, `👩‍🍳 조리를 시작했습니다! 최종 금액 ₱${o.total} — ${pk ? "찾으러 오실 때 현금으로 결제해주세요." : "현금으로 준비해주세요."}`,
        `👩‍🍳 We started cooking! Total ₱${o.total} — ${pk ? "please pay in cash when you pick up." : "please prepare cash."}`);
      else await this.botPost(id, `👩‍🍳 조리를 시작했습니다! 최종 금액 ₱${o.total}을 입금 부탁드립니다. 주문 화면에서 계좌를 확인하고 영수증을 올려주세요.`,
        `👩‍🍳 We started cooking! Please send ₱${o.total} and upload the receipt on your order page.`);
      return { status:o.status, total:o.total };
    },
    async linkFee(orderId, url){
      const o = all().find(x => x.id === orderId); if(!o) throw new Error("not found");
      mut(orderId, x => { if(url) x.tracking_url = url; }); await this.trackNotify(orderId, o.tracking_url, url || o.tracking_url);
      if(o.order_type === "pickup" || ["zone","pickup"].includes(o.fee_source)) return { changed:false, fee:o.delivery_fee, reason:"fixed" };
      if(o.lat == null) return { changed:false, fee:o.delivery_fee, reason:"no_pin" };
      return this.setFee(orderId, distanceFee(roadKm(o.lat, o.lng)), url, "lalamove");
    },
    async setMemberBirthday(uid, d){ const m = MB(); if(m[uid]){ m[uid].birthday = d || null; m[uid].birthday_set_at = d ? "2000-01-01T00:00:00Z" : null; setMB(m); } },
    async secretStatus(){ const k = ls.get("paltong_demo_secret", {}); return { has_key: !!k.key, has_secret: !!k.secret, key_hint: k.key ? k.key.slice(0, 8) + "…" : null }; },
    async setLalamove(key, secret){ ls.set("paltong_demo_secret", { key, secret }); },
    async testLalamove(){ return { error: "데모 모드에서는 라라무브에 연결하지 않습니다" }; },
  };
}

const api = DEMO ? makeDemoApi() : makeSupabaseApi();
if(DEMO){   // 데모 모드에서는 기사 기능 없음 (실제 Supabase 연결 필요)
  const no = async () => { throw new Error(T("데모 모드에서는 기사 기능을 쓸 수 없어요 (Supabase 연결 필요)", "Riders need a real Supabase connection")); };
  Object.assign(api, { listRiders: async () => [], createExternalOrder: no, addRider: no, updateRider: no, riderPassword: no, assignRider: no, riderTrail: async () => [], onRidersChange(){},
    createDineOrder: no, dinePay: no, cashbookPush: no, deleteExternal: no,
    riderDetail: no, saveErrand: no, errandStatus: no, deleteErrand: no, errandTrail: async () => [], onRiderDetailChange(){} });
}

/* =====================================================================
   영수증 (58mm / 80mm 감열 프린터용)
   ===================================================================== */
/* 🖨 인쇄할 장 (관리자 '프린터' 설정, 기기마다 저장) — 기본: 주방용 + 손님용 2장 자동
   kc = 주방+손님 · kcr = 주방+손님+배달기사(배달 주문만) · c = 손님용만 · k = 주방용만 */
const PRINT_SETS = { kc: "주방용 + 손님용 (2장)", kcr: "주방용 + 손님용 + 배달기사용 (배달은 3장)", c: "손님용만 (1장)", k: "주방용만 (1장)" };
function printKinds(o){
  const set = ls.get("paltong_print_set", "kc");
  const k = set === "c" ? ["customer"] : set === "k" ? ["kitchen"] : ["kitchen", "customer"];
  if(set === "kcr" && !isDine(o) && o.order_type !== "pickup") k.push("rider");
  return k;
}
/* 주방용: 주문번호 · 메뉴 · 수량 · 옵션 · 요청사항 (가격 없음, 큰 글씨) */
const nameEnOf = l => { const it = ITEM_BY_ID[l.id] || {}; return l.en || it.en || l.name || it.name; };
const discEnOf = lb => String(lb || "Discount").replace("다이닝 할인", "Dine-in discount").replace("매장 할인", "Store discount").replace("가격 조정", "Price adjustment");
/* 주방용 (영어만): 주문번호 · 메뉴 · 수량 · 옵션 · 요청사항 (가격 없음, 큰 글씨) */
function kitchenHTML(o){
  const fmt = d => { try{ return new Date(d).toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", hour12:false }); }catch(e){ return ""; } };
  const kind = isDine(o) ? "DINE IN" : o.order_type === "pickup" ? "PICKUP" : "DELIVERY";
  return `<div class="rc">
    <div class="c b">[KITCHEN]</div>
    <div class="c b xxl">${esc(orderCode(o))}</div>
    <div class="c b xl" style="border:2px solid #000;margin:1mm 0">${kind}</div>
    ${o.scheduled_at ? `<div class="c b lg" style="border:2px dashed #000;margin:1mm 0">⏰ SCHEDULED ${esc(schedLabel(o.scheduled_at, "en"))}</div>` : ""}
    <div class="c">${esc(fmt(o.created_at))}</div>
    <div class="hr"></div>
    ${(o.items || []).map(l => `<div class="row xl b"><span>${isSvc(l) ? "[FREE] " : l.added ? "[ADD] " : ""}${esc(nameEnOf(l))}</span><span>×${l.qty}</span></div>
      ${l.opts && l.opts.length ? `<div class="lg" style="margin:0 0 1.2mm 2mm">- ${esc(l.opts.map(x => x.en || x.ko).join(", "))}</div>` : ""}`).join("")}
    <div class="hr"></div>
    ${o.memo ? `<div class="memo lg"><span class="b">Note:</span> ${esc(o.memo_en || o.memo)}</div>` : ""}
    <div class="feed"></div></div>`;
}
/* 홀(다이닝)용 (영어만): 주문번호 · 메뉴 · 가격 · 합계 · 결제 · 요청사항 */
function hallHTML(o, copyLabel, p){
  const fmt = d => { try{ return new Date(d).toLocaleString("en-PH", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false }); }catch(e){ return d; } };
  return `<div class="rc">
    <div class="c b xl">${esc(CFG.STORE_NAME_EN)}</div>
    <div class="c">Dine-in</div>
    ${copyLabel ? `<div class="c">[${esc(copyLabel)}]</div>` : ""}
    <div class="hr"></div>
    <div class="c b xxl">${esc(orderCode(o))}</div>
    <div class="c">${esc(fmt(o.created_at))}</div>
    <div class="hr"></div>
    ${(o.items || []).map(l => `<div class="row"><span class="b">${isSvc(l) ? "[FREE] " : l.added ? "[ADD] " : ""}${esc(nameEnOf(l))} x${l.qty}</span><span${isSvc(l) ? ' class="b"' : ""}>${isSvc(l) ? "FREE" : peso(l.unitPrice * l.qty)}</span></div>
      ${l.opts && l.opts.length ? `<div class="sub">${esc(l.opts.map(x => x.en || x.ko).join(", "))}</div>` : ""}`).join("")}
    <div class="hr"></div>
    ${svcValue(o) ? `<div class="row b"><span>Service</span><span>${peso(svcValue(o))} FREE</span></div>` : ""}
    <div class="row"><span>Subtotal</span><span>${peso(o.subtotal)}</span></div>
    ${o.discount ? `<div class="row"><span>Coupon</span><span>-${peso(o.discount)}</span></div>` : ""}
    ${o.store_discount ? `<div class="row"><span>${esc(discEnOf(o.store_discount_label))}</span><span>-${peso(o.store_discount)}</span></div>` : ""}
    <div class="row b lg"><span>TOTAL</span><span>${peso(o.total)}</span></div>
    <div class="hr"></div>
    <div class="row"><span>Payment</span><span class="b">${o.payment === "cash" ? "Cash" : esc(p.labelEn)}</span></div>
    ${o._cashGot != null ? `<div class="row"><span>Cash</span><span>${peso(o._cashGot)}</span></div><div class="row b"><span>Change</span><span>${peso(o._cashGot - o.total)}</span></div>` : ""}
    <div class="c b">${o.status === "done" ? "PAID " : "UNPAID "}${peso(o.total)}</div>
    ${o.memo ? `<div class="hr"></div><div class="memo"><span class="b">Note:</span> ${esc(o.memo_en || o.memo)}</div>` : ""}
    <div class="hr"></div>
    <div class="c">Thank you!</div>
    ${CFG.STORE_PHONE ? `<div class="c">${esc(CFG.STORE_PHONE)}</div>` : ""}
    <div class="feed"></div></div>`;
}
function receiptDoc(orders, copies = "auto"){
  const W = CFG.RECEIPT_WIDTH_MM || 58;
  const inner = W <= 58 ? 48 : 72;     // 실제 인쇄 가능 폭
  const fs = W <= 58 ? 11 : 13;
  const fmt = d => { try{ return new Date(d).toLocaleString("en-PH", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false }); }catch(e){ return d; } };
  const one = (o, copyLabel) => {
    const p = payInfo(o.payment);
    if(isDine(o)) return hallHTML(o, copyLabel, p);
    return `
    <div class="rc">
      <div class="c b xl">${esc(CFG.STORE_NAME_KO)} ${esc(CFG.STORE_NAME_EN)}</div>
      <div class="c">${isDine(o) ? "매장 주문서 / Dine-in" : o.order_type === "pickup" ? "픽업 주문서 / Pickup Order" : "배달 주문서 / Delivery Order"}</div>
      ${copyLabel ? `<div class="c">[${esc(copyLabel)}]</div>` : ""}
      <div class="hr"></div>
      <div class="c b xxl">${esc(orderCode(o))}</div>
      ${isDine(o) ? `<div class="c b xl" style="border:2px solid #000;margin:1mm 0">다이닝 DINE IN</div>` : o.order_type === "pickup" ? `<div class="c b xl" style="border:2px solid #000;margin:1mm 0">픽업 PICKUP</div>` : ""}
      ${o.scheduled_at ? `<div class="c b lg" style="border:2px dashed #000;margin:1mm 0">⏰ 예약 ${esc(schedLabel(o.scheduled_at, "ko"))}<br>SCHEDULED ${esc(schedLabel(o.scheduled_at, "en"))}</div>` : ""}
      <div class="c">${esc(fmt(o.created_at))}</div>
      <div class="hr"></div>
      ${(o.items||[]).map(l => {
        const it = ITEM_BY_ID[l.id] || {};
        return `<div class="row"><span class="b">${isSvc(l) ? "[서비스 SERVICE] " : l.added ? "[추가 ADD] " : ""}${esc(l.name || it.name)} x${l.qty}</span><span${isSvc(l) ? ' class="b"' : ""}>${isSvc(l) ? "FREE" : peso(l.unitPrice * l.qty)}</span></div>
        <div class="sub">${esc(l.en || it.en || "")}${l.opts && l.opts.length ? " · " + esc(l.opts.map(x => x.ko === x.en ? x.ko : x.ko + "/" + x.en).join(", ")) : ""}${isSvc(l) && l.origUnit ? ` · (${peso(l.origUnit * l.qty)})` : ""}</div>`;
      }).join("")}
      <div class="hr"></div>
      ${svcValue(o) ? `<div class="row b"><span>서비스 Service</span><span>${peso(svcValue(o))} FREE</span></div>` : (o.items || []).some(isSvc) ? `<div class="row b"><span>서비스 Service</span><span>FREE</span></div>` : ""}
      <div class="row"><span>소계 Subtotal</span><span>${peso(o.subtotal)}</span></div>
      ${o.order_type === "pickup" ? "" : `<div class="row"><span>배달비 Delivery</span><span>${peso(o.delivery_fee)}</span></div>`}
      ${o.discount ? `<div class="row"><span>쿠폰할인 Coupon</span><span>-${peso(o.discount)}</span></div>` : ""}
      ${o.store_discount ? `<div class="row"><span>${esc(o.store_discount_label || "매장 할인")} Discount</span><span>-${peso(o.store_discount)}</span></div>` : ""}
      <div class="row b lg"><span>합계 TOTAL</span><span>${peso(o.total)}</span></div>
      <div class="hr"></div>
      <div class="row"><span>결제 Payment</span><span class="b">${esc(p.labelEn)}</span></div>
      ${o._cashGot != null ? `<div class="row"><span>받은 돈 Cash</span><span>${peso(o._cashGot)}</span></div><div class="row b"><span>거스름돈 Change</span><span>${peso(o._cashGot - o.total)}</span></div>` : ""}
      <div class="c b">${isDine(o) ? (o.status === "done" ? "결제완료 PAID " + peso(o.total) : "미결제 UNPAID " + peso(o.total)) : isOnlinePay(o.payment) ? (o.status === "receipt_submitted" ? "영수증 확인중 VERIFYING" : "결제완료 PAID") : (o.order_type === "pickup" ? "매장 현금 CASH AT STORE " : "현금 수령 COLLECT CASH ") + peso(o.total)}</div>
      <div class="hr"></div>
      ${isDine(o) ? "" : `<div><span class="b">받는분 Name:</span> ${esc(o.cust_name)}</div>
      <div><span class="b">연락처 Tel:</span> ${esc(o.cust_phone)}</div>
      <div><span class="b">주소 Addr:</span> ${esc(o.cust_addr)}</div>`}
      ${o.memo ? `<div class="memo"><span class="b">요청 Note:</span> ${esc(o.memo)}${o.memo_en && o.memo_en !== o.memo ? `<br>(${esc(o.memo_en)})` : ""}</div>` : ""}
      <div class="hr"></div>
      <div class="c">감사합니다! Thank you!</div>
      ${CFG.STORE_PHONE ? `<div class="c">${esc(CFG.STORE_PHONE)}</div>` : ""}
      <div class="c">KakaoTalk: ${esc(CFG.KAKAO_ID)}</div>
      <div class="feed"></div>
    </div>`;
  };
  const custLabel = o => isDine(o) ? "HALL / CUSTOMER" : "손님 CUSTOMER";
  const body = typeof copies === "number"
    ? orders.map(o => Array.from({ length: copies }, () => one(o, "")).join("")).join("")
    : orders.map(o => printKinds(o).map(k => k === "kitchen" ? kitchenHTML(o) : one(o, k === "rider" ? "배달 RIDER" : custLabel(o))).join("")).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page { size: ${W}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${inner}mm; margin: 0 auto; font-weight: 500; font: 500 ${fs}px/1.35 "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
    .rc { padding: 2mm 0; page-break-after: always; break-after: page; }
    .rc:last-child { page-break-after: auto; break-after: auto; }
    .c { text-align: center; } .b { font-weight: 700; }
    .lg { font-size: 1.25em; } .xl { font-size: 1.4em; } .xxl { font-size: 2em; }
    .hr { border-top: 1px dashed #000; margin: 1.6mm 0; }
    .row { display: flex; justify-content: space-between; gap: 2mm; }
    .row span:last-child { white-space: nowrap; }
    .sub { font-size: .85em; margin: 0 0 1mm 1mm; }
    .memo { margin-top: 1mm; padding: 1mm; border: 1px solid #000; }
    .feed { height: 8mm; }
    div { word-break: break-word; }
  </style></head><body>${body}</body></html>`;
}

function printReceipt(orders, copies){
  orders = Array.isArray(orders) ? orders : [orders];
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(receiptDoc(orders, copies ?? "auto")); d.close();
  setTimeout(() => {
    try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){}
    setTimeout(() => f.remove(), 60000);
  }, 250);
}

/* ---------------- toast ---------------- */
function toast(msg, ms = 2200){
  let t = document.getElementById("toast");
  if(!t){ t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}

window.PT = { PRINT_SETS, printKinds, manilaDay, bizDay, bizStart, DAY_START_HOUR, orderDay, get menuCfgActive(){ return menuCfgActive; }, loadMenuData, exportMenu, priceSig, politeKo, CATS, get menuOv(){ return menuOv; }, applyMenuOverrides, cleanForTranslate, setTranslateKey, googleTranslate, splitKoEn, msgText, schedLabel, menuToEnglish, matchZone, zoneFee, phoneMask, phoneValue, phoneOk, phoneDigits, phoneFmt, englishOnly, EN_NAME, EN_ADDR, hasHangul, stampRewards, stampText, isMemberPhone, normPhone, phoneEmail, prettyPhone, couponDiscount, couponValue, couponFace, couponsFace, couponCond, couponUsable, COUPON_KINDS, couponKind, stackKey, stackMax, couponStackOk, couponsDiscount, bestCoupons, stackRulesText, repriceLine, errMsg, CFG, MENU, ITEM_BY_ID, esc, peso, ls, L, T, setLang, get LANG(){ return LANG; },
  orderPrefix, orderCode, isDine, inClosingWindow, isSvc, svcValue, riderPhone, riderEmail, STATUS, payInfo, isOnlinePay, lineName, lineOpt, compressImage, api, DEMO, receiptDoc, printReceipt, toast };
})();
