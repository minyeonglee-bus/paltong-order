/* =====================================================================
   빨통 PAL TONG 주문 사이트 - 설정 파일
   가게 정보·결제 계좌·Supabase 연결 정보는 이 파일만 수정하면 됩니다.
   ===================================================================== */
window.PALTONG_CONFIG = {
  /* ---- Supabase 연결 (설치가이드 3단계) ----
     비워 두면 '데모 모드'로 동작합니다. (같은 브라우저 안에서만 주문이 오가는 연습용) */
  SUPABASE_URL: "https://yzdhcumibflxtqkqvbul.supabase.co",        // 예: "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6ZGhjdW1pYmZseHRxa3F2YnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI3NDgsImV4cCI6MjEwNTgxODc0OH0.qSEMyhZ9HWEpaGXEupQzYkHxIvUC5Y1yhr5T2N-VD7w",   // 예: "eyJhbGciOi..." (Project Settings → API → anon public key)

  /* ---- 주소 검색 (OpenStreetMap, 무료·키 필요 없음) ----
     false 로 바꾸면 검색·지도 없이 주소를 직접 입력하는 칸만 보여줍니다. */
  ADDRESS_SEARCH: true,
  STORE_LOCATION: { lat: 14.5695, lng: 120.9890 },    // 가게 위치 (이 근처 주소가 먼저 검색됨) — Malate 기준

  /* ---- 가게 정보 ---- */
  STORE_NAME_KO: "빨통",
  STORE_NAME_EN: "PAL TONG",
  KAKAO_ID: "paltongmalate",
  STORE_PHONE: "09951550156",          // 예: "0917 000 0000" (영수증 하단에 표시, 비우면 생략)

  /* ---- 기본 언어 ----  "both"(한/영 병기) | "ko" | "en" */
  DEFAULT_LANG: "both",

  /* ---- 결제 수단 ----
     cash 외의 결제수단은 '영수증 첨부 → 관리자 확인' 후에 주문이 시작됩니다.
     qr 이미지는 images 폴더에 같은 파일명으로 넣어주세요. (대소문자 구분) */
  PAYMENTS: {
    cash:  { label: "만나서 현금결제", labelEn: "Cash on Delivery" },
    gcash: { label: "GCash",     labelEn: "GCash",     accountName: "M****G L.", accountNo: "0945 427 8255",    qr: "images/GCASH.JPG" },
    maya:  { label: "Maya",      labelEn: "Maya",      accountName: "M****G L",  accountNo: "0960 324 9922",    qr: "images/MAYA.PNG" },
    bank:  { label: "Metrobank", labelEn: "Metrobank", accountName: "M****G L",  accountNo: "292-392-357-0137", qr: "images/METROBANK.JPG" },
  },

  /* ---- 영수증 프린터 ----  58 또는 80 (mm) */
  RECEIPT_WIDTH_MM: 58,
  /* 결제 확인(주문 시작) 버튼을 누르면 영수증 인쇄창을 자동으로 띄울지 */
  AUTO_PRINT_ON_CONFIRM: true,
  /* 영수증 몇 장 인쇄할지 (예: 2 = 주방용 + 배달용) */
  PRINT_COPIES: 1,

  /* ---- 관리자 배달비 빠른 선택 버튼 (₱) ---- */
  DELIVERY_FEE_PRESETS: [0, 50, 80, 100, 150, 200],
  ETA_PRESETS: [20, 30, 40, 50, 60],

  /* ---- Paltong Cash Book (Claude 자금일보) 주소 ----
     관리자 주문 화면 '📒 캐시북으로' → 복사 후 이 주소를 열어 붙여넣기. 비우면 복사만 됩니다. */
  CASHBOOK_URL: "https://paltong-cashbook.vercel.app/",
};
