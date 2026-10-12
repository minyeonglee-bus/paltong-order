/* =====================================================================
   빨통 구글 지도 짧은 링크 풀기 (Vercel 서버 함수 · 외부 패키지 없음)
   maps.app.goo.gl/xxxx 같은 짧은 링크는 브라우저에서 바로 좌표를 알 수 없어서
   여기서 원래 주소로 따라가 좌표(또는 장소 이름)를 꺼내 돌려줍니다.
   GET /api/maplink?u=<링크>  →  { url, lat, lng, q }
   ===================================================================== */
const OK_HOST = /(^|\.)(goo\.gl|g\.co|google\.[a-z.]+|googleusercontent\.com|app\.goo\.gl|maps\.apple\.com|maps\.apple|waze\.com|kko\.to|map\.kakao\.com|place\.map\.kakao\.com)$/i;

function coords(s){
  s = decodeURIComponent(String(s || "").replace(/\+/g, " "));
  const pick = (a, b) => { const lat = +a, lng = +b; return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? { lat, lng } : null; };
  let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);                 // 장소 핀 (가장 정확)
  if(m) return pick(m[1], m[2]);
  m = s.match(/[?&](?:q|query|ll|sll|coordinate|destination|daddr|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if(m) return pick(m[1], m[2]);
  m = s.match(/\/(?:place|search|dir\/[^/]*)\/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if(m) return pick(m[1], m[2]);
  m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);                          // 지도 화면 중심
  if(m) return pick(m[1], m[2]);
  return null;
}
function placeName(s){
  try{
    const u = new URL(s);
    const q = u.searchParams.get("q") || u.searchParams.get("query") || u.searchParams.get("destination") || u.searchParams.get("address") || u.searchParams.get("name");
    if(q && !/^-?\d+\.\d+\s*,/.test(q)) return q;
    const m = u.pathname.match(/\/(?:place|search)\/([^/@]+)/);
    if(m) return decodeURIComponent(m[1].replace(/\+/g, " "));
  }catch(e){}
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=86400");
  let url = String((req.query && req.query.u) || "").trim();
  try{ new URL(url); }catch(e){ res.status(400).json({ error: "bad url" }); return; }
  try{
    for(let i = 0; i < 6; i++){
      const h = new URL(url);
      if(!/^https?:$/.test(h.protocol) || !OK_HOST.test(h.hostname)) break;   // 구글 링크만 따라감
      if(coords(url)) break;
      const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "Accept-Language": "en" } });
      const loc = r.headers.get("location");
      if(r.status >= 300 && r.status < 400 && loc){ url = new URL(loc, url).toString(); continue; }
      if(r.ok){   // 리다이렉트 없이 페이지가 오면 본문에서 좌표 찾기
        const body = (await r.text()).slice(0, 400000);
        const c = coords(body) || (() => { const m = body.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/); return m ? { lat: +m[1], lng: +m[2] } : null; })();
        if(c){ res.status(200).json({ url, ...c, q: placeName(url) }); return; }
        const m = body.match(/<meta[^>]+content="https:\/\/[^"]*?(?:center|markers)=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
        if(m){ res.status(200).json({ url, lat: +m[1], lng: +m[2], q: placeName(url) }); return; }
      }
      break;
    }
    const c = coords(url);
    res.status(200).json({ url, lat: c ? c.lat : null, lng: c ? c.lng : null, q: placeName(url) });
  }catch(e){
    res.status(200).json({ url, lat: null, lng: null, q: placeName(url), error: String(e.message || e) });
  }
};
