/* =====================================================================
   관리자 화면 한/영 전환 (🌐 버튼)
   - 화면에 보이는 한글 문구를 아래 사전대로 영어로 바꿉니다.
   - 손님이 쓴 글(요청사항·채팅·이름·주소)은 data-raw 로 표시돼 있어 바꾸지 않습니다.
   - 문구를 고치거나 추가하려면 아래 DICT 에 ["한글", "English"] 한 줄을 넣으세요.
   ===================================================================== */
(function(){
const DICT = [
  // ---- 로그인 · 상단 ----
  ["빨통 관리자 로그인", "PAL TONG Admin sign-in"], ["빨통 관리자 · Admin", "PAL TONG Admin"], ["빨통 관리자", "PAL TONG Admin"],
  ["아이디", "ID"], ["비밀번호", "Password"], ["로그인 실패:", "Sign-in failed:"], ["로그인", "Sign in"], ["로그아웃", "Log out"],
  ["데모 모드: 아무 값이나 입력해도 로그인됩니다.", "Demo mode: any ID/password works."],
  ["주문 관리 · Orders", "Orders"], ["🔔 알림 켜기", "🔔 Turn on alerts"], ["🔔 알림 켜짐", "🔔 Alerts on"], ["🔔 알림 ON", "🔔 Alerts ON"], ["🔕 알림 OFF", "🔕 Alerts OFF"],
  ["🔔 알림 소리를 켜려면 화면을 아무 곳이나 한 번 눌러주세요", "🔔 Tap anywhere once to turn on alert sounds"], ["알림 소리를 껐습니다", "Alert sound off"],
  ["🖨 프린터 연결", "🖨 Connect printer"], ["🖨 프린터", "🖨 Printer"], ["🖨 인쇄창", "🖨 Print dialog"], ["💬 채팅", "💬 Chat"], ["📸 리뷰 인증", "📸 Reviews"],
  ["👥 회원·쿠폰", "👥 Members·Coupons"], ["🙋 직원", "🙋 Staff"], ["🍽 다이닝", "🍽 Dining"], ["블루투스 바로 연결 (아이폰은 Bluefy)", "Bluetooth direct (iPhone: Bluefy app)"], ["▸기기", "▸Device"], ["▸손님·주문", "▸Customers"], ["▸직원", "▸Staff"], ["▸가게", "▸Store"], ["🛵 기사", "🛵 Riders"], ["품절 관리", "Sold out"], ["🍽 메뉴 관리", "🍽 Menu"],
  ["품절 · 할인가 · 카테고리 이동을 여기서 바꾸면 손님 화면에 바로 반영됩니다. 할인가를 비우고 '할인 적용'을 누르면 할인이 없어집니다.", "Changes to sold out, sale price and category show on the customer site right away. Clear the sale price and press Apply to remove a sale."], ["⚙ 설정", "⚙ Settings"], ["← 주문 목록", "← Orders"],
  ["데모 모드 — config.js 에 Supabase 정보를 넣으면 실제 운영 모드로 바뀝니다. 같은 브라우저 다른 탭에서 index.html 로 주문해보세요.",
   "Demo mode — add your Supabase details to config.js to go live. Try ordering from index.html in another tab of this browser."],
  ["왼쪽에서 대화를 고르세요", "Pick a conversation on the left"],
  ["메뉴를 눌러 품절 / 판매중을 전환하세요. 손님 화면에 바로 반영됩니다.", "Tap a menu item to switch sold out / available. Customers see it right away."],
  ["테스트: 새 주문 → 추가 주문 → 메시지 소리", "Test: new order → add-on → message sounds"],
  ["🔔 새 주문", "🔔 New order"], ["➕ 추가 주문", "➕ Add-on order"], ["💬 새 메시지", "💬 New message"], ["새 메시지", "New message"],
  ["주문 불러오기 실패 — 인터넷 연결 확인", "Couldn't load orders — check the internet connection"],

  // ---- 필터 · 상태 ----
  ["처리 필요", "Needs action"], ["접수됨", "Accepted"], ["조리·입금 대기", "Cooking·awaiting payment"], ["조리·배달 중", "Cooking·delivering"],
  ["완료·취소", "Done·cancelled"], ["전체", "All"], ["해당하는 주문이 없습니다", "No orders here"],
  ["주문 확인 중", "Checking order"], ["주문 접수", "Order accepted"], ["조리 중·입금 대기", "Cooking · awaiting payment"], ["결제 확인 중", "Verifying payment"],
  ["조리 중", "Preparing"], ["배달 중", "Out for delivery"], ["배달 완료", "Delivered"], ["배달 완료된 주문은 취소할 수 없어요", "Delivered orders can't be cancelled"], ["취소됨", "Cancelled"], ["픽업 대기", "Waiting for pickup"],
  ["만나서 현금결제", "Cash on delivery"], ["매장에서 현금결제", "Cash at store"],

  // ---- 주문 카드 ----
  ["👤 회원", "👤 Member"], ["비회원", "Guest"], ["🏃 픽업", "🏃 Pickup"], ["매장 픽업", "Store pickup"], ["🗺 핀 위치", "🗺 Pin location"], ["링크 복사", "Copy link"],
  ["원문:", "Original:"], ["(번역 중…)", "(translating…)"], ["메뉴 합계", "Menu subtotal"], ["🎟 쿠폰 할인", "🎟 Coupon discount"],
  ["매장 할인", "Store discount"], ["⚠ 가격 확인 필요", "⚠ Check prices"], ["🖨 다시 인쇄", "🖨 Reprint"], ["➕추가", "➕Added"],
  ["➕ 추가 메뉴 결제", "➕ Add-on payment"], ["추가 결제 영수증", "Add-on receipt"], ["✔ 추가 결제 확인", "✔ Confirm add-on payment"],
  ["손님이 추가 금액을 송금하고 영수증을 올리면 여기에 표시됩니다.", "It shows here when the customer sends the extra amount and uploads a receipt."],
  ["받은 것으로 처리", "Mark as received"], ["배달비", "Delivery fee"], ["배달료", "Delivery fee"], ["미정", "TBD"], ["무료", "Free"], ["최종 금액", "Total"],
  ["라라무브 링크", "Lalamove link"], ["저장됨", "saved"], ["✅ 주문 수락", "✅ Accept order"], ["👩‍🍳 조리 시작", "👩‍🍳 Start cooking"], ["→ 입금 요청", "→ request payment"],
  ["🛵 라라무브 링크·금액", "🛵 Lalamove link·fee"], ["✏️ 배달료 수정", "✏️ Edit delivery fee"], ["할인 변경", "Change discount"], ["주문 취소", "Cancel order"], ["주문 거절", "Reject order"],
  ["🖨 인쇄", "🖨 Print"], ["결제 직접 확인 (카톡 등으로 받음)", "Confirm payment manually (got it by Kakao etc.)"],
  ["받아야 할 금액", "Amount due"], ["제출", "submitted"], ["영수증 불러오는 중…", "Loading receipt…"], ["✔ 결제 확인 → 주문 시작", "✔ Confirm payment → start order"], ["+ 인쇄", "+ print"],
  ["반려 사유 (예: 금액이 다릅니다 / 영수증이 잘 안보여요)", "Reason for rejecting (e.g. wrong amount / receipt unclear)"],
  ["영수증 반려 (다시 올리게 하기)", "Reject receipt (ask to upload again)"], ["결제완료", "Paid"], ["+ 추가분", "+ add-on"], ["현금 수령 예정", "Collect cash"], ["현금 수령", "Cash"],
  ["(다시)", "(again)"], ["🔔 준비 완료 (손님 알림)", "🔔 Ready (notify customer)"], ["🛵 배달 출발", "🛵 Out for delivery"], ["영수증 사진 보기", "View receipt photo"],
  ["🖨 영수증 인쇄", "🖨 Print receipt"], ["배달 위치 링크", "Rider tracking link"], ["(손님 화면에 '위치 확인' 버튼 표시 중)", "(customer sees a 'Track' button)"],
  ["📍 위치 링크 없음", "📍 No tracking link"], ["링크 수정", "Edit link"], ["링크 입력", "Add link"], ["✅ 픽업 완료", "✅ Picked up"],
  ["합계", "Total"], ["사유:", "Reason:"], ["영수증 사진", "Receipt photo"], ["지도", "Map"], ["반려", "Reject"],
  ["영수증을 불러오지 못했습니다", "Couldn't load the receipt"], ["지도 링크를 복사했습니다 — 기사님께 카톡/문자로 보내세요", "Map link copied — send it to the rider"],
  ["지도 링크", "Map link"], ["⏰ 예약", "⏰ Scheduled"],

  // ---- 토스트 · 오류 ----
  ["저장 실패:", "Save failed:"], ["수정 실패:", "Update failed:"], ["적용 실패:", "Apply failed:"], ["전송 실패:", "Send failed:"], ["인쇄 실패:", "Print failed:"], ["연결 실패:", "Connection failed:"], ["실패:", "Failed:"],
  ["배달비를 입력하세요 (무료면 0)", "Enter the delivery fee (0 if free)"], ["할인 금액을 입력하거나 '없음'을 선택하세요", "Enter a discount amount or choose 'none'"],
  ["숫자를 입력하세요", "Enter a number"], ["배달료가 같아서 바꾸지 않았습니다", "Same fee — nothing changed"],
  ["% 할인은 5% 또는 10%만 가능합니다. 다른 금액은 숫자로 입력하세요", "Only 5% or 10% are allowed. Enter other discounts as an amount"],
  ["5%, 10% 또는 숫자로 입력하세요", "Enter 5%, 10% or a number"], ["할인을 없앴습니다", "Discount removed"], ["주문을 취소했습니다", "Order cancelled"],
  ["영수증을 반려했습니다", "Receipt rejected"], ["추가 결제 영수증을 반려했습니다", "Add-on receipt rejected"], ["위치 링크를 저장했습니다", "Tracking link saved"],
  ["배달료를 먼저 정해주세요 (✏️ 배달료 수정)", "Set the delivery fee first (✏️ Edit delivery fee)"], ["배달료를 먼저 정해주세요", "Set the delivery fee first"],
  ["금액을 숫자로 입력하세요", "Enter the amount as a number"], ["링크를 저장했습니다 (배달료 그대로)", "Link saved (fee unchanged)"],
  ["https:// 로 시작하는 링크를 붙여넣어 주세요", "Paste a link starting with https://"],
  ["알 수 없는 오류", "Unknown error"], ["품절 처리했습니다", "Marked as sold out"], ["판매 재개했습니다", "Back on sale"],
  ["품절됨 → 판매 재개", "Sold out → resume"], ["품절 처리", "Mark sold out"], ["저장했습니다", "Saved"], ["설정을 저장했습니다", "Settings saved"],
  ["관리자로 등록되지 않은 계정입니다 (admins 테이블 확인)", "This account is not an admin (check the admins table)"],
  ["오류가 발생했습니다. 잠시 후 다시 시도해주세요", "Something went wrong. Please try again"],
  ["라라무브 API 키가 아직 없어요 → ⚙ 설정 → 라라무브 API 키에 Key·Secret을 넣으세요", "No Lalamove API key yet → ⚙ Settings → Lalamove API key"],
  ["Supabase의 http 확장이 꺼져 있어요 → Database → Extensions 에서 'http'를 켜세요", "Supabase 'http' extension is off → Database → Extensions → enable 'http'"],
  ["라라무브 키가 맞지 않아요 (Key·Secret, 운영/테스트 환경 확인)", "Lalamove key is wrong (check Key·Secret and production/sandbox)"],
  ["링크의 라라무브 주문을 API로 찾을 수 없어요 (앱으로 부른 주문은 조회가 안 될 수 있음)", "Couldn't find that Lalamove order via the API (orders made in the app may not be visible)"],
  ["손님 주소에 지도 핀이 없어 요금을 조회할 수 없어요", "No map pin on the customer address, so no quote"],

  // ---- 프린터 ----
  ["영수증 프린터 설정", "Receipt printer"], ["연결 방식", "Connection"], ["블루투스 바로 연결", "Bluetooth direct"], ["RawBT 앱 (안드로이드)", "RawBT app (Android)"],
  ["브라우저 인쇄창 (PC 드라이버)", "Browser print dialog (PC driver)"], ["🔗 블루투스 프린터 찾기 / 연결", "🔗 Find / connect Bluetooth printer"], ["✏️ 자유 인쇄 (메모 · 마감 종이)", "✏️ Free print (memo · closing slip)"], ["📡 와이파이 프린터 (인쇄 스테이션)", "📡 Wi-Fi printer (print station)"], ["테스트 인쇄", "Test print"],
  ["프린터 전원을 켜고", "Turn the printer on,"], ["휴대폰 블루투스 설정에서 미리 페어링하지 말고", "do NOT pair it in phone Bluetooth settings first,"],
  ["아래 '프린터 찾기'를 누른 뒤 목록에서 프린터를 고르세요.", "then tap 'Find printer' below and pick it from the list."],
  ["• 안드로이드 Chrome 또는 PC Chrome/Edge에서만 됩니다 (아이폰 불가).", "• Works only in Android Chrome or PC Chrome/Edge (not iPhone)."],
  ["• 목록에 프린터가 안 보이면 BLE를 지원하지 않는 모델입니다 →", "• If it's not in the list, the model has no BLE →"], ["RawBT 앱", "RawBT app"], ["방식을 쓰세요.", "instead."],
  ["• 페이지를 새로 열 때마다 '프린터 찾기'를 한 번 눌러 다시 연결해야 할 수 있습니다.", "• You may need to tap 'Find printer' again each time you reopen the page."],
  ["안드로이드 전용. Play 스토어에서", "Android only. Install"], ["(RawBT ESC/POS thermal printer driver) 앱을 설치하고,", "(RawBT ESC/POS thermal printer driver) from the Play Store,"],
  ["앱에서 블루투스 프린터를 선택 → 테스트 인쇄가 되는지 먼저 확인하세요.", "select your Bluetooth printer in the app and check a test print there first."],
  ["그다음 여기서 '테스트 인쇄'를 누르면 RawBT가 열리며 인쇄됩니다. 처음 한 번 \"항상 허용\"을 눌러두면 이후 자동으로 나갑니다.", "Then tap 'Test print' here — RawBT opens and prints. Tap \"Always allow\" once and it prints automatically after that."],
  ["• 거의 모든 58mm 블루투스 프린터(클래식 블루투스 포함)에서 작동합니다.", "• Works with almost any 58mm Bluetooth printer (classic Bluetooth too)."],
  ["PC에 프린터 드라이버를 설치한 경우(USB/블루투스 COM 포트) 브라우저 인쇄창으로 출력합니다. 설치가이드 5단계 참고.", "If the printer driver is installed on a PC (USB/Bluetooth COM port), prints through the browser print dialog. See setup guide step 5."],
  ["⚠ 이 브라우저는 블루투스 직접 연결을 지원하지 않습니다. 안드로이드는 Chrome, 아이폰은 불가 → RawBT 방식을 쓰세요.", "⚠ This browser can't connect to Bluetooth directly. Use Chrome on Android (iPhone not supported) → or use RawBT."],
  ["마지막 연결:", "Last connected:"], ["프린터 찾는 중…", "Searching for printer…"], ["✔ 연결됨:", "✔ Connected:"], ["연결됨", "Connected"],
  ["인쇄 데이터 보내는 중…", "Sending print data…"], ["✔ 전송했습니다. 영수증이 나왔는지 확인하세요.", "✔ Sent. Check that the receipt printed."],
  ["— 🖨 프린터 버튼에서 다시 연결하세요", "— reconnect from the 🖨 Printer button"],

  // ---- 채팅 ----
  ["채팅을 불러오지 못했습니다. Supabase에서", "Couldn't load chats. In Supabase, check that"], ["을 실행했는지 확인하세요.", "has been run."], ["을 먼저 실행하세요.", "first."],
  ["(주문 #", "(order #"], ["주문 #", "Order #"], ["(문의)", "(inquiry)"], ["진행 중", "Open"], ["문의", "Inquiry"], ["(메시지 없음)", "(no messages)"],
  ["대화가 없습니다", "No conversations"], ["⚙ 자동응답", "⚙ Auto replies"], ["채팅을 열 수 없습니다:", "Can't open chat:"], ["보내기", "Send"],
  ["답장 입력 (Enter 전송, Shift+Enter 줄바꿈)", "Type a reply (Enter to send, Shift+Enter for new line)"], ["대화 종료", "End chat"], ["(종료됨)", "(ended)"],
  ["이 문의 대화를 종료할까요? (손님은 새 문의를 시작할 수 있습니다)", "End this inquiry chat? (The customer can start a new one.)"],
  ["🤖 자동응답", "🤖 Auto reply"], ["🌐 번역 중…", "🌐 translating…"], ["아직 메시지가 없습니다", "No messages yet"], ["손님", "Customer"],

  // ---- 설정 ----
  ["불러오는 중…", "Loading…"], ["설정을 불러오지 못했습니다 (", "Couldn't load settings ("], ["Supabase에서", "In Supabase, run"],
  ["🛵 배달비 자동 계산", "🛵 Automatic delivery fee"], ["계산 방식", "Method"], ["지역별 요금표 (추천)", "Zone price table (recommended)"],
  ["모든 주소 라라무브식 거리요금", "Lalamove-style distance fee for every address"], ["자동 계산 끄기 (관리자가 직접 입력)", "Off (admin enters the fee)"],
  ["손님 주소로 배달비가 바로 계산되고, 주문 즉시 결제 안내가 나갑니다. 계산이 안 되는 주소는 지금처럼 관리자가 배달비를 입력합니다. 배달 출발 때 라라무브 링크를 넣으면 실제 요금으로 조정하고 손님에게 자동 안내할 수 있습니다.",
   "The fee is calculated from the customer's address. Addresses that can't be calculated get a fee from the admin. Adding a Lalamove link later updates the fee and tells the customer automatically."],
  ["지역별 요금표", "Zone price table"], ["— 위에서부터 먼저 맞는 지역 적용", "— the first matching zone from the top applies"], ["+ 지역 추가", "+ Add zone"],
  ["주소에 '찾을 단어' 중 하나가 들어 있으면 그 지역입니다(영문, 쉼표로 구분). 메뉴 합계가 '무료 기준' 이상이면 배달비 0원, 비우면 항상 배달비를 받습니다.",
   "An address belongs to a zone if it contains one of its keywords (English, comma separated). If the menu subtotal reaches 'free over', delivery is free; leave it empty to always charge."],
  ["표에 없는 지역", "Areas not in the table"], ["지도 핀으로 라라무브식 요금 자동 계산 (추천)", "Auto Lalamove-style fee from the map pin (recommended)"],
  ["가게에서 배달비 안내 (관리자 입력)", "Store tells the fee (admin enters it)"], ["가게 위치 (출발지)", "Store location (pickup point)"],
  ["가게 주소 (라라무브에 전달)", "Store address (sent to Lalamove)"], ["위도 lat", "Latitude"], ["경도 lng", "Longitude"],
  ["Google 지도에서 가게를 길게 누르면 나오는 숫자 두 개입니다.", "The two numbers you get by long-pressing the store in Google Maps."],
  ["라라무브식 거리요금", "Lalamove-style distance fee"], ["— 요금표에 없는 지역 · 라라무브 링크 넣을 때", "— for areas not in the table"],
  ["기본요금 ₱", "Base ₱"], ["기준 넘으면 1km당 ₱", "₱ per km after"], ["1km당 ₱", "₱ per km"], ["기준 거리 km", "Tier distance km"], ["더할 금액 ₱", "Add ₱"],
  ["올림 단위 ₱", "Round up to ₱"], ["예상시간(분)", "ETA (min)"], ["요금에 더할 ₱", "Add to fee ₱"],
  ["기본값은 라라무브 오토바이 요금표(₱49 + 5km까지 1km당 ₱6, 그 뒤 1km당 ₱5)입니다. 예: 8km = 49 + 30 + 15 = ₱94. 거리는 직선거리 × 1.3으로 계산합니다(실제 라라무브 앱 금액과 조금 다를 수 있음).",
   "Defaults follow Lalamove motorcycle rates (₱49 + ₱6/km up to 5km, then ₱5/km). E.g. 8km = 49 + 30 + 15 = ₱94. Distance = straight line × 1.3 (may differ slightly from the Lalamove app)."],
  ["라라무브 API", "Lalamove API"], ["— 선택. 키가 없으면 안 써도 됩니다 (위 거리요금으로 자동 계산)", "— optional. Not needed without a key (distance fee above is used)"],
  ["라라무브 요금 사용", "Use Lalamove pricing"], ["환경", "Environment"], ["운영 (production)", "Production"], ["테스트 (sandbox)", "Sandbox"], ["차량", "Vehicle"],
  ["배달비 설정 저장", "Save delivery settings"], ["🔑 라라무브 API 키", "🔑 Lalamove API key"],
  ["partnerportal.lalamove.com → Developers 에서 발급한 API Key와 Secret을 넣으세요. 저장한 뒤에는 다시 보이지 않습니다.", "Enter the API Key and Secret from partnerportal.lalamove.com → Developers. They are hidden after saving."],
  ["키 저장", "Save key"], ["연결 테스트", "Test connection"], ["저장됨 (", "Saved ("],
  ["🗺 Google 지도 (선택)", "🗺 Google Maps (optional)"], ["키를 넣으면 손님 주소 검색과 지도가", "With a key, customer address search and map use"],
  ["로 바뀝니다. 비워두면 무료 OpenStreetMap을 씁니다. 키에 문제가 생기면 자동으로 OpenStreetMap으로 돌아갑니다.", ". Empty = free OpenStreetMap. If the key fails, it falls back to OpenStreetMap automatically."],
  ["Google Maps API 키", "Google Maps API key"], ["Map ID (선택, 비워도 됨)", "Map ID (optional)"], ["Google 지도 저장", "Save Google Maps"], ["Google 주소 검색 테스트", "Test Google address search"],
  ["키를 먼저 넣어주세요", "Enter the key first"], ["✅ 성공! 검색 결과:", "✅ Works! Results:"],
  ["'Places API (New)'가 켜져 있지 않아요 (API 및 서비스 → 라이브러리)", "'Places API (New)' is not enabled (APIs & Services → Library)"],
  ["💬 채팅 자동응답", "💬 Chat auto replies"], ["첫 메시지 자동 인사 (비우면 보내지 않음)", "Automatic greeting on first message (empty = none)"],
  ["손님용 자주 묻는 질문", "Customer FAQ"], ["— 손님이 누르면 답변이 자동으로 나갑니다", "— the answer is sent when the customer taps it"], ["+ 질문 추가", "+ Add question"],
  ["관리자 빠른 답장", "Admin quick replies"], ["— 채팅 화면에서 눌러서 바로 입력", "— tap in the chat screen to insert"], ["+ 답장 추가", "+ Add reply"], ["자동응답 저장", "Save auto replies"],
  ["질문 — 한국어 (예: 영업시간이 어떻게 되나요?)", "Question — Korean"], ["자동 답변 — 한국어", "Auto answer — Korean"], ["자동 답변", "Auto answer"],
  ["첫 메시지 자동 인사 — 한국어 (비우면 보내지 않음)", "Automatic greeting — Korean (empty = none)"], ["첫 메시지 자동 인사 — English", "Automatic greeting — English"],
  ["자동으로 보낼 메시지 — 한국어", "Message sent automatically — Korean"], ["자동으로 보낼 메시지 — English", "Message sent automatically — English"],
  ["채팅은 병기하지 않습니다. 손님 화면이", "Chats are never mixed. Customers on"], ["이면 영어 칸,", "get the English box,"], ["이면 한국어 칸이 나갑니다. 영어 칸을 비우면 한국어가 나갑니다. 직접 쓰는 답장도 '한글 / English' 형식이면 손님 언어에 맞게 한쪽만 보입니다.", "get the Korean box. If English is empty, Korean is sent. Your own replies written as 'Korean / English' are also shown in the customer's language only."], ["삭제", "Delete"],
  ["지역 이름 (예: 파사이 Pasay)", "Zone name (e.g. Pasay)"], ["찾을 단어 (예: pasay, newport)", "Keywords (e.g. pasay, newport)"], ["무료 기준 ₱", "Free over ₱"],
  ["배달비 ₱", "Fee ₱"], ["빠른 답장 문장", "Quick reply text"], ["없음", "none"],
  ["🛵 배송 추적 자동 안내", "🛵 Tracking link auto message"], ["링크에 이 단어가 있으면", "If the link contains"], ["자동으로 보낼 메시지", "Message sent automatically"],
  ["배달 위치 링크를 넣을 때 링크에 위 단어가 들어 있으면(대소문자 무관) 손님 채팅에 이 메시지가 자동으로 갑니다. 비우면 보내지 않습니다.",
   "When the tracking link you add contains this word (any case), this message goes to the customer chat automatically. Leave empty to turn off."],
  ["추적 안내 저장", "Save tracking message"],
  ["🌐 Google 번역", "🌐 Google Translate"], ["Google 번역 테스트", "Test Google Translate"],
  ["같은 키로 채팅·요청사항 번역도 Google 번역을 씁니다 (매달 50만 글자 무료). Google Cloud → API 라이브러리에서", "The same key is used for chat and note translation with Google Translate (500,000 characters free per month). In Google Cloud → API Library, enable"],
  ["를 켜고, 키의 API 제한에도 추가하세요. 안 되면 자동으로 무료 번역(MyMemory)을 씁니다.", " and add it to the key's API restrictions. If it fails, the free MyMemory translation is used."],
  ["🛵 배달·픽업 자동 안내", "🛵 Delivery / pickup auto messages"], ["— 상태가 바뀌면 손님 채팅에 자동으로 갑니다 (비우면 안 보냄)", "— sent to the customer chat when the status changes (empty = off)"],
  ["배달 출발 — 한국어", "Out for delivery — Korean"], ["배달 출발 — English", "Out for delivery — English"],
  ["배달 도착 (배달 완료 누를 때) — 한국어", "Arrived (when you press Delivered) — Korean"], ["배달 도착 (배달 완료 누를 때) — English", "Arrived (when you press Delivered) — English"],
  ["픽업 준비 완료 — 한국어", "Ready for pickup — Korean"], ["픽업 준비 완료 — English", "Ready for pickup — English"],
  ["배달 출발·도착 자동 안내: Supabase에서", "Delivery auto messages: in Supabase, run"],
  ["📲 푸시 알림", "📲 Push alerts"], ["— 사이트를 닫아도 휴대폰에 알림", "— alerts even when the site is closed"],
  ["새 주문 · 추가 주문 · 영수증 · 손님 메시지가 오면 이 기기에 알림이 옵니다 (화면이 꺼져 있어도). 알림을 받을 휴대폰·태블릿마다 한 번씩", "New orders, add-ons, receipts and customer messages alert this device (even with the screen off). On each phone/tablet, press"],
  ["를 누르세요.", "once."], ["📲 이 기기에서 받기", "📲 Get alerts on this device"], ["이 기기에서 받기", "Get alerts on this device"], ["테스트 보내기", "Send test"], ["이 기기 해제", "Stop on this device"], ["확인 중…", "Checking…"],
  ["아이폰·아이패드: Safari로 관리자 페이지 열기 → 공유 버튼 →", "iPhone/iPad: open the admin page in Safari → Share →"], ["홈 화면에 추가", "Add to Home Screen"],
  ["→ 홈 화면의 '빨통 관리자' 아이콘으로 열어서 '이 기기에서 받기'를 누르세요 (iOS 16.4 이상).", "→ open it from the home-screen icon and press 'Get alerts on this device' (iOS 16.4+)."],
  ["🎂 생일 쿠폰", "🎂 Birthday coupon"], ["생일 쿠폰 자동 지급", "Give birthday coupon automatically"], ["할인 %", "Discount %"], ["최대 할인 ₱", "Max discount ₱"],
  ["회원이 '내 정보'에서 생일을 등록하면(한 번만), 생일 7일 전 ~ 7일 후 사이에 사이트를 열 때 1년에 한 번 자동 지급됩니다. 생일 7일 전보다 먼저 등록해야 그해 쿠폰이 나옵니다(악용 방지). 날짜 변경은 회원 목록의 '생일' 버튼으로 합니다.",
   "Members set their birthday once in 'My info'. The coupon is given once a year when they open the site 7 days before to 7 days after. It must be set at least 7 days before to count that year (anti-abuse). Change dates with the 'Birthday' button in the member list."],
  ["🌐 번역", "🌐 Translation"], ["가게 이메일 (선택 — 무료 번역 하루 한도를 늘려줍니다)", "Store email (optional — raises the free daily translation limit)"],
  ["손님이 한글로 쓴 요청사항·채팅은 관리자 화면에서 자동으로 영어 번역이 함께 보입니다 (MyMemory 무료 번역).", "Korean notes and chats from customers are shown with an English translation here (MyMemory free translation)."],
  ["숫자 칸을 모두 채워주세요", "Fill in all number fields"], ["가게 주소를 입력하세요", "Enter the store address"], ["생일 할인 %는 1~100", "Birthday discount % must be 1–100"],
  ["라라무브 키를 저장했습니다", "Lalamove key saved"], ["라라무브에 요금 조회 중…", "Asking Lalamove for a quote…"], ["❌ 실패:", "❌ Failed:"],

  // ---- 리뷰 ----
  ["리뷰 기능을 불러오지 못했습니다. Supabase에서", "Couldn't load reviews. In Supabase, check that"], ["⏳ 확인 대기", "⏳ Pending"], ["확인 대기", "Pending"],
  ["✅ 승인 (스탬프 +1)", "✅ Approved (+1 stamp)"], ["✅ 승인 · 스탬프 +1", "✅ Approve · +1 stamp"], ["❌ 반려", "❌ Reject"], ["승인", "Approved"],
  ["(이름 없음)", "(no name)"], ["리뷰 캡처", "Review screenshot"], ["확인할 리뷰가 없습니다", "No reviews to check"], ["리뷰가 없습니다", "No reviews"],
  ["회원이 올린 리뷰 캡처입니다. 실제 리뷰가 맞으면", "Review screenshots from members. If the review is real, tap"],
  ["을 누르세요. 스탬프 1개가 바로 쌓이고, 보상 개수가 되면 쿠폰이 자동으로 들어갑니다.", ". One stamp is added right away, and coupons are given automatically at the reward count."],
  ["승인했습니다 — 스탬프 +1", "Approved — +1 stamp"], ["반려했습니다", "Rejected"],

  // ---- 회원 · 쿠폰 ----
  ["회원 기능을 불러오지 못했습니다. Supabase에서", "Couldn't load members. In Supabase, check that"],
  ["🎁 자동 쿠폰 설정", "🎁 Automatic coupons"], ["가입 축하 쿠폰", "Welcome coupon"], ["자동 지급", "given automatically"], ["금액 ₱", "Amount ₱"],
  ["최소주문 ₱", "Min. order ₱"], ["유효기간(일) — 비우면 무제한", "Valid days — empty = no limit"], ["유효기간(일)", "Valid days"], ["비우면 무제한", "empty = no limit"],
  ["주문 스탬프", "Order stamps"], ["(배달 완료 시 1개)", "(1 per completed order)"], ["중간 보상", "Mid reward"], ["최종 보상", "Final reward"], ["개째", "th"],
  ["% 최대할인 ₱", "% max ₱"], ["비우면 제한 없음", "empty = no limit"],
  ["최종 보상 개수가 되면 쿠폰을 주고 스탬프는 0개부터 다시 시작합니다. 중간 보상 금액을 0으로 하면 중간 보상은 없습니다.", "At the final count a coupon is given and stamps restart from 0. Set the mid reward to 0 to turn it off."],
  ["📸 리뷰 인증", "📸 Review reward"], ["— 승인할 때마다 스탬프 +1", "— +1 stamp per approved review"], ["설정 저장", "Save settings"],
  ["🏷 쿠폰 코드", "🏷 Coupon codes"], ["+ 새 코드", "+ New code"],
  ["코드를 만들어 카톡·페이스북에 올리면, 회원은 '내 정보'에서 코드를 등록해 쿠폰함에 받고, 비회원은 주문 화면에서 코드를 입력해 바로 써요 (같은 코드는 전화번호 하나당 한 번).", "Post a code on Kakao/Facebook — members add it in 'My info'; guests type it at checkout (once per phone number)."],
  ["사용중 → 중지", "Active → stop"], ["중지됨 → 재개", "Stopped → resume"], ["아직 만든 코드가 없습니다.", "No codes yet."],
  ["🎁 쿠폰 지급", "🎁 Give coupon"], ["쿠폰함", "Coupons"], ["스탬프 수정", "Edit stamps"], ["🎂 생일", "🎂 Birthday"], ["비번 초기화", "Reset password"],
  ["회원이 없습니다.", "No members."], ["👥 회원", "👥 Members"], ["이름 또는 전화번호 검색", "Search name or phone"], ["검색", "Search"],
  ["% 할인은 100 이하로 입력하세요", "% discount must be 100 or less"], ["중간 보상 개수는 최종 보상 개수보다 작아야 합니다", "Mid reward count must be less than the final count"],
  ["새 쿠폰 코드", "New coupon code"], ["코드 (영문/숫자, 손님이 입력)", "Code (letters/numbers, customers type it)"], ["예: PALTONG10", "e.g. PALTONG10"],
  ["받은 뒤 사용 기간(일) — 비우면 무제한", "Days usable after claiming — empty = no limit"], ["코드 등록 마감일 — 비우면 무제한", "Last day to claim — empty = no limit"],
  ["1인당 횟수", "Per member"], ["선착순 수량 (비우면 무제한)", "Total quantity (empty = no limit)"], ["코드는 영문/숫자 3~30자", "Code must be 3–30 letters/numbers"],
  ["쿠폰 이름과 할인 값을 입력하세요", "Enter a coupon name and discount"], ["% 할인은 100 이하", "% must be 100 or less"], ["코드 만들기", "Create code"],
  ["할인 값을 입력하세요", "Enter the discount"], ["쿠폰을 지급했습니다", "Coupon given"], ["지급하기", "Give"], ["사용함", "Used"], ["기간 만료", "Expired"], ["사용 가능", "Available"],
  ["회수", "Remove"], ["쿠폰이 없습니다", "No coupons"], ["이 쿠폰을 회수(삭제)할까요?", "Remove (delete) this coupon?"], ["스탬프를 수정했습니다", "Stamps updated"],
  ["YYYY-MM-DD 형식으로 입력하세요", "Use YYYY-MM-DD format"], ["생일을 저장했습니다", "Birthday saved"], ["비밀번호를 초기화했습니다", "Password reset"],
  ["쿠폰 이름 (손님에게 보임)", "Coupon name (shown to customer)"], ["예: 단골 감사 쿠폰 Thank you", "e.g. Thank you coupon"], ["₱ 금액 할인", "₱ amount off"], ["% 할인", "% off"],
  ["할인 금액/퍼센트", "Amount / percent"], ["최대 할인 금액 (% 쿠폰일 때, 비우면 제한 없음)", "Max discount (for % coupons, empty = no limit)"],
  ["최소 주문 금액 (음식값 기준)", "Minimum order (food subtotal)"], ["닫기", "Close"], ["저장", "Save"], ["예약 주문", "Scheduled order"],
];
const HANGUL = /[가-힣]/;
const map = new Map(DICT);
const keys = [...map.keys()].sort((a, b) => b.length - a.length);
const RE = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
const tr = s => (s && HANGUL.test(s)) ? s.replace(RE, m => map.get(m)) : s;

let lang = "ko";
try{ lang = localStorage.getItem("paltong_admin_lang") === "en" ? "en" : "ko"; }catch(e){}
const textOrig = new WeakMap(), attrOrig = new WeakMap();
const ATTRS = ["placeholder", "title", "alt", "aria-label"];
const skip = el => !el || !!el.closest("[data-raw],textarea,script,style");

function doText(n){
  if(!HANGUL.test(n.data) || skip(n.parentElement)) return;
  const t = tr(n.data); if(t === n.data) return;
  const before = n.data; n.data = t; textOrig.set(n, [before, t]);
}
function doEl(el){
  if(!el || el.closest("[data-raw],script,style")) return;   // textarea 안 글은 그대로, placeholder 는 번역
  for(const a of ATTRS){ const v = el.getAttribute(a); if(!v || !HANGUL.test(v)) continue;
    const t = tr(v); if(t === v) continue; const o = attrOrig.get(el) || {}; o[a] = [v, t]; attrOrig.set(el, o); el.setAttribute(a, t); }
}
function walk(root){
  if(root.nodeType === 3){ doText(root); return; }
  if(root.nodeType !== 1 && root.nodeType !== 9) return;
  if(root.nodeType === 1) doEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while((n = w.nextNode())){ if(n.nodeType === 3) doText(n); else doEl(n); }
}
function restore(){
  const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while((n = w.nextNode())){
    if(n.nodeType === 3){ const o = textOrig.get(n); if(o && n.data === o[1]) n.data = o[0]; textOrig.delete(n); }
    else { const o = attrOrig.get(n); if(o){ for(const a in o) if(n.getAttribute(a) === o[a][1]) n.setAttribute(a, o[a][0]); attrOrig.delete(n); } }
  }
}
const obs = new MutationObserver(list => {
  for(const m of list){
    if(m.type === "characterData") doText(m.target);
    else if(m.type === "attributes") doEl(m.target);
    else m.addedNodes.forEach(walk);
  }
});
function on(){ walk(document.documentElement); obs.observe(document.documentElement, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:ATTRS }); }
function off(){ obs.disconnect(); restore(); }

/* prompt · confirm · alert 문구도 번역 (기본값은 그대로) */
for(const fn of ["prompt", "confirm", "alert"]){
  const orig = window[fn].bind(window);
  window[fn] = (msg, ...rest) => orig(lang === "en" ? tr(String(msg ?? "")) : msg, ...rest);
}

const listeners = [];
window.PTI18N = {
  get lang(){ return lang; },
  tr: s => lang === "en" ? tr(s) : s,
  L: (ko, en) => lang === "en" ? en : ko,
  onChange(f){ listeners.push(f); },
  set(l){
    lang = l === "en" ? "en" : "ko";
    try{ localStorage.setItem("paltong_admin_lang", lang); }catch(e){}
    document.documentElement.lang = lang;
    off();
    listeners.forEach(f => { try{ f(lang); }catch(e){ console.error(e); } });
    if(lang === "en") on();
  },
  toggle(){ this.set(lang === "en" ? "ko" : "en"); },
  start(){ document.documentElement.lang = lang; if(lang === "en") on(); },
};
})();
