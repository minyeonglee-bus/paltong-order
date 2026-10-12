/* =====================================================================
   빨통 웹 푸시 전송 (Vercel 서버 함수 · 외부 패키지 없음)
   Supabase 가 새 주문·추가 주문·메시지 때 이 주소(/api/push)를 불러서 등록된 휴대폰에 알림을 보냅니다.
   Web Push 표준: VAPID(RFC 8292) + aes128gcm 암호화(RFC 8291)
   ===================================================================== */
const crypto = require("crypto");
const RELAY_SECRET = "Jf2rQz2SvHNB1oW5sRTS3keM8sTXopHo";   // Supabase(21단계 SQL)와 같은 값 — 바꾸면 양쪽 다 바꿔야 함

const b64u = buf => Buffer.from(buf).toString("base64url");
const unb64u = s => Buffer.from(String(s).replace(/=+$/, ""), "base64url");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function vapidHeader(endpoint, vapid){
  const pub = unb64u(vapid.public), d = unb64u(vapid.private);
  const priv = Buffer.concat([Buffer.alloc(Math.max(0, 32 - d.length)), d]);
  const key = crypto.createPrivateKey({ format:"jwk", key:{ kty:"EC", crv:"P-256", d:b64u(priv), x:b64u(pub.subarray(1, 33)), y:b64u(pub.subarray(33, 65)) } });
  const head = b64u(JSON.stringify({ typ:"JWT", alg:"ES256" }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject || "mailto:admin@paltong.app" }));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + claims), { key, dsaEncoding:"ieee-p1363" });
  return "vapid t=" + head + "." + claims + "." + b64u(sig) + ", k=" + vapid.public;
}

function encrypt(sub, payload){
  const uaPub = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPub);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}

async function sendOne(sub, payload, vapid){
  const r = await fetch(sub.endpoint, { method:"POST", body: encrypt(sub, payload), headers:{
    "Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream", TTL:"86400", Urgency:"high",
    Authorization: vapidHeader(sub.endpoint, vapid) } });
  return { endpoint: sub.endpoint, status: r.status, text: r.ok ? "" : (await r.text()).slice(0, 200) };
}

module.exports = async (req, res) => {
  if(req.method === "GET") return res.status(200).json({ ok:true, service:"paltong-push" });   // 연결 확인용
  if(req.method !== "POST") return res.status(405).end();
  let body = req.body;
  try{ if(typeof body === "string") body = JSON.parse(body); }catch(e){ return res.status(400).json({ error:"bad json" }); }
  if(!body || body.secret !== RELAY_SECRET) return res.status(401).json({ error:"unauthorized" });
  const subs = Array.isArray(body.subs) ? body.subs.slice(0, 50) : [];
  const payload = JSON.stringify(body.payload || {});
  const results = await Promise.all(subs.map(s => sendOne(s, payload, body.vapid).catch(e => ({ endpoint: s.endpoint, status: 0, text: String(e.message || e) }))));
  res.status(200).json({ results });
};
module.exports._test = { encrypt, vapidHeader };
