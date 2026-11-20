// 빨통 DK 연결 — 보내기 담당 (content.js가 읽은 주문을 빨통 주문 앱 dk_inbox 로)
importScripts("config.js");

async function getKey(){
  const { key } = await chrome.storage.local.get("key");
  return (key || PT_DK.DEFAULT_KEY || "").trim();
}
async function rpc(fn, body){
  const r = await fetch(`${PT_DK.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PT_DK.SUPABASE_ANON_KEY, Authorization: `Bearer ${PT_DK.SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body)
  });
  const t = await r.text(); let j = null; try{ j = JSON.parse(t); }catch(e){}
  if(!r.ok) throw new Error((j && (j.message || j.hint)) || t || r.status);
  return j;
}
async function log(patch){
  const { stat = {} } = await chrome.storage.local.get("stat");
  await chrome.storage.local.set({ stat: { ...stat, ...patch } });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    const key = await getKey();
    if(!key) throw new Error("no_key");
    if(msg.type === "order"){
      const j = await rpc("dk_inbox_add", { p_key: key, p_title: msg.title, p_text: msg.text, p_app: "deliveryk-web" });
      const { stat = {} } = await chrome.storage.local.get("stat");
      await log({ lastSent: Date.now(), lastNo: msg.no, count: (stat.count || 0) + (j && j.dup ? 0 : 1), lastError: "" });
      return { ok: true, dup: !!(j && j.dup) };
    }
    if(msg.type === "ping"){
      await rpc("dk_inbox_ping", { p_key: key, p_info: msg.info || "" });
      await log({ lastPing: Date.now(), lastError: "" });
      return { ok: true };
    }
    return { ok: false };
  })().then(reply, async e => {
    const m = String(e && e.message || e);
    await log({ lastError: m, lastErrorAt: Date.now() });
    reply({ ok: false, error: m });
  });
  return true;   // 비동기 응답
});
