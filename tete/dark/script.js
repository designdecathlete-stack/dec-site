/* 予約先と店舗の地図をここで設定します。空欄の間はテンプレート表示です。 */
const LP_SETTINGS = {
  googleMapsEmbedUrl: "", // Googleマップ「共有」→「地図を埋め込む」の iframe src のURL
  googleMapsUrl: "", // Googleマップ「共有」→「リンクを送信」の店舗URL
  reservationUrl: "https://lin.ee/x8xUv9j", // 例: https://line.me/... または https://予約ページのURL
};

if (LP_SETTINGS.reservationUrl.trim()) {
  const destination = LP_SETTINGS.reservationUrl.trim();
  if (/^https?:\/\//i.test(destination) || /^tel:[+\d-]+$/.test(destination)) {
    document.querySelectorAll("[data-reservation]").forEach(link => {
      link.href = destination;
    });
    document.getElementById("reservation-note")?.remove();
  }
}

// PCの目次。削除したセクションへの項目は非表示にします。
const navigation = [...document.querySelectorAll(".sb-left nav a")].map(link => {
  const section = document.querySelector(link.getAttribute("href"));
  if (!section) link.hidden = true;
  return {link, section};
}).filter(item => item.section);
function updateNavigation() {
  let active;
  navigation.forEach(item => { if (item.section.getBoundingClientRect().top <= 180) active = item; });
  navigation.forEach(item => {
    if (item === active) item.link.setAttribute("aria-current", "location");
    else item.link.removeAttribute("aria-current");
  });
}
window.addEventListener("scroll", updateNavigation, {passive:true});
updateNavigation();

// 埋め込みURLと外部リンクは別々に設定。未設定の地図は仮の枠を表示します。
function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
const mapFrame = document.getElementById("google-map");
const mapEmbedUrl = LP_SETTINGS.googleMapsEmbedUrl.trim();
if (mapFrame && isHttpsUrl(mapEmbedUrl)) {
  mapFrame.src = mapEmbedUrl;
  mapFrame.hidden = false;
  document.getElementById("map-placeholder")?.remove();
}
const mapLink = document.getElementById("google-map-link");
const mapUrl = LP_SETTINGS.googleMapsUrl.trim();
if (mapLink && isHttpsUrl(mapUrl)) {
  mapLink.href = mapUrl;
  mapLink.hidden = false;
}
