const $ = id => document.getElementById(id);
const ago = t => { if(!t) return "아직 없음"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`; };
async function paint(){
  const { key, stat = {} } = await chrome.storage.local.get(["key", "stat"]);
  $("key").value = key || PT_DK.DEFAULT_KEY || "";
  const lines = [
    `마지막 연결 확인: ${ago(stat.lastPing)}`,
    `마지막으로 보낸 주문: ${stat.lastNo ? "#" + stat.lastNo + " · " + ago(stat.lastSent) : "아직 없음"}`,
    `보낸 주문 수: ${stat.count || 0}건`,
    `상태 맞추기: ${ago(stat.lastStatus)}${stat.lastPushNo ? ` · 배달K 상태 변경 #${stat.lastPushNo} ${stat.lastPushOk ? "✔" : "✖ " + (stat.lastPushErr || "")} (${ago(stat.lastPush)})` : ""}`
  ];
  if(stat.lastError) lines.push(`<span class="err">⚠️ 오류 (${ago(stat.lastErrorAt)}): ${stat.lastError === "no_key" ? "연결 키를 넣어 주세요" : /bad_key/.test(stat.lastError) ? "연결 키가 틀렸어요 — 관리자 화면에서 다시 복사" : stat.lastError}</span>`);
  $("stat").innerHTML = lines.join("<br>");
}
$("save").onclick = async () => { await chrome.storage.local.set({ key: $("key").value.trim(), stat: {} }); $("save").textContent = "저장됨 ✔"; setTimeout(() => $("save").textContent = "저장", 1500); paint(); };
paint();
