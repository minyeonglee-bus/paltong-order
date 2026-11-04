// 빨통 웹주문 → 카카오톡 알림
// 사장님 카톡 계정 → 매장 공용 카톡(주문톡)으로 "친구에게 보내기", 미처리 시 사장님 "나와의 채팅"에도 알림.
// 설정 페이지: https://paltong-order.com/kakao-setup  (DB: kakao_alert_cfg, kakao_alert_log)
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://paltong-order.com";
const ADMIN_URL = SITE + "/admin";
const REDIRECT = SITE + "/kakao-setup";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Cfg = Record<string, any>;
const getCfg = async (): Promise<Cfg> => (await sb.from("kakao_alert_cfg").select("*").eq("id", 1).single()).data!;
const setCfg = (p: Cfg) => sb.from("kakao_alert_cfg").update({ ...p, updated_at: new Date().toISOString() }).eq("id", 1);
const log = (r: Cfg) => sb.from("kakao_alert_log").insert(r);
const inSec = (s?: number) => (s ? new Date(Date.now() + s * 1000).toISOString() : null);

async function kauth(params: Record<string, string>) {
  const r = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`token ${r.status}: ${d.error_description || d.error || JSON.stringify(d)}`);
  return d;
}

async function accessToken(c: Cfg): Promise<string> {
  if (c.access_token && c.access_exp && new Date(c.access_exp).getTime() - Date.now() > 5 * 60_000) return c.access_token;
  if (!c.refresh_token) throw new Error("사장님 카카오 로그인 필요");
  const p: Record<string, string> = { grant_type: "refresh_token", client_id: c.rest_key, refresh_token: c.refresh_token };
  if (c.client_secret) p.client_secret = c.client_secret;
  const d = await kauth(p);
  const up: Cfg = { access_token: d.access_token, access_exp: inSec(d.expires_in) };
  if (d.refresh_token) { up.refresh_token = d.refresh_token; up.refresh_exp = inSec(d.refresh_token_expires_in); }
  await setCfg(up);
  return d.access_token;
}

async function kapi(token: string, path: string, form?: Record<string, string>) {
  const r = await fetch("https://kapi.kakao.com" + path, {
    method: form ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(form ? { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status}: ${d.msg || JSON.stringify(d)}`);
  return d;
}

const PAYROLL_URL = "https://paltong-payroll.vercel.app";
const tpl = (text: string, url = ADMIN_URL, button = "주문 확인 Open orders") => JSON.stringify({
  object_type: "text",
  text: text.slice(0, 200),
  link: { web_url: url, mobile_web_url: url },
  button_title: button,
});
const sendFriend = async (t: string, uuid: string, text: string) => {
  const d = await kapi(t, "/v1/api/talk/friends/message/default/send", { receiver_uuids: JSON.stringify([uuid]), template_object: tpl(text) });
  if (d.failure_info?.length) throw new Error("친구 발송 실패: " + JSON.stringify(d.failure_info));
};
const sendMemo = (t: string, text: string, url?: string, button?: string) =>
  kapi(t, "/v2/api/talk/memo/default/send", { template_object: tpl(text, url, button) });

const peso = (n: number | null) => "₱" + Number(n || 0).toLocaleString("en-US");
function orderLine(o: Cfg) {
  const type = o.order_type === "pickup" ? "Pickup 픽업" : "Delivery 배달";
  const when = o.scheduled_at
    ? "\n⏰ " + new Date(o.scheduled_at).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    : "";
  return `#${o.order_no} ${o.cust_name || ""} · ${peso(o.total ?? o.subtotal)} · ${type}${when}`;
}

async function alert(orderId: string, kind: string) {
  const c = await getCfg();
  const { data: o } = await sb.from("orders").select("id,order_no,status,cust_name,total,subtotal,order_type,scheduled_at,created_at").eq("id", orderId).single();
  if (!o || !["new", "receipt_submitted"].includes(o.status)) return { skipped: "already handled" };
  const isReceipt = o.status === "receipt_submitted";
  const head = kind === "remind"
    ? `⚠️ NOT ACCEPTED YET (${c.remind_min} min)\n아직 처리 안 됨!`
    : isReceipt ? "🧾 PAYMENT RECEIPT — check & start\n영수증 도착 — 확인해주세요" : "🔔 NEW WEB ORDER — accept now\n새 웹주문 — 바로 수락해주세요";
  const text = `${head}\n${orderLine(o)}\n👉 ${ADMIN_URL}`;
  const base = { order_id: o.id, order_no: o.order_no, status: o.status, kind: kind === "remind" ? "remind_sent" : "new" };
  try {
    const t = await accessToken(c);
    await sendFriend(t, c.receiver_uuid, text);
    if (kind === "remind") {
      const mins = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
      await sendMemo(t, `🚨 [사장님] 웹주문 ${mins}분째 미처리\n${orderLine(o)}\n주문톡(${c.receiver_name || "매장"})에 재알림 보냈어요.`);
    }
    await log({ ...base, ok: true });
    return { ok: true };
  } catch (e) {
    const msg = String((e as Error).message || e);
    await log({ ...base, ok: false, error: msg });
    // 매장으로 못 보냈으면 사장님 나와의 채팅으로라도
    try { const t = await accessToken(c); await sendMemo(t, `❗카톡 주문알림 실패 — 관리자 화면 확인해주세요\n${orderLine(o)}\n(${msg.slice(0, 80)})`); } catch (_) { /* 로그인 만료 등 */ }
    return { ok: false, error: msg };
  }
}

async function dailyCheck() {
  const c = await getCfg();
  if (!c.refresh_exp) return { skipped: true };
  const days = Math.floor((new Date(c.refresh_exp).getTime() - Date.now()) / 86400000);
  const today = new Date().toISOString().slice(0, 10);
  if (days > 7 || c.last_expiry_warn === today) return { days };
  try {
    const t = await accessToken(c); // 갱신되면 만료일도 늘어남
    const c2 = await getCfg();
    const d2 = Math.floor((new Date(c2.refresh_exp).getTime() - Date.now()) / 86400000);
    if (d2 > 7) return { days: d2, renewed: true };
    await sendMemo(t, `🔑 카톡 주문알림 로그인이 ${d2}일 뒤 만료돼요.\n${REDIRECT} 에서 "사장님 카카오 로그인"을 다시 눌러주세요.`);
    await setCfg({ last_expiry_warn: today });
  } catch (_) { /* 이미 만료 */ }
  return { days };
}

const status = (c: Cfg) => ({
  rest_key: c.rest_key || null, has_secret: !!c.client_secret, owner: c.owner_name || null, owner_login: !!c.refresh_token, refresh_exp: c.refresh_exp,
  receiver: c.receiver_name || null, store: c.store_name || null, enabled: c.enabled, remind_min: c.remind_min, redirect_uri: REDIRECT,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let b: Cfg = {};
  try { b = await req.json(); } catch (_) { return json({ error: "bad request" }, 400); }
  const c = await getCfg();

  // DB(트리거·크론)에서 오는 호출
  if (b.action === "alert" || b.action === "check") {
    if (b.key !== c.internal_key) return json({ error: "forbidden" }, 403);
    return json(b.action === "check" ? await dailyCheck() : await alert(b.order_id, b.kind));
  }

  // 급여 앱(다른 Supabase 프로젝트)에서 오는 사장님 알림 → 나와의 채팅
  if (b.action === "memo") {
    if (!c.notify_key || b.key !== c.notify_key) return json({ error: "forbidden" }, 403);
    if (!c.refresh_token) return json({ ok: false, error: "카카오 로그인 전" });
    try {
      const t = await accessToken(c);
      await sendMemo(t, String(b.text || ""), PAYROLL_URL, "급여 앱 열기");
      return json({ ok: true });
    } catch (e) { return json({ ok: false, error: String((e as Error).message || e) }); }
  }

  // 설정 페이지 호출 (설정 키 필요)
  if (b.key !== c.setup_key) return json({ error: "설정 링크가 맞지 않아요 (key)" }, 403);
  try {
    switch (b.action) {
      case "status":
        return json(status(c));
      case "save_keys":
        await setCfg({ rest_key: String(b.rest_key || "").trim(), client_secret: String(b.client_secret || "").trim() || null });
        return json(status(await getCfg()));
      case "exchange": { // 카카오 로그인 후 돌아온 code
        const p: Record<string, string> = { grant_type: "authorization_code", client_id: c.rest_key, redirect_uri: REDIRECT, code: b.code };
        if (c.client_secret) p.client_secret = c.client_secret;
        const d = await kauth(p);
        const me = await kapi(d.access_token, "/v2/user/me");
        const name = me.kakao_account?.profile?.nickname || me.properties?.nickname || String(me.id);
        if (b.who === "store") { await setCfg({ store_name: name }); return json({ ...status(await getCfg()), who: "store", name }); }
        await setCfg({ access_token: d.access_token, access_exp: inSec(d.expires_in), refresh_token: d.refresh_token, refresh_exp: inSec(d.refresh_token_expires_in), owner_name: name });
        return json({ ...status(await getCfg()), who: "owner", name });
      }
      case "friends": {
        const t = await accessToken(c);
        const d = await kapi(t, "/v1/api/talk/friends?limit=100");
        return json({ friends: (d.elements || []).map((f: Cfg) => ({ uuid: f.uuid, name: f.profile_nickname })) });
      }
      case "pick":
        await setCfg({ receiver_uuid: b.uuid, receiver_name: b.name });
        return json(status(await getCfg()));
      case "settings":
        await setCfg({ enabled: !!b.enabled, remind_min: Math.max(1, Math.min(30, Number(b.remind_min) || 3)) });
        return json(status(await getCfg()));
      case "test": {
        const t = await accessToken(c);
        await sendFriend(t, c.receiver_uuid, `✅ TEST — order alerts will come here\n테스트 — 웹주문 알림이 여기로 와요\n👉 ${ADMIN_URL}`);
        await sendMemo(t, "✅ [사장님] 테스트 — 미처리 주문 경고는 여기(나와의 채팅)로 와요.");
        return json({ ok: true });
      }
      case "log": {
        const { data } = await sb.from("kakao_alert_log").select("order_no,status,kind,ok,error,created_at").or("error.is.null,error.neq.queued").order("created_at", { ascending: false }).limit(15);
        return json({ log: data });
      }
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
