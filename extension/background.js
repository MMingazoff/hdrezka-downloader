// Ловим запросы манифеста/сегментов и превращаем их в прямую ссылку на mp4.
// Пример: https://host/.../yini5.mp4:hls:manifest.m3u8  ->  https://host/.../yini5.mp4
const HLS_RE = /^(.*?\.mp4):hls:/i;

function toMp4(url) {
  const m = HLS_RE.exec(url);
  return m ? m[1] : null;
}

async function getStore() {
  const { videos = {} } = await chrome.storage.session.get("videos");
  return videos;
}

async function addVideo(tabId, mp4) {
  const videos = await getStore();
  const list = videos[tabId] || [];
  if (list.some((v) => v.url === mp4)) return;
  list.push({ url: mp4, name: decodeURIComponent(mp4.split("/").pop()), ts: Date.now() });
  videos[tabId] = list;
  await chrome.storage.session.set({ videos });
  chrome.action.setBadgeText({ tabId, text: String(list.length) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#2d7ff9" });
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const mp4 = toMp4(details.url);
    if (mp4) addVideo(details.tabId, mp4);
  },
  { urls: ["<all_urls>"] }
);

// Сброс списка при переходе на другую страницу во вкладке
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === "loading" && info.url) {
    const videos = await getStore();
    delete videos[tabId];
    await chrome.storage.session.set({ videos });
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const videos = await getStore();
  delete videos[tabId];
  await chrome.storage.session.set({ videos });
});

// Скачивание по запросу из popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "download") {
    chrome.downloads.download(
      { url: msg.url, filename: msg.filename, saveAs: false },
      (id) => sendResponse({ id, error: chrome.runtime.lastError?.message })
    );
    return true;
  }
});
