/* =====================================================================
   블루투스 영수증 프린터 (ESC/POS 감열 프린터)
   - 영수증을 그림(비트맵)으로 그려서 보내므로, 한글 글꼴이 없는 프린터에서도 한글이 깨지지 않습니다.
   - 연결 방식
     browser : 기존 방식 (브라우저 인쇄창, PC에 드라이버가 설치된 프린터)
     ble     : Chrome에서 블루투스로 바로 연결 (안드로이드/PC Chrome, BLE 지원 프린터)
     rawbt   : 안드로이드 'RawBT' 앱을 통해 인쇄 (블루투스 클래식 프린터도 대부분 가능)
     share   : 아이패드·아이폰 — 영수증 이미지를 공유 창으로 프린터 제조사 앱에 보내 인쇄
     station : 📡 와이파이 프린터 — 인쇄 요청을 서버에 올리면 가게 안드로이드폰(/print-station)이 받아서 출력 (49단계)
   ===================================================================== */
(function(){
const { CFG, ITEM_BY_ID, peso, ls, payInfo, isOnlinePay } = PT;

const DOTS = (CFG.RECEIPT_WIDTH_MM || 58) >= 80 ? 576 : 384;   // 58mm = 384 dot, 80mm = 576 dot
const FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';

/* ---------- 1) 영수증을 캔버스에 그리기 ---------- */
function drawReceipt(o, copyLabel, kitchen){
  const W = DOTS, pad = 6, S = DOTS / 384;       // 80mm 이면 글자도 비례 확대
  const c = document.createElement("canvas");
  c.width = W; c.height = 4000;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, c.height);
  g.fillStyle = "#000"; g.textBaseline = "top";
  let y = 8;
  const font = (px, bold) => { g.font = `${bold ? 700 : 500} ${Math.round(px * S)}px ${FONT}`; return Math.round(px * S); };
  function wrap(text, maxW){
    const out = []; let line = "";
    for(const ch of String(text)){
      if(ch === "\n"){ out.push(line); line = ""; continue; }
      if(g.measureText(line + ch).width > maxW && line){ out.push(line); line = ch.trim() ? ch : ""; }
      else line += ch;
    }
    out.push(line); return out;
  }
  function text(t, { size = 22, bold = false, align = "left", gap = 4 } = {}){
    const h = font(size, bold);
    wrap(t, W - pad*2).forEach(line => {
      const x = align === "center" ? (W - g.measureText(line).width) / 2 : pad;
      g.fillText(line, x, y); y += h + gap;
    });
  }
  function row(l, r, { size = 22, bold = false } = {}){
    const h = font(size, bold);
    const rw = g.measureText(r).width;
    const lines = wrap(l, W - pad*2 - rw - 10);
    lines.forEach((line, i) => { g.fillText(line, pad, y); if(i === 0) g.fillText(r, W - pad - rw, y); y += h + 4; });
  }
  function hr(){ y += 4; g.fillRect(pad, y, W - pad*2, 2); y += 10; }

  const fmt = d => { try{ return new Date(d).toLocaleString("en-PH", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false }); }catch(e){ return ""; } };
  const p = payInfo(o.payment);

  const isDine = PT.isDine(o);
  /* 주방용·홀(다이닝)용 = 영어만, 손님용(배달·픽업) = 한·영 */
  const en = !!kitchen || isDine, B = (ko, e) => en ? e : `${ko} ${e}`;
  const nameEn = l => { const it = ITEM_BY_ID[l.id] || {}; return l.en || it.en || l.name || it.name; };
  const optEn = x => x.en || x.ko;
  const discEn = lb => String(lb || "Discount").replace("다이닝 할인", "Dine-in discount").replace("매장 할인", "Store discount").replace("포인트 공제", "Points used").replace("가격 조정", "Price adjustment");
  const kind = isDine ? B("다이닝", "DINE IN") : o.order_type === "pickup" ? B("픽업", "PICKUP") : B("배달", "DELIVERY");
  if(kitchen){   // 🍳 주방용 (영어): 번호 · 메뉴 · 수량 · 옵션 · 요청사항 (가격 없음)
    text("[KITCHEN]", { size:24, bold:true, align:"center" });
    text(PT.orderCode(o), { size:60, bold:true, align:"center", gap:2 });
    { const top = y; y += 6; text(kind, { size:30, bold:true, align:"center" }); g.lineWidth = 3; g.strokeRect(pad, top, W - pad*2, y - top + 2); y += 8; }
    if(o.scheduled_at) text(`⏰ SCHEDULED ${PT.schedLabel(o.scheduled_at, "en")}`, { size:26, bold:true, align:"center" });
    text(fmt(o.created_at), { size:22, align:"center" });
    hr();
    (o.items || []).forEach(l => {
      row(`${PT.isSvc(l) ? "[FREE] " : ""}${nameEn(l)}`, `×${l.qty}`, { size:34, bold:true });
      if(l.opts && l.opts.length) text("  - " + l.opts.map(optEn).join(", "), { size:26 });
      y += 4;
    });
    hr();
    if(o.memo){ y += 4; const top = y; y += 6; text(`Note: ${o.memo_en || o.memo}`, { size:28, bold:true }); g.strokeStyle = "#000"; g.lineWidth = 3; g.strokeRect(pad - 2, top, W - pad*2 + 4, y - top + 2); y += 6; }
    y += 10;
    const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y / 8) * 8; out.getContext("2d").drawImage(c, 0, 0); return out;
  }
  text(en ? CFG.STORE_NAME_EN : `${CFG.STORE_NAME_KO} ${CFG.STORE_NAME_EN}`, { size:30, bold:true, align:"center" });
  text(isDine ? "Dine-in" : o.order_type === "pickup" ? "픽업 주문서 / Pickup Order" : "배달 주문서 / Delivery Order", { size:20, align:"center" });
  if(copyLabel) text(`[${copyLabel}]`, { size:22, bold:true, align:"center" });
  hr();
  text(PT.orderCode(o), { size:56, bold:true, align:"center", gap:2 });
  text(fmt(o.created_at), { size:20, align:"center" });
  if(o.scheduled_at){ if(!en) text(`⏰ 예약 ${PT.schedLabel(o.scheduled_at, "ko")}`, { size:28, bold:true, align:"center" }); text(`SCHEDULED ${PT.schedLabel(o.scheduled_at, "en")}`, { size:22, bold:true, align:"center" }); }
  hr();
  (o.items || []).forEach(l => {
    const it = ITEM_BY_ID[l.id] || {};
    const svc = PT.isSvc(l);
    row(`${svc ? B("[서비스]", "[FREE]") + " " : ""}${en ? nameEn(l) : (l.name || it.name)} x${l.qty}`, svc ? "FREE" : peso(l.unitPrice * l.qty), { size:24, bold:true });
    const sub = en
      ? [...(l.opts || []).map(optEn), svc && l.origUnit ? `(${peso(l.origUnit * l.qty)})` : ""].filter(Boolean).join(" · ")
      : [l.en || it.en || "", ...(l.opts || []).map(x => x.ko === x.en ? x.ko : `${x.ko}/${x.en}`), svc && l.origUnit ? `(${peso(l.origUnit * l.qty)})` : ""].filter(Boolean).join(" · ");
    if(sub) text("  " + sub, { size:19 });
  });
  hr();
  if((o.items || []).some(PT.isSvc)) row(B("서비스", "Service"), PT.svcValue(o) ? `${peso(PT.svcValue(o))} FREE` : "FREE", { bold:true });
  row(B("소계", "Subtotal"), peso(o.subtotal));
  if(o.order_type !== "pickup") row(B("배달비", "Delivery"), peso(o.delivery_fee));
  if(o.discount) row(B("쿠폰할인", "Coupon"), "-" + peso(o.discount));
  if(o.store_discount) row(en ? discEn(o.store_discount_label) : `${o.store_discount_label || "매장 할인"} Disc.`, "-" + peso(o.store_discount));
  row(B("합계", "TOTAL"), peso(o.total), { size:30, bold:true });
  hr();
  row(B("결제", "Payment"), isDine && o.payment === "cash" ? "Cash" : (p.labelEn || p.label), { bold:true });
  if(o._cashGot != null){ row(B("받은 돈", "Cash"), peso(o._cashGot)); row(B("거스름돈", "Change"), peso(o._cashGot - o.total), { bold:true }); }
  text(isDine ? (o.status === "done" ? `PAID ${peso(o.total)}` : `UNPAID ${peso(o.total)}`)
    : isOnlinePay(o.payment) ? (o.status === "receipt_submitted" ? "영수증 확인중 VERIFYING" : "결제완료 PAID")
    : `${o.order_type === "pickup" ? "매장 현금 CASH AT STORE" : "현금 수령 COLLECT"} ${peso(o.total)}`, { size:26, bold:true, align:"center" });
  hr();
  if(!isDine){
    text(`받는분 Name: ${o.cust_name}`, { size:22, bold:true });
    text(`연락처 Tel: ${o.cust_phone}`, { size:22, bold:true });
    if(o.order_type === "pickup") text("★ 픽업 PICKUP ★", { size:30, bold:true, align:"center" }); else text(`주소 Addr: ${o.cust_addr}`, { size:22 });
  }
  if(o.memo){ y += 4; const top = y; y += 6;
    if(en) text(`Note: ${o.memo_en || o.memo}`, { size:22, bold:true });
    else { text(`요청 Note: ${o.memo}`, { size:22, bold:true }); if(o.memo_en && o.memo_en !== o.memo) text(`(${o.memo_en})`, { size:19 }); }
    g.strokeStyle = "#000"; g.lineWidth = 2; g.strokeRect(pad - 2, top, W - pad*2 + 4, y - top + 2); y += 6; }
  if(o.staff_name) text(`${en ? "Staff" : "받은 직원 Staff"}: ${o.staff_name}`, { size:20 });
  hr();
  text(en ? "Thank you!" : "감사합니다! Thank you!", { size:22, align:"center" });
  if(CFG.STORE_PHONE) text(CFG.STORE_PHONE, { size:20, align:"center" });
  text(`KakaoTalk: ${CFG.KAKAO_ID}`, { size:20, align:"center" });
  y += 10;

  const out = document.createElement("canvas");
  out.width = W; out.height = Math.ceil(y / 8) * 8;
  out.getContext("2d").drawImage(c, 0, 0);
  return out;
}

/* ---------- 1-b) ✏️ 자유 인쇄 (메모 · 마감 종이) ----------
   note = { title, body, size: "m" | "l", at }
   본문에서  "---" 줄 = 구분선,  "# 글자" 줄 = 굵고 크게,  "왼쪽 | 오른쪽" 줄 = 양쪽 정렬 */
function drawNote(note){
  const W = DOTS, pad = 6, S = DOTS / 384, base = note.size === "l" ? 28 : 22;
  const c = document.createElement("canvas"); c.width = W; c.height = 6000;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, c.height); g.fillStyle = "#000"; g.textBaseline = "top";
  let y = 8;
  const font = (px, bold) => { g.font = `${bold ? 700 : 500} ${Math.round(px * S)}px ${FONT}`; return Math.round(px * S); };
  const wrap = (t, maxW) => { const out = []; let line = ""; for(const ch of String(t)){ if(g.measureText(line + ch).width > maxW && line){ out.push(line); line = ch.trim() ? ch : ""; } else line += ch; } out.push(line); return out; };
  const text = (t, size, bold, center) => { const h = font(size, bold); wrap(t, W - pad * 2).forEach(l => { g.fillText(l, center ? (W - g.measureText(l).width) / 2 : pad, y); y += h + 5; }); };
  const hr = () => { y += 4; g.fillRect(pad, y, W - pad * 2, 2); y += 10; };
  if(note.title){ text(note.title, base + 10, true, true); }
  const at = note.at ? new Date(note.at) : new Date();
  text(at.toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }), 18, false, true);
  hr();
  String(note.body || "").split("\n").forEach(raw => {
    const ln = raw.replace(/\s+$/, "");
    if(/^\s*-{3,}\s*$/.test(ln)) return hr();
    if(!ln.trim()){ y += Math.round(base * S * 0.6); return; }
    const big = /^#\s*/.test(ln), body = ln.replace(/^#\s*/, ""), sz = big ? base + 6 : base;
    const m = body.match(/^(.*?)\s*\|\s*(.*)$/);
    if(!m) return text(body, sz, big);
    { const h = font(sz, big), rw = g.measureText(m[2]).width; wrap(m[1], W - pad * 2 - rw - 10).forEach((l, i) => { g.fillText(l, pad, y); if(i === 0) g.fillText(m[2], W - pad - rw, y); y += h + 5; }); return; }
  });
  y += 10;
  const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y / 8) * 8;
  out.getContext("2d").drawImage(c, 0, 0);
  return out;
}

/* 📊 마감 종이 — 가게 마감 양식 (S / E / Counting) */
const DENOMS = [1000, 500, 100, 50, 20, 10, 5, 1];
const PESO = n => "₱" + Math.round(n || 0).toLocaleString("en-PH");
const PAY4 = [["cash", "Cash"], ["gcash", "GCash"], ["maya", "Maya"], ["bank", "Metro"]];
/* 돈 세기: counts = { 1000: 3, 500: 2, ... } → 줄들 (비어 있으면 손으로 적는 칸) */
function countingLines(counts, en){
  const c = counts || {}, has = DENOMS.some(d => +c[d] > 0);
  const L = ["# Counting"];
  DENOMS.forEach(d => { const n = Math.round(+c[d] || 0); L.push(has ? `₱${d} × ${n} | ${PESO(d * n)}` : `₱${d} × ____ | ₱________`); });
  L.push(`# = | ${has ? PESO(DENOMS.reduce((s, d) => s + d * Math.round(+c[d] || 0), 0)) : "₱________"}`);
  return L;
}
const countTotal = counts => DENOMS.reduce((s, d) => s + d * Math.round(+(counts || {})[d] || 0), 0);
/* S = 매출(결제수단별), E = 지출(결제수단별) — 가게 마감 종이와 같은 모양 */
function cashSalesOf(orders){ return (orders || []).filter(o => o.status === "done" && (!o.payment || o.payment === "cash")).reduce((s, o) => s + (o.total || 0), 0); }
/* 현금 매출 = 돈 세기(− 시작 거스름돈) 맞는지 */
function cashCheck(cashSales, counts, float, en){
  const T = (k, e) => en ? e : k, got = countTotal(counts) - (Math.round(+float || 0));
  const d = got - cashSales;
  return { got, d, text: d === 0 ? T("✔ 일치", "✔ Match") : d < 0 ? T(`⚠ ${PESO(-d)} 부족`, `⚠ Short ${PESO(-d)}`) : T(`⚠ ${PESO(d)} 남음`, `⚠ Over ${PESO(d)}`) };
}
function closingText(orders, day, en, counts, float){
  const T = (k, e) => en ? e : k;
  const list = orders || [], live = list.filter(o => o.status !== "cancelled"), done = live.filter(o => o.status === "done");
  const byPay = { cash: 0, gcash: 0, maya: 0, bank: 0 };
  done.forEach(o => { const k = byPay[o.payment] != null ? o.payment : "cash"; byPay[k] += o.total || 0; });
  const S = done.reduce((s, o) => s + (o.total || 0), 0);
  const L = [];
  L.push(`# S = Cash+GCash+Maya+Metro`);
  PAY4.forEach(([k, n]) => L.push(`${n} | ${PESO(byPay[k])}`));
  L.push(`# S | ${PESO(S)}`);
  L.push(`${T("완료", "Done")} ${done.length} · ${T("미완료", "Open")} ${live.length - done.length} · ${T("취소", "Cancelled")} ${list.length - live.length}`);
  L.push("---");
  L.push(`# E = Cash+GCash+Maya+Metro`);
  PAY4.forEach(([, n]) => L.push(`${n} | ₱________`));
  L.push(`# E | ₱________`);
  L.push("---");
  L.push(...countingLines(counts, en));
  L.push("---");
  L.push(`# ${T("현금 매출 = Counting ?", "Cash sales = Counting ?")}`);
  L.push(`${T("현금 매출 (시스템)", "Cash sales (system)")} | ${PESO(byPay.cash)}`);
  if(+float) L.push(`${T("시작 거스름돈", "Starting change")} | -${PESO(float)}`);
  if(countTotal(counts)){
    const c = cashCheck(byPay.cash, counts, float, en);
    L.push(`${T("세기 − 거스름돈", "Counted − change")} | ${PESO(c.got)}`);
    L.push(`# ${c.text}`);
  } else L.push(`${T("세기 − 거스름돈", "Counted − change")} | ₱________`, `${T("일치 / 차이", "Match / diff")} | ₱________`);
  L.push("---");
  L.push(`${T("마감 담당", "Closed by")} |`);
  L.push(`${T("특이사항", "Notes")}:`);
  return L.join("\n");
}
function blankClosing(en, counts){
  const T = (k, e) => en ? e : k, L = [];
  L.push(`# S = Cash+GCash+Maya+Metro`); PAY4.forEach(([, n]) => L.push(`${n} | ₱________`)); L.push(`# S | ₱________`);
  L.push("---");
  L.push(`# E = Cash+GCash+Maya+Metro`); PAY4.forEach(([, n]) => L.push(`${n} | ₱________`)); L.push(`# E | ₱________`);
  L.push("---");
  L.push(...countingLines(counts, en));
  L.push("---");
  L.push(`${T("마감 담당", "Closed by")} |`); L.push(`${T("특이사항", "Notes")}:`);
  return L.join("\n");
}

/* ✏️ 자유 인쇄 편집 창 (관리자 · 인쇄 스테이션 공통)
   opts = { en, onPrint(note, copies), loadOrders: async day => orders (마감 불러오기용) } */
function openNoteEditor(opts){
  const saved = ls.get("paltong_note_draft", null) || {};
  let en = saved.en != null ? !!saved.en : !!opts.en, size = saved.size || "m", counts = saved.counts || {}, float = saved.float || 0, cashSales = null;
  if(opts.loadOrders) opts.loadOrders(PT.bizDay(new Date())).then(list => { cashSales = cashSalesOf(list); const f = bg.querySelector("[data-check]"); if(f && f._paint) f._paint(); }).catch(() => {});
  const bg = document.createElement("div");
  bg.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(20,12,8,.6);display:flex;align-items:flex-end;justify-content:center";
  document.body.append(bg);
  const close = () => bg.remove();
  bg.onclick = e => { if(e.target === bg) close(); };
  let title = saved.title || "", body = saved.body || "", copies = 1, msg = "";
  function render(){
    const T = (k, e) => en ? e : k;
    bg.innerHTML = `<div style="background:#fff;width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom));font-family:inherit">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px"><b style="font-size:18px">✏️ ${T("자유 인쇄 (메모 · 마감)", "Free print (memo · closing)")}</b>
      <span style="white-space:nowrap"><button data-lang="ko" class="pill">한국어</button> <button data-lang="en" class="pill">English</button> <button data-x style="border:0;background:none;font-size:22px">✕</button></span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${opts.loadOrders ? `<button data-tpl="close" class="pill">📊 ${T("오늘 마감 불러오기", "Load today's closing")}</button>` : ""}
      <button data-tpl="blank" class="pill">🧾 ${T("마감 빈 양식", "Blank closing form")}</button>
      <button data-tpl="clear" class="pill">🗑 ${T("지우기", "Clear")}</button>
    </div>
    <details data-cnt style="border:1px solid #eee;border-radius:12px;padding:8px 10px;margin-bottom:8px" ${saved.cntOpen ? "open" : ""}><summary style="font-weight:700">💵 ${T("돈 세기 (Counting) — 몇 장 / 몇 개", "Counting — how many of each")} <span data-ctot style="color:#d33d2a"></span></summary>
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;margin-top:8px">
        ${DENOMS.map(d => `<b>₱${d}</b><input data-d="${d}" type="number" min="0" inputmode="numeric" placeholder="0" value="${counts[d] || ""}" style="padding:8px;border:1px solid #ddd;border-radius:8px;font-size:16px"><span data-sub="${d}" style="text-align:right;min-width:80px"></span>`).join("")}
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><span style="font-size:13px">${T("시작 거스름돈 (빼기)", "Starting change (minus)")}</span><input data-float type="number" min="0" inputmode="numeric" placeholder="0" value="${float || ""}" style="width:110px;padding:8px;border:1px solid #ddd;border-radius:8px;font-size:16px"></div>
      <div data-check style="margin-top:8px;padding:10px;border-radius:10px;background:#f6efe6;font-size:14px"></div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button data-cins class="pill">⬇ ${T("본문에 넣기", "Put into the slip")}</button><button data-creset class="pill">${T("0으로", "Reset")}</button></div>
      <p style="font-size:12px;color:#888;margin:6px 0 0">${T("숫자를 넣으면 금액·합계가 자동 계산돼요. '마감 불러오기'를 누르면 세기 결과와 현금 매출 차이도 같이 나와요.", "Amounts and the total are calculated. 'Load today's closing' also shows the difference from cash sales.")}</p>
    </details>
    <input data-f="title" placeholder="${T("제목 (예: 마감 / 발주 / 메모)", "Title (e.g. Closing / Order list / Memo)")}" style="width:100%;box-sizing:border-box;font-size:17px;padding:10px;border:1px solid #ddd;border-radius:10px;margin-bottom:8px" value="${PT.esc(title)}">
    <textarea data-f="body" rows="12" placeholder="${T("내용을 적으세요\n\n· '---' 한 줄 = 구분선\n· '# 글자' = 굵고 크게\n· '현금 | ₱5,000' = 왼쪽·오른쪽 정렬", "Type anything\n\n· '---' line = divider\n· '# text' = big bold\n· 'Cash | ₱5,000' = left/right aligned")}" style="width:100%;box-sizing:border-box;font-size:15px;padding:10px;border:1px solid #ddd;border-radius:10px;font-family:inherit">${PT.esc(body)}</textarea>
    <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap">
      <span style="font-size:13px;color:#666">${T("글자", "Text")}</span>
      <button data-size="m" class="pill">${T("보통", "Normal")}</button><button data-size="l" class="pill">${T("크게", "Large")}</button>
      <span style="font-size:13px;color:#666;margin-left:8px">${T("장수", "Copies")}</span>
      <input data-f="copies" type="number" min="1" max="5" value="${copies}" style="width:56px;padding:6px;border:1px solid #ddd;border-radius:8px">
    </div>
    <details style="margin-bottom:8px"><summary style="font-size:13px;color:#666">${T("미리보기", "Preview")}</summary><img data-prev style="width:100%;border:1px solid #ddd;border-radius:8px;margin-top:6px"></details>
    <button data-go style="width:100%;padding:16px;border:0;border-radius:14px;background:#d33d2a;color:#fff;font-size:17px;font-weight:800">🖨 ${T("인쇄", "Print")}</button>
    <p data-msg style="font-size:13px;color:#666;margin:8px 0 0">${PT.esc(msg)}</p></div>`;
    const q = x => bg.querySelector(x), tEl = q('[data-f="title"]'), bEl = q('[data-f="body"]');
    const save = () => { title = tEl.value; body = bEl.value; copies = Math.max(1, Math.min(5, Math.round(+q('[data-f="copies"]').value || 1))); ls.set("paltong_note_draft", { title, body, size, en, counts, float, cntOpen: q("[data-cnt]").open }); };
    const note = () => ({ title: tEl.value.trim(), body: bEl.value, size, at: new Date().toISOString() });
    const prev = () => { try{ q("[data-prev]").src = drawNote(note()).toDataURL(); }catch(e){} };
    const say = t => { msg = t; q("[data-msg]").textContent = t; };
    const paintCnt = () => { DENOMS.forEach(d => { const n = Math.round(+counts[d] || 0); q(`[data-sub="${d}"]`).textContent = n ? PESO(d * n) : ""; }); const t = countTotal(counts); q("[data-ctot]").textContent = t ? "= " + PESO(t) : "";
      const box = q("[data-check]"); box._paint = paintCnt;
      if(cashSales == null){ box.innerHTML = opts.loadOrders ? T("현금 매출 불러오는 중…", "Loading cash sales…") : ""; box.hidden = !opts.loadOrders; return; }
      const c = cashCheck(cashSales, counts, float, en), ok = c.d === 0;
      box.innerHTML = `${T("오늘 현금 매출", "Today's cash sales")} <b>${PESO(cashSales)}</b> · ${T("세기", "Counted")} <b>${PESO(t)}</b>${float ? ` − ${PESO(float)}` : ""}<br>`
        + (t ? `<b style="font-size:17px;color:${ok ? "#2f8f4e" : "#d33d2a"}">${c.text}</b>` : `<span style="color:#888">${T("위에 장수를 넣으면 맞는지 바로 알려줘요", "Enter counts above to check")}</span>`); };
    bg.querySelectorAll("[data-lang]").forEach(b => { b.style.fontWeight = (b.dataset.lang === "en") === en ? "800" : ""; b.classList.toggle("sel", (b.dataset.lang === "en") === en); b.onclick = () => { save(); en = b.dataset.lang === "en"; save(); msg = ""; render(); }; });
    bg.querySelectorAll("[data-size]").forEach(b => { b.classList.toggle("sel", b.dataset.size === size); b.style.fontWeight = b.dataset.size === size ? "800" : ""; b.onclick = () => { size = b.dataset.size; save(); render(); }; });
    q("[data-x]").onclick = close;
    [tEl, bEl, q('[data-f="copies"]')].forEach(el => el.addEventListener("input", () => { save(); prev(); }));
    q("[data-cnt]").addEventListener("toggle", save);
    bg.querySelectorAll("[data-d]").forEach(inp => inp.addEventListener("input", () => { counts[inp.dataset.d] = Math.max(0, Math.round(+inp.value || 0)); save(); paintCnt(); }));
    q("[data-creset]").onclick = () => { counts = {}; save(); render(); };
    q("[data-float]").addEventListener("input", e => { float = Math.max(0, Math.round(+e.target.value || 0)); save(); paintCnt(); });
    q("[data-cins]").onclick = () => {
      const block = countingLines(counts, en).join("\n");
      const cur = bEl.value, re = /# Counting[\s\S]*?\n# = \|[^\n]*/;
      bEl.value = re.test(cur) ? cur.replace(re, block) : (cur.trim() ? cur.replace(/\s*$/, "\n---\n") : "") + block;
      if(!tEl.value.trim()) tEl.value = "Counting";
      save(); prev(); say(T("✔ 본문에 넣었어요", "✔ Added to the slip"));
    };
    bg.querySelectorAll("[data-tpl]").forEach(b => b.onclick = async () => {
      const t = b.dataset.tpl, day = PT.bizDay(new Date());
      if(t === "clear"){ tEl.value = ""; bEl.value = ""; }
      if(t === "blank"){ tEl.value = `${T("마감", "CLOSING")} ${day}`; bEl.value = blankClosing(en, counts); }
      if(t === "close"){
        say(T("오늘 주문 불러오는 중…", "Loading today's orders…"));
        try{ const list = await opts.loadOrders(day);
          cashSales = cashSalesOf(list); tEl.value = `${T("마감", "CLOSING")} ${day}`; bEl.value = closingText(list, day, en, counts, float); paintCnt();
          say(T("✔ 오늘(영업일) 주문으로 채웠어요. E(지출)는 손으로 적거나 여기서 고친 뒤 인쇄하세요.", "✔ Filled from today's orders. Write E (expenses) by hand or edit here, then print.")); }
        catch(e){ say("✖ " + PT.errMsg(e)); }
      }
      save(); prev();
    });
    q("[data-go]").onclick = async () => {
      save();
      const n = note(); if(!n.title && !n.body.trim()){ say(T("내용을 적어주세요", "Please type something")); return; }
      q("[data-go]").disabled = true; say(T("보내는 중…", "Sending…"));
      try{ await opts.onPrint(n, copies); say(T("✔ 보냈어요", "✔ Sent")); setTimeout(close, 900); }
      catch(e){ say("✖ " + (e.message || e)); q("[data-go]").disabled = false; }
    };
    paintCnt(); prev();
  }
  render();
}

/* ---------- 2) 캔버스 → ESC/POS 래스터 바이트 ---------- */
function canvasToEscPos(canvas){
  const W = canvas.width, H = canvas.height, bw = W / 8;
  const px = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  const parts = [];
  const BAND = 64;                                   // 64줄씩 나눠 보내 프린터 버퍼 넘침 방지
  for(let y0 = 0; y0 < H; y0 += BAND){
    const h = Math.min(BAND, H - y0);
    const band = new Uint8Array(8 + bw * h);
    band.set([0x1d, 0x76, 0x30, 0x00, bw & 255, bw >> 8, h & 255, h >> 8]);
    for(let y = 0; y < h; y++) for(let x = 0; x < W; x++){
      const i = ((y0 + y) * W + x) * 4;
      const lum = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;
      if(px[i+3] > 0 && lum < 150) band[8 + y * bw + (x >> 3)] |= 0x80 >> (x & 7);
    }
    parts.push(band);
  }
  return parts;
}
function concat(arrs){ const n = arrs.reduce((s,a) => s + a.length, 0), o = new Uint8Array(n); let k = 0; arrs.forEach(a => { o.set(a, k); k += a.length; }); return o; }
const INIT = new Uint8Array([0x1b, 0x40]);
const FEED_CUT = new Uint8Array([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);   // 4줄 띄우고 자르기(커터 없는 프린터는 무시)

/* 인쇄할 영수증들 (주방용 · 손님용 · 기사용) → 캔버스 목록 */
function buildSlips(orders, copies){
  const out = [];
  orders.forEach(o => {
    if(o && o._note){ const n = typeof copies === "number" ? copies : 1; for(let i = 0; i < n; i++) out.push(drawNote(o._note)); return; }
    if(typeof copies === "number"){ for(let i = 0; i < copies; i++) out.push(drawReceipt(o, "")); return; }
    (Array.isArray(copies) ? copies : PT.printKinds(o)).forEach(k => out.push(k === "kitchen" ? drawReceipt(o, "", true) : drawReceipt(o, PT.KIND_LABEL[k] ? PT.KIND_LABEL[k] : PT.isDine(o) ? "HALL / CUSTOMER" : "손님 CUSTOMER")));
  });
  return out;
}
function buildJob(orders, copies){
  const parts = [INIT];
  buildSlips(orders, copies).forEach(cv => { parts.push(...canvasToEscPos(cv)); parts.push(FEED_CUT); });
  return concat(parts);
}

/* ---------- 3-a) Web Bluetooth (BLE) ---------- */
const BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb", "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb", "0000ff12-0000-1000-8000-00805f9b34fb",
];
let bleDevice = null, bleChar = null;
const bleSupported = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);

async function findWritable(server){
  const services = await server.getPrimaryServices();
  for(const s of services){
    for(const ch of await s.getCharacteristics()){
      if(ch.properties.writeWithoutResponse || ch.properties.write) return ch;
    }
  }
  throw new Error("이 프린터에서 쓰기 가능한 채널을 찾지 못했습니다");
}
async function bleConnect(pick){
  if(!bleSupported()) throw new Error("이 브라우저는 블루투스 연결을 지원하지 않습니다 (안드로이드/PC는 Chrome, 아이폰은 Bluefy 앱 사용)");
  if(!bleDevice && !pick && navigator.bluetooth.getDevices){
    const saved = ls.get("paltong_ble_name", "");
    const list = await navigator.bluetooth.getDevices().catch(() => []);
    bleDevice = list.find(d => d.name === saved) || null;
  }
  if(!bleDevice || pick){
    bleDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    ls.set("paltong_ble_name", bleDevice.name || "");
    bleDevice.addEventListener("gattserverdisconnected", () => { bleChar = null; });
  }
  if(!bleDevice.gatt.connected || !bleChar){
    const server = await bleDevice.gatt.connect();
    bleChar = await findWritable(server);
  }
  return bleDevice.name || "프린터";
}
async function bleSend(bytes){
  await bleConnect(false);
  const noResp = bleChar.properties.writeWithoutResponse;
  let size = 180;
  for(let i = 0; i < bytes.length; ){
    const chunk = bytes.slice(i, i + size);
    try{
      if(noResp && bleChar.writeValueWithoutResponse) await bleChar.writeValueWithoutResponse(chunk);
      else if(bleChar.writeValueWithResponse && !noResp) await bleChar.writeValueWithResponse(chunk);
      else await bleChar.writeValue(chunk);   // 예전 방식 (Bluefy 등)
      i += chunk.length;
      if(noResp) await new Promise(r => setTimeout(r, 12));
    }catch(e){
      if(size > 20){ size = 20; continue; }          // 일부 프린터는 한 번에 20바이트만 받음
      throw e;
    }
  }
}

/* ---------- 3-b) RawBT (안드로이드 앱) ---------- */
function rawbtIntent(bytes){
  let bin = ""; for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return "intent:base64," + btoa(bin) + "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
}
function rawbtSend(bytes){ location.href = rawbtIntent(bytes); }
/* RawBT 웹소켓 (안드로이드 'Server for RawBT' 앱, ws://localhost:40213) — 누르지 않아도 자동 인쇄
   RawBT API 형식: JSON 작업 { idJob, commands:[{ command:"sendBytes", base64 }], printer:"current", template:"none" }
   → 서버가 { responseType: "success" | "error" | "progress", jobId, errorMessage } 로 답함 */
function rawbtWsSend(bytes, timeoutMs){
  let bin = ""; for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const idJob = "pt" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const job = JSON.stringify({ idJob, commands: [{ command: "sendBytes", base64: btoa(bin) }], copies: 1, template: "none", printer: "current", premium: false });
  return new Promise((ok, fail) => {
    let ws, done = false;
    const end = (e) => { if(done) return; done = true; clearTimeout(t); try{ ws && ws.close(1000); }catch(_){} e ? fail(e) : ok(); };
    const t = setTimeout(() => end(new Error("RawBT 서버가 인쇄 결과를 알려주지 않았어요 (Server for RawBT 앱 · 프린터 전원 확인)")), timeoutMs || 25000);
    try{ ws = new WebSocket("ws://localhost:40213/"); }catch(e){ return end(new Error("RawBT 서버에 연결할 수 없어요: " + (e.message || e))); }
    ws.onerror = () => end(new Error("RawBT 서버에 연결할 수 없어요 (Server for RawBT 앱이 켜져 있는지 확인)"));
    ws.onclose = () => end(new Error("RawBT 서버 연결이 끊겼어요"));
    ws.onopen = () => { try{ ws.send(job); }catch(e){ end(e); } };
    ws.onmessage = ev => {
      let r = null; try{ r = JSON.parse(ev.data); }catch(_){ return; }
      if(!r || (r.jobId && r.jobId !== idJob)) return;
      if(r.responseType === "success") end();
      else if(r.responseType === "error" || r.responseType === "canceled") end(new Error("RawBT: " + (r.errorMessage || r.responseType)));
    };
  });
}
/* 📡 인쇄 스테이션으로 보내기 — 주문마다 인쇄할 장(주방용·손님용…)을 이 기기 설정대로 정해서 보냄 */
async function stationSend(orders, copies){
  for(const o of orders){
    if(o._note){ await PT.api.printJobAdd(JSON.parse(JSON.stringify(o)), typeof copies === "number" ? copies : 1, "✏️ " + (o._note.title || "메모")); continue; }
    const kinds = typeof copies === "number" ? copies : PT.printKinds(o);
    const items = (o.items || []).filter(l => !l.svc || l.couponFree);
    const label = `${PT.orderCode ? PT.orderCode(o) : "#" + (o.order_no ?? "")} · ${(items[0] && (items[0].en || items[0].name)) || ""}${items.length > 1 ? ` +${items.length - 1}` : ""}`;
    await PT.api.printJobAdd(JSON.parse(JSON.stringify(o)), kinds, label);
  }
}

/* ---------- 3-c) 아이패드·아이폰: 이미지 공유 → 프린터 앱 ----------
   여러 장(주방용 + 손님용)은 한 장의 긴 이미지로 이어 붙이고 사이에 '✂ 자르는 선'을 그림
   (프린터 앱 대부분이 이미지 1장만 받기 때문) */
function stackCanvases(list){
  const GAP = 70, W = list[0].width, H = list.reduce((s, c) => s + c.height, 0) + GAP * (list.length - 1);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  let y = 0;
  list.forEach((cv, i) => {
    g.drawImage(cv, 0, y); y += cv.height;
    if(i < list.length - 1){ g.fillStyle = "#000"; g.font = `500 ${Math.round(18 * W / 384)}px sans-serif`; g.textAlign = "center"; g.fillText("✂ - - - - - - - - - - - - - - - - - -", W / 2, y + GAP / 2 + 6); y += GAP; }
  });
  return c;
}
const toBlob = c => new Promise(r => c.toBlob(r, "image/png"));
async function shareSend(orders, copies){
  const slips = buildSlips(orders, copies);
  if(!slips.length) return;
  const blob = await toBlob(stackCanvases(slips));
  const name = `receipt-${(orders[0] && (PT.orderCode ? PT.orderCode(orders[0]) : orders[0].order_no)) || "test"}.png`.replace(/[^\w.-]/g, "_");
  const file = new File([blob], name, { type: "image/png" });
  const data = { files: [file], title: "PAL TONG receipt" };
  const canShare = navigator.canShare && navigator.canShare(data);
  if(canShare){
    try{ await navigator.share(data); return; }
    catch(e){ if(e && e.name === "AbortError") return; }   // 사용자가 닫음 → 끝 / 그 외(버튼 누른 뒤 시간이 지남 등) → 아래 버튼 창
  }
  shareSheet(blob, data, canShare);
}
/* 공유 창을 바로 못 띄웠을 때: 미리보기 + 큰 버튼 (한 번 누르면 공유 창) */
function shareSheet(blob, data, canShare){
  const url = URL.createObjectURL(blob);
  const bg = document.createElement("div");
  bg.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(20,12,8,.6);display:flex;align-items:flex-end;justify-content:center";
  bg.innerHTML = `<div style="background:#fff;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom));font-family:sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:17px">🖨 영수증 인쇄</b><button data-x style="border:0;background:none;font-size:22px">✕</button></div>
    ${canShare ? `<button data-share style="width:100%;padding:16px;border:0;border-radius:14px;background:#d33d2a;color:#fff;font-size:17px;font-weight:800;margin-bottom:8px">📤 프린터 앱으로 보내기</button>
      <p style="font-size:12px;color:#777;margin:0 0 10px">공유 창에서 프린터 앱을 고르면 인쇄돼요.</p>`
    : `<p style="font-size:13px;color:#555;margin:0 0 10px">이 브라우저는 공유를 지원하지 않아요. 아래 영수증을 길게 눌러 '공유' → 프린터 앱을 고르세요.</p>`}
    <img src="${url}" alt="receipt" style="width:100%;border:1px solid #ddd;border-radius:8px"></div>`;
  document.body.append(bg);
  const close = () => { bg.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  bg.querySelector("[data-x]").onclick = close;
  bg.onclick = e => { if(e.target === bg) close(); };
  const b = bg.querySelector("[data-share]");
  if(b) b.onclick = async () => { try{ await navigator.share(data); close(); }catch(e){ if(e && e.name !== "AbortError") alert("공유 실패: " + (e.message || e)); } };
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* ---------- 공개 함수 ---------- */
const getMode = () => ls.get("paltong_print_mode", isIOS() ? "share" : "browser");   // 아이패드·아이폰은 처음부터 공유 방식
const setMode = m => ls.set("paltong_print_mode", m);

async function print(orders, copies){
  orders = Array.isArray(orders) ? orders : [orders];
  copies = copies ?? "auto";   // auto = 프린터 설정의 '인쇄할 장' (기본 주방용 + 손님용)
  const mode = getMode();
  if(mode === "browser" && orders.some(o => o._note)){
    await (document.fonts && document.fonts.ready);
    const w = window.open("", "_blank"); if(!w) throw new Error("팝업이 막혔어요");
    w.document.write(`<html><body style="margin:0">${buildSlips(orders, copies).map(c => `<img src="${c.toDataURL()}" style="width:58mm;display:block;page-break-after:always">`).join("")}<script>onload=()=>{print();}<\/script></body></html>`); w.document.close(); return;
  }
  if(mode === "browser") return PT.printReceipt(orders, copies);
  if(mode === "share") return shareSend(orders, copies);
  if(mode === "station") return stationSend(orders, copies);   // 글꼴 대기(await) 전에 바로 — 공유 창은 버튼 누른 직후에만 열림
  await (document.fonts && document.fonts.ready);
  const bytes = buildJob(orders, copies);
  if(mode === "ble") return bleSend(bytes);
  if(mode === "rawbt") return rawbtSend(bytes);
}
function previewCanvas(o){ return drawReceipt(o, ""); }

window.PTPrinter = { openNoteEditor, drawNote, closingText, blankClosing, print, getMode, setMode, isIOS, bleConnect, bleSupported, buildJob, previewCanvas, drawReceipt, canvasToEscPos, rawbtWsSend, rawbtSend, stationSend, buildSlips,
  get bleName(){ return (bleDevice && bleDevice.name) || ls.get("paltong_ble_name", ""); } };
})();
