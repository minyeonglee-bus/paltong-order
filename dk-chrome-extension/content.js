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
    const loggedIn = /store orders|my orders/i.test(document.body.innerText || "");
    if(!loggedIn) return;   // 로그인 안 돼 있으면 "연결 끊김"으로 보이게 ping 안 보냄
    const n = document.querySelectorAll("article.merchant, article.redesign-card").length;
    chrome.runtime.sendMessage({ type: "ping", info: `주문 화면 열림 · 지금 주문 ${n}건` }).catch(() => {});
  }

  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 800); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, SCAN_MS);
  setInterval(ping, PING_MS);
  setTimeout(() => { scan(); ping(); }, 3000);
})();
