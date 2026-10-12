/* =====================================================================
   주소 검색 — 빌딩·콘도·거리 이름으로 검색, 지도 핀, 현재 위치
   - Google 키가 있으면(관리자 ⚙ 설정 또는 config.js) Google 지도·주소 검색 사용
   - 없거나 Google 오류가 나면: Leaflet + OpenStreetMap / Photon (무료, 키 필요 없음)
   config.js 의 ADDRESS_SEARCH 를 false 로 바꾸면 주소를 직접 입력하는 칸만 보여줍니다.
   ===================================================================== */
(function(){
const { CFG, esc, L, T } = PT;
const ENABLED = CFG.ADDRESS_SEARCH !== false;
const CENTER = CFG.STORE_LOCATION || { lat: 14.5695, lng: 120.9890 };     // 가게 위치 (이 근처가 먼저 검색됨)
const PHOTON = (CFG.PHOTON_URL || "https://photon.komoot.io").replace(/\/+$/, "");
const PH_BBOX = "116.9,4.5,126.7,21.2";                                    // 필리핀 범위
const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
let leafletP = null, failed = false;

/* ---- Google (선택) ---- */
let GKEY = CFG.GOOGLE_MAPS_API_KEY || "", GMAPID = CFG.GOOGLE_MAP_ID || "", gP = null, gFailed = false;
const useGoogle = () => !!GKEY && !gFailed;
function setGoogle(key, mapId){ if(!CFG.GOOGLE_MAPS_API_KEY && key && !gP){ GKEY = String(key).trim(); GMAPID = mapId || GMAPID; } }
function loadGoogle(){
  if(!GKEY || gFailed) return Promise.reject(new Error("no google"));
  if(gP) return gP;
  window.gm_authFailure = () => { gFailed = true; console.warn("[빨통] Google 지도 키 오류 → OpenStreetMap 으로 전환 (키의 웹사이트 제한·API 사용 설정 확인)"); };
  ((g)=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?0:d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
    key: GKEY, v: "weekly", language: "en", region: "PH"
  });
  gP = google.maps.importLibrary("places").catch(e => { gFailed = true; throw e; });
  return gP;
}
let gToken = null;
async function googleSearch(text){
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await loadGoogle();
  if(!gToken) gToken = new AutocompleteSessionToken();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: text, sessionToken: gToken, includedRegionCodes: ["ph"], language: "en",
    locationBias: { center: CENTER, radius: 30000 }, origin: CENTER,
  });
  return suggestions.map(s => s.placePrediction).filter(Boolean).slice(0, 6).map(p => ({
    pred: p, main: p.mainText ? p.mainText.toString() : p.text.toString(), sub: p.secondaryText ? p.secondaryText.toString() : "" }));
}
async function googleResolve(item){
  const place = item.pred.toPlace();
  await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
  gToken = null;                                   // 검색 세션 종료 (요금 절약)
  const name = place.displayName || item.main, fa = place.formattedAddress || [item.main, item.sub].filter(Boolean).join(", ");
  return { full: name && !fa.toLowerCase().includes(String(name).toLowerCase()) ? `${name}, ${fa}` : fa,
           lat: place.location ? place.location.lat() : null, lng: place.location ? place.location.lng() : null };
}
async function googleReverse(lat, lng){
  await loadGoogle();
  const { Geocoder } = await google.maps.importLibrary("geocoding");
  const { results } = await new Geocoder().geocode({ location: { lat, lng } });
  return results && results[0] ? results[0].formatted_address : "";
}

/* ---- Leaflet 불러오기 (지도가 처음 필요할 때 한 번만) ---- */
function loadLeaflet(){
  if(window.L && window.L.map) return Promise.resolve(window.L);
  if(leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = LEAFLET + "leaflet.min.css";
    document.head.append(css);
    const s = document.createElement("script");
    s.src = LEAFLET + "leaflet.min.js";
    s.onload = () => res(window.L);
    s.onerror = () => { leafletP = null; rej(new Error("leaflet load failed")); };
    document.head.append(s);
  });
  return leafletP;
}

/* ---- Photon 결과 → { main, sub, full, lat, lng } ---- */
function fmt(f){
  const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const main = p.name || street || p.district || p.locality || p.city || "";
  const area = [p.district, p.locality, p.city || p.county, p.state]
    .filter((x, i, a) => x && x !== main && a.indexOf(x) === i);
  const sub = [street && street !== main ? street : "", ...area].filter(Boolean).join(", ");
  return { main, sub, full: [main, sub].filter(Boolean).join(", "), lat: c[1], lng: c[0] };
}
function dedupe(list){
  const seen = new Set();
  return list.filter(r => { const k = r.full.toLowerCase(); if(!r.main || r.lat == null || seen.has(k)) return false; seen.add(k); return true; });
}

async function photonSearch(text, signal){
  const u = `${PHOTON}/api/?q=${encodeURIComponent(text)}&lat=${CENTER.lat}&lon=${CENTER.lng}&limit=8&lang=en&bbox=${PH_BBOX}`;
  const r = await fetch(u, { signal });
  if(!r.ok) throw new Error("photon " + r.status);
  const j = await r.json();
  return dedupe((j.features || []).filter(f => !f.properties || !f.properties.countrycode || f.properties.countrycode === "PH").map(fmt)).slice(0, 6);
}
async function photonReverse(lat, lng){
  const r = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&lang=en&limit=1`);
  if(!r.ok) throw new Error("photon " + r.status);
  const j = await r.json();
  return j.features && j.features[0] ? fmt(j.features[0]).full : "";
}

/* 주소 입력 위젯: checkout 이 다시 그려져도 이 요소(지도 포함)는 유지됩니다.
   opts: { saved: [주소 문자열], pins: { 주소: {lat,lng} }, initial: "주소" } */
function createAddressWidget(opts = {}){
  const el = document.createElement("div");
  el.className = "addr-widget";
  const st = {
    mode: "search",          // search(검색 전) | picked(검색/현재위치로 선택) | saved(저장된 주소) | manual(직접 입력)
    base: "", detail: "", full: "", manual: "", lat: null, lng: null,
    reqId: 0, suggestions: [], ctrl: null,
  };
  const saved = opts.saved || [], pins = opts.pins || {};
  let map = null, lastKey = null;
  /* 핀(좌표)이나 주소가 바뀌면 알려줌 → 배달비 다시 계산 */
  function notify(){
    const v = currentPin(); const key = JSON.stringify(v);
    if(key !== lastKey){ lastKey = key; if(opts.onChange) try{ opts.onChange(v); }catch(e){} }
  }
  function currentPin(){
    const addr = st.mode === "picked" ? st.base : st.mode === "saved" ? st.full : st.mode === "manual" ? st.manual.trim() : "";
    return { lat: st.lat, lng: st.lng, addr };
  }

  if(!ENABLED) st.mode = "manual";
  if(opts.initial){
    if(saved.includes(opts.initial)) useSaved(opts.initial, true);
    else if(opts.initialPin){ pins[opts.initial] = opts.initialPin; useSaved(opts.initial, true); }   // 방금 주문한 주소 (핀 포함)
    else { st.mode = "manual"; st.manual = opts.initial; }
  }

  function useSaved(a, silent){
    st.mode = "saved"; st.full = a; const p = pins[a];
    st.lat = p ? p.lat : null; st.lng = p ? p.lng : null;
    if(!silent) render();
    notify();
  }

  function render(){
    if(map){ map.remove(); map = null; }
    const chips = saved.length ? `<div class="opt-choices" style="margin-bottom:8px">${saved.map((a,i) =>
      `<button type="button" class="opt-choice addr-chip ${st.mode === "saved" && st.full === a ? "sel" : ""}" data-saved="${i}">📍 ${esc(a)}</button>`).join("")}</div>` : "";
    let body = "";
    if(st.mode === "search"){
      body = `
        <div class="addr-search">
          <input type="search" class="addr-q" placeholder="${esc(T("빌딩·콘도·거리 이름으로 검색","Search building, condo or street"))}" autocomplete="off" enterkeyhint="search">
          <button type="button" class="sm-btn addr-gps" title="${esc(T("현재 위치","Use my location"))}">📍 ${esc(PT.LANG === "en" ? "Here" : "현위치")}</button>
        </div>
        <div class="addr-sugs"></div>
        <button type="button" class="link-btn addr-manual" style="margin-top:6px">${esc(T("검색이 안 되나요? 직접 입력하기","Can't find it? Type it manually"))}</button>`;
    } else if(st.mode === "picked"){
      body = `
        <div class="addr-picked"><span>📍 <b>${esc(st.base)}</b></span><button type="button" class="link-btn addr-change">${esc(T("변경","Change"))}</button></div>
        <div class="addr-map"></div>
        <p class="hint" style="margin:4px 0 8px">${L("핀을 끌거나 지도를 눌러 정확한 위치(건물 입구)로 옮겨주세요","Drag the pin or tap the map to set the exact spot (building entrance)")}</p>
        <label class="addr-lbl">${L("상세 주소","Unit / floor / landmark")} *</label>
        <input class="addr-detail" maxlength="120" placeholder="${esc(T("예: Unit 1203, 12층, 경비실 앞","e.g. Unit 1203, 12F, near the guardhouse"))}" value="${esc(st.detail)}">`;
    } else if(st.mode === "saved"){
      body = `
        <div class="addr-picked"><span>📍 <b>${esc(st.full)}</b></span><button type="button" class="link-btn addr-change">${esc(T("다른 주소","Other address"))}</button></div>
        ${st.lat != null ? `<div class="addr-map"></div>` : ""}`;
    } else {
      body = `
        <textarea class="addr-text" maxlength="300" placeholder="${esc(T("건물명, 호수, 거리, 바랑가이, 도시 (영문)","Building, unit, street, barangay, city"))}">${esc(st.manual)}</textarea>
        ${ENABLED ? `${st.pinMap || st.lat != null ? `<div class="addr-map"></div>
            <p class="hint" style="margin:4px 0 0">${st.lat != null ? L("📍 위치가 표시됐어요. 핀을 끌어서 조정할 수 있어요","📍 Location set — drag the pin to adjust") : L("지도를 눌러 배달 위치를 표시해주세요 (배달비 자동 계산)","Tap the map to mark your location (for the delivery fee)")}</p>`
            : `<button type="button" class="link-btn addr-pinmap" style="margin-top:6px">📍 ${esc(T("지도에서 위치 찍기 (배달비 자동 계산)","Mark location on map (auto delivery fee)"))}</button>`}
          <button type="button" class="link-btn addr-back" style="margin-top:6px">🔍 ${esc(T("주소 검색으로 찾기","Search address instead"))}</button>` : ""}`;
    }
    el.innerHTML = chips + body;
    bind();
    const mb = el.querySelector(".addr-map");
    if(mb) placeMap(mb);
    notify();
  }

  function bind(){
    const $ = q => el.querySelector(q);
    el.querySelectorAll("[data-saved]").forEach(b => b.onclick = () => useSaved(saved[+b.dataset.saved]));
    const q = $(".addr-q");
    if(q){
      let tmr = null;
      q.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => suggest(q.value), 350); });
      q.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); const f = el.querySelector("[data-sug]"); if(f) f.click(); else { clearTimeout(tmr); suggest(q.value); } } });
    }
    const gps = $(".addr-gps"); if(gps) gps.onclick = useMyLocation;
    const man = $(".addr-manual"); if(man) man.onclick = () => {
      const typed = (el.querySelector(".addr-q") || {}).value || "";
      st.mode = "manual"; st.lat = st.lng = null; if(!st.manual && typed.trim()) st.manual = typed.trim().replace(PT.EN_ADDR, "");
      render(); el.querySelector(".addr-text").focus();
    };
    const back = $(".addr-back"); if(back) back.onclick = () => { st.mode = "search"; render(); el.querySelector(".addr-q").focus(); };
    const ch = $(".addr-change"); if(ch) ch.onclick = () => { st.mode = "search"; st.lat = st.lng = null; render(); el.querySelector(".addr-q").focus(); };
    const det = $(".addr-detail"); if(det) det.addEventListener("input", () => { st.detail = det.value; });
    const tx = $(".addr-text"); if(tx) tx.addEventListener("input", () => { st.manual = tx.value; clearTimeout(st.nt); st.nt = setTimeout(notify, 600); });
    [q, det, tx].forEach(x => x && PT.englishOnly(x, PT.EN_ADDR));
    const pm = $(".addr-pinmap"); if(pm) pm.onclick = () => { st.pinMap = true; render(); };
  }

  async function suggest(text){
    const box = el.querySelector(".addr-sugs"); if(!box) return;
    text = text.trim();
    if(st.ctrl) st.ctrl.abort();
    if(text.length < 3){ box.innerHTML = ""; return; }
    const id = ++st.reqId;
    st.ctrl = typeof AbortController === "function" ? new AbortController() : null;
    box.innerHTML = `<p class="hint" style="margin:6px 10px">${L("검색 중…","Searching…")}</p>`;
    try{
      let list;
      if(useGoogle()){ try{ list = await googleSearch(text); }catch(e){ list = null; } }
      if(!list) list = await photonSearch(text, st.ctrl && st.ctrl.signal);
      if(id !== st.reqId) return;
      st.suggestions = list;
      box.innerHTML = list.length ? list.map((p, i) => `
        <button type="button" class="addr-sug" data-sug="${i}"><b>${esc(p.main)}</b>
          <small>${esc(p.sub)}</small></button>`).join("")
        : `<p class="hint" style="margin:6px 10px">${L("검색 결과가 없습니다. 다른 이름(영어)으로 검색하거나 아래 '직접 입력하기'를 눌러주세요","No results. Try another name or tap 'Type it manually' below")}</p>`;
      box.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => pick(st.suggestions[+b.dataset.sug]));
    }catch(e){
      if(id !== st.reqId || (e && e.name === "AbortError")) return;
      box.innerHTML = `<p class="hint" style="margin:6px 10px">${L("주소 검색이 잠시 안 돼요. 직접 입력해주세요","Address search is unavailable right now. Please type it manually")}</p>`;
    }
  }

  async function pick(p){
    if(!p) return;
    if(p.pred){
      try{ p = await googleResolve(p); }
      catch(e){ PT.toast(T("주소 정보를 불러오지 못했어요","Could not load that address")); return; }
    }
    st.base = p.full; st.lat = p.lat; st.lng = p.lng;
    st.mode = "picked"; st.detail = "";
    render();
    const d = el.querySelector(".addr-detail"); if(d) d.focus({ preventScroll: true });
  }

  function useMyLocation(){
    if(!navigator.geolocation){ PT.toast(T("이 기기에서는 위치를 사용할 수 없어요","Location not available")); return; }
    PT.toast(T("현재 위치 찾는 중…","Finding your location…"));
    navigator.geolocation.getCurrentPosition(async pos => {
      st.lat = pos.coords.latitude; st.lng = pos.coords.longitude;
      st.base = T("현재 위치","My location");
      try{ const a = useGoogle() ? await googleReverse(st.lat, st.lng).catch(() => photonReverse(st.lat, st.lng)) : await photonReverse(st.lat, st.lng); if(a) st.base = a; }
      catch(e){ /* 주소 변환 실패해도 핀은 사용 */ }
      st.mode = "picked"; st.detail = ""; render();
    }, () => PT.toast(T("위치 권한을 허용해주세요","Please allow location access"), 3000), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function placeMap(box){
    if(st.lat == null && st.mode !== "manual") return;
    if(useGoogle()){ try{ return await placeGoogleMap(box); }catch(e){ /* → OpenStreetMap */ } }
    let Lf;
    try{ Lf = await loadLeaflet(); }catch(e){ box.remove(); return; }
    if(!box.isConnected && !el.contains(box)) return;          // 그사이 다시 그려짐
    const editable = st.mode === "picked" || st.mode === "manual";
    const center = st.lat != null ? [st.lat, st.lng] : [CENTER.lat, CENTER.lng];
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    /* 휴대폰: 한 손가락은 화면 스크롤, 두 손가락으로 확대/이동. 핀은 끌거나 지도를 눌러 옮김 */
    map = Lf.map(box, { center, zoom: st.lat != null ? 17 : 14, zoomControl: true, attributionControl: true,
      dragging: !touch, scrollWheelZoom: false, touchZoom: true, doubleClickZoom: true, tap: false });
    Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    const icon = Lf.divIcon({ className: "addr-pin", html: "<span>📍</span>", iconSize: [36, 36], iconAnchor: [18, 34] });
    let marker = st.lat != null ? Lf.marker([st.lat, st.lng], { icon, draggable: editable, autoPan: true }).addTo(map) : null;
    const hook = m => m.on("dragend", () => { const p = m.getLatLng(); st.lat = p.lat; st.lng = p.lng; notify(); });
    if(marker && editable) hook(marker);
    if(editable){
      map.on("click", e => {
        const first = st.lat == null;
        if(!marker){ marker = Lf.marker(e.latlng, { icon, draggable: true, autoPan: true }).addTo(map); hook(marker); }
        else marker.setLatLng(e.latlng);
        st.lat = e.latlng.lat; st.lng = e.latlng.lng; notify();
        if(first && st.mode === "manual"){ const h = box.nextElementSibling; if(h) h.innerHTML = L("📍 위치가 표시됐어요. 핀을 끌어서 조정할 수 있어요","📍 Location set — drag the pin to adjust"); }
      });
    }
    /* 위젯이 화면에 붙은 뒤 크기 다시 계산 */
    setTimeout(() => map && map.invalidateSize(), 60);
    setTimeout(() => map && map.invalidateSize(), 400);
  }

  async function placeGoogleMap(box){
    await loadGoogle();
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    if(!box.isConnected && !el.contains(box)) return;
    const editable = st.mode === "picked" || st.mode === "manual";
    const pos = st.lat != null ? { lat: st.lat, lng: st.lng } : { lat: CENTER.lat, lng: CENTER.lng };
    const gm = new Map(box, { center: pos, zoom: st.lat != null ? 18 : 14, mapId: GMAPID || "DEMO_MAP_ID",
      disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false });
    map = { remove(){ box.innerHTML = ""; } };
    let marker = st.lat != null ? new AdvancedMarkerElement({ map: gm, position: pos, gmpDraggable: editable }) : null;
    const hook = m => m.addListener("dragend", () => { const p = m.position; st.lat = typeof p.lat === "function" ? p.lat() : p.lat; st.lng = typeof p.lng === "function" ? p.lng() : p.lng; notify(); });
    if(marker && editable) hook(marker);
    if(editable) gm.addListener("click", e => {
      const first = st.lat == null;
      if(!marker){ marker = new AdvancedMarkerElement({ map: gm, position: e.latLng, gmpDraggable: true }); hook(marker); }
      else marker.position = e.latLng;
      st.lat = e.latLng.lat(); st.lng = e.latLng.lng(); notify();
      if(first && st.mode === "manual"){ const h = box.nextElementSibling; if(h) h.innerHTML = L("📍 위치가 표시됐어요. 핀을 끌어서 조정할 수 있어요","📍 Location set — drag the pin to adjust"); }
    });
  }

  render();
  return {
    el,
    /* 주문에 쓸 값: { addr, lat, lng } 또는 { error } */
    value(){
      if(st.mode === "picked"){
        if(!st.detail.trim()) return { error: T("상세 주소(호수·층·랜드마크)를 입력해주세요","Please add unit / floor / landmark"), focus: ".addr-detail" };
        return { addr: `${st.detail.trim()}, ${st.base}`, lat: st.lat, lng: st.lng };
      }
      if(st.mode === "saved") return { addr: st.full, lat: st.lat, lng: st.lng };
      if(st.mode === "manual"){
        if(st.manual.trim().length < 3) return { error: T("주소를 입력해주세요","Please enter your address"), focus: ".addr-text" };
        return { addr: st.manual.trim(), lat: st.lat, lng: st.lng };
      }
      return { error: T("배달 주소를 검색해서 선택하거나 '직접 입력하기'를 눌러주세요","Please search and select your address, or tap 'Type it manually'"), focus: ".addr-q" };
    },
    focus(sel){ const x = el.querySelector(sel); if(x) x.focus(); },
    pin: currentPin,
  };
}

window.PTAddress = { createAddressWidget, loadLeaflet, setGoogle, get google(){ return useGoogle(); }, get enabled(){ return ENABLED && !failed; } };
})();
