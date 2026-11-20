/* =====================================================================
   손님 앱 manifest (홈 화면에 추가) — 연동 코드를 시작 주소에 넣어 줌
   아이폰은 Safari 와 홈 화면 앱의 저장소가 따로라서, 앱을 처음 열 때
   /?from=app&link=코드 로 열리게 해서 Safari 쪽 주문 내역·회원을 이어 줌.
   GET /api/manifest?l=ABCDE12345  (코드 없으면 기본 manifest 와 같음)
   ===================================================================== */
const BASE = {
  name: "빨통 PAL TONG",
  short_name: "빨통 PAL TONG",
  description: "빨통 PAL TONG 배달·픽업 주문 (Malate, Manila)",
  id: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#faf3ea",
  theme_color: "#d33d2a",
  lang: "ko",
  icons: [
    { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

module.exports = (req, res) => {
  const raw = String((req.query && req.query.l) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = /^[A-Z0-9]{10}$/.test(raw) ? raw : "";
  const body = { ...BASE, start_url: code ? `/?from=app&link=${code}` : "/?from=app" };
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(JSON.stringify(body));
};
