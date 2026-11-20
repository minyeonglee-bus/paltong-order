// 빨통 DK 연결 — 배달K 사장님 웹 주문 화면에서 새 주문 카드를 읽음
// 화면만 읽어요 (버튼을 누르거나 로그인 정보를 건드리지 않음).
(() => {
  const SCAN_MS = 5000, PING_MS = 5 * 60 * 1000;
  const T = el => (el && el.textContent || "").replace(/\s+/g, " ").trim();
  const waiting = {};   // 메뉴가 아직 안 보이는 카드 → 몇 번 기다렸는지

  function phone(s){
    let d = String(s || "").replace(/\D/g, "");
    if(d.startsWith("63") && d.length === 12) d = "0" + d.slice(2);
    return /^09\d{9}$/.test(d) ? d.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3") : String(s || "").trim();
  }
  function readCard(a){
    const no = T(a.querySelector(".classic-order-number")).replace(/\D/g, "") || (T(a).match(/#(\d{6,})/) || [])[1] || "";
    if(!no) return null;
    const type = T(a.querySelector(".type-label"));
    const name = T(a.querySelector(".classic-customer h3"));
    const addrEl = a.querySelector(".address-text");
    const addrMain = T(addrEl && addrEl.querySelector("strong"));
    let detail = "";
    const det = a.querySelector(".address-detail");
    if(det){ const c = det.cloneNode(true); c.querySelectorAll("b").forEach(b => b.remove()); detail = T(c); }
    const ph = phone(T(a.querySelector(".phone strong")) || T(a.querySelector(".phone")));
    const items = [...a.querySelectorAll("app-order-products .item")].map(it => {
      const nm = T(it.querySelector(".item-info strong"));
      let opt = T(it.querySelector(".item-info p")).replace(/^\(\s*|\s*\)$/g, "");
      opt = opt.split("/").map(x => x.trim().replace(/\s*\+\s*0\s*₱?\s*$/, "")).filter(Boolean).join(" / ");   // "+0 ₱" 는 빼기
      const qty = T(it.querySelector(".qty")).replace(/\D/g, "") || "1";
      return nm ? `${nm}${opt ? ` (${opt})` : ""} x${qty}` : "";
    }).filter(Boolean);
    const want = +((T(a.querySelector(".item-count")).match(/(\d+)\s*items?/i) || [])[1] || 0);
    const pay = T(a.querySelector(".summary-total .payment"));
    const total = T(a.querySelector(".summary-total strong")).replace(/[^\d,.]/g, "");
    // 손님 요청사항 (있으면) — 채팅 미리보기는 제외
    const req = [...a.querySelectorAll("[class*=request],[class*=memo],[class*=note],[class*=comment]")]
      .filter(e => !e.closest(".chat-entry") && !e.closest("app-order-products")).map(T).filter(Boolean);
    const pickup = /pick\s*-?\s*up|take\s*-?\s*out|포장|픽업/i.test(type);
    const lines = [
      `요청: DK 주문아이디 ${no}`,
      pickup ? "픽업주문" : "",
      name ? `주문하신 분: ${name}` : "",
      ph ? `연락처: ${ph}` : "",
      !pickup && addrMain ? `주소: ${addrMain}` : "",
      !pickup && detail ? `상세 주소: ${detail}` : "",
      ...items,
      pay ? `결제: ${pay}` : "",
      total ? `합계: ${total} ₱` : "",
      ...[...new Set(req)].map(r => `요청: ${r}`)
    ].filter(Boolean);
    return { no, name, items, want, title: `${pickup ? "픽업" : "배달"} · ${name || "DK"}${total ? ` · ₱${total}` : ""}`, text: lines.join("\n") };
  }

  async function sentMap(){ const { sent = {} } = await chrome.storage.local.get("sent"); return sent; }
  let busy = false;
  async function scan(){
    if(busy || !/^\/order/.test(location.pathname)) return;
    busy = true;
    try{
      const cards = [...document.querySelectorAll("article.merchant, article.redesign-card")];
      if(!cards.length) return;
      const sent = await sentMap();
      for(const a of cards){
        const c = readCard(a); if(!c || sent[c.no]) continue;
        if(c.items.length < c.want && (waiting[c.no] = (waiting[c.no] || 0) + 1) < 4) continue;   // 메뉴가 다 보일 때까지 잠깐 기다림 (최대 ~20초)
        const r = await chrome.runtime.sendMessage({ type: "order", no: c.no, title: c.title, text: c.text }).catch(e => ({ ok: false, error: String(e) }));
        if(r && r.ok){ sent[c.no] = Date.now(); await chrome.storage.local.set({ sent }); }
      }
      // 오래된 기록 정리 (7일)
      const cut = Date.now() - 7 * 864e5; let changed = false;
      for(const k of Object.keys(sent)) if(sent[k] < cut){ delete sent[k]; changed = true; }
      if(changed) await chrome.storage.local.set({ sent });
    }finally{ busy = false; }
  }
  function ping(){
    if(!/^\/order/.test(location.pathname)) return;
    const loggedIn = !!document.querySelector("ion-segment.order-top-segment");
    if(!loggedIn) return;   // 로그인 안 돼 있으면 "연결 끊김"으로 보이게 ping 안 보냄
    const n = document.querySelectorAll("article.merchant, article.redesign-card").length;
    chrome.runtime.sendMessage({ type: "ping", info: `주문 화면 열림 · 지금 주문 ${n}건` }).catch(() => {});
  }


  /* ---------------- 🔄 상태 맞추기 (양방향) ----------------
     배달K 단계: 1 접수대기 · 2 주문접수 · 3 조리중 · 4 배달시작 · 5 곧도착 · 6 완료 · -1 취소
     15초마다 보이는 카드 상태를 보내고, 서버가 돌려준 할 일(우리 앱에서 배달 중/완료된 주문)을
     배달K 화면의 상태 버튼을 눌러서 맞춤. 배달K에서 아직 '조리중'이 안 된 주문(접수 전)은 안 건드림. */
  const levelOf = s => { s = String(s || "").trim();
    if(/cancel|취소/i.test(s)) return -1;
    if(/complet|finish|완료/i.test(s)) return 6;
    if(/arriv|soon|곧\s*도착/i.test(s)) return 5;
    if(/deliver|배달\s*(시작|출발|중)|picked/i.test(s)) return 4;
    if(/prepar|cook|조리|준비/i.test(s)) return 3;
    if(/received|confirm|accept|주문\s*(접수|확인)/i.test(s)) return 2;
    if(/pending|waiting|대기/i.test(s)) return 1;
    return null; };
  const cardNo = a => T(a.querySelector(".classic-order-number")).replace(/\D/g, "") || (T(a).match(/#(\d{6,})/) || [])[1] || "";
  const findCard = no => [...document.querySelectorAll("article.merchant, article.redesign-card")].find(a => cardNo(a) === no);
  const cardLabel = a => T(a.querySelector(".status-label-text")) || T(a.querySelector("button.current-status"));
  const orderViewOn = () => { const seg = [...document.querySelectorAll("ion-segment.order-top-segment ion-segment-button")].find(b => /^order$/i.test(T(b)));
    return !!(seg && seg.classList.contains("segment-button-checked")); };
  const filtered = () => [...document.querySelectorAll("button")].some(b => (b.classList.contains("active") || b.getAttribute("aria-pressed") === "true")
    && /^(my orders|pending|processing|reservation)\b/i.test(T(b)) && b.offsetParent);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms){ const end = Date.now() + ms; while(Date.now() < end){ const v = fn(); if(v) return v; await wait(250); } return null; }

  const seen = {};        // 이 화면에서 본 카드: no → { level, label, pickup, miss }
  const loadedAt = Date.now();
  let lastSync = 0, syncing = false;
  async function syncStatus(force){
    if(syncing || !/^\/order/.test(location.pathname) || !orderViewOn()) return;
    if(!force && Date.now() - lastSync < 15000) return;
    syncing = true; lastSync = Date.now();
    try{
      const list = [], now = new Set();
      for(const a of document.querySelectorAll("article.merchant, article.redesign-card")){
        const no = cardNo(a); if(!no) continue; now.add(no);
        const label = cardLabel(a), level = levelOf(label), pickup = /pick\s*-?\s*up|take\s*-?\s*out|포장|픽업/i.test(T(a.querySelector(".type-label")));
        seen[no] = { level, label, pickup, miss: 0 };
        list.push({ dk: no, level, label, pickup });
      }
      // 사라진 카드 (완료·취소) — 3번 연속(약 45초) 안 보이고, 필터 없이 전체 주문을 보고 있을 때만
      const gone = [];
      if(!filtered() && Date.now() - loadedAt > 30000){
        for(const no of Object.keys(seen)) if(!now.has(no) && (seen[no].miss = (seen[no].miss || 0) + 1) >= 3) gone.push(no);
      }
      if(gone.length && gone.length <= 2) for(const no of gone){ list.push({ dk: no, gone: true, pickup: seen[no].pickup }); delete seen[no]; }
      else if(gone.length > 2) for(const no of gone) seen[no].miss = 0;   // 한꺼번에 많이 사라지면 (로그아웃·새로고침 등) 무시
      if(!list.length) return;
      const r = await chrome.runtime.sendMessage({ type: "status", list }).catch(() => null);
      const todo = (r && r.ok && r.todo) || [];
      for(const t of todo) await pushStatus(t.dk, +t.target);
    }finally{ syncing = false; }
  }
  /* 배달K 상태 버튼을 눌러서 target 단계까지 (한 번에 한 단계, 확인 창은 '확인') */
  async function pushStatus(no, target){
    let level = null, err = null;
    for(let step = 0; step < 4; step++){
      const a = findCard(no);
      if(!a){ err = "card_not_found"; break; }
      level = levelOf(cardLabel(a));
      if(level == null){ err = "unknown_status:" + cardLabel(a); break; }
      if(level >= target || level === -1) break;
      if(level < 3){ err = "not_accepted"; break; }   // 배달K에서 접수 전 → 사람이
      const btn = a.querySelector("button.current-status");
      if(!btn || btn.disabled){ err = "button_disabled"; break; }
      btn.click();
      const al = await waitFor(() => document.querySelector("ion-alert:not(.overlay-hidden)"), 3000);
      if(al){
        const btns = [...al.querySelectorAll("button.alert-button")];
        const cancel = btns.find(b => b.classList.contains("alert-button-role-cancel") || /cancel|취소|닫기|close/i.test(T(b)));
        if(al.querySelector("input,textarea")){ if(cancel) cancel.click(); err = "needs_input"; break; }   // 입력이 필요한 창 → 사람이
        const ok = btns.filter(b => b !== cancel).pop();
        if(!ok){ if(cancel) cancel.click(); err = "no_confirm_button"; break; }
        ok.click();
      }
      const before = level;
      const changed = await waitFor(() => { const c = findCard(no); if(!c) return "gone"; const l = levelOf(cardLabel(c)); return l != null && l > before ? l : null; }, 10000);
      if(!changed){ err = "no_change"; break; }
      if(changed === "gone"){ level = 6; break; }
      level = changed;
      await wait(800);
    }
    if(!err && level != null && level < target) err = "not_reached";
    await chrome.runtime.sendMessage({ type: "pushResult", dk: no, ok: !err, level, error: err }).catch(() => {});
  }

  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 800); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, SCAN_MS);
  setInterval(() => syncStatus(false), 5000);
  setInterval(ping, PING_MS);
  setTimeout(() => { scan(); ping(); }, 3000);
})();
