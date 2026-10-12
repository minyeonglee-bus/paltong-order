/* 빨통 관리자 푸시 알림 (사이트를 닫아도 휴대폰에 알림) */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
/* 손님 사이트 "홈 화면에 추가(앱 설치)" 조건용 — 아무것도 가로채지 않음 */
self.addEventListener("fetch", () => {});
self.addEventListener("push", e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = { body: e.data ? e.data.text() : "" }; }
  const kind = d.kind || "order";
  e.waitUntil(self.registration.showNotification(d.title || "빨통 PAL TONG", {
    body: d.body || "", tag: d.tag || kind, renotify: true,
    requireInteraction: kind !== "msg",                    // 주문은 눌러서 확인할 때까지 남아 있음
    icon: "/admin-icon-192.png", badge: "/admin-icon-192.png",
    vibrate: kind === "msg" ? [200, 100, 200] : [600, 200, 600, 200, 600, 200, 600],
    data: { url: d.url || "/admin" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/admin";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for(const c of list){ if(c.url.includes("/admin")){ c.focus(); return; } }
    return self.clients.openWindow(url);
  }));
});
