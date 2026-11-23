const root = document.getElementById("root");
const HOST_RE = /^https:\/\/([^/]+\.)?rezka\.fi\//;

const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildFilename(info, quality) {
  const parts = [info.title + (info.year ? ` (${info.year})` : "")];
  if (info.season && info.episode) parts.push(`S${pad(info.season)}E${pad(info.episode)}`);
  else if (info.episode) parts.push(`E${pad(info.episode)}`);
  if (info.translator) parts.push(info.translator);
  parts.push(quality);
  return safe(parts.join(" - ")) + ".mp4";
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !HOST_RE.test(tab.url)) {
    root.append(el("div", "empty", "Откройте страницу видео на rezka.fi."));
    return;
  }

  let info;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: collectPage,
    });
    info = res.result;
  } catch (e) {
    root.append(el("div", "empty", "Не удалось прочитать страницу: " + e.message));
    return;
  }

  root.append(el("h1", null, info.title + (info.year ? ` (${info.year})` : "")));
  if (info.origTitle) root.append(el("div", "orig", info.origTitle));

  const meta = el("div", "meta");
  if (info.translator) meta.append(el("span", "tag", "Озвучка: " + info.translator));
  if (info.season) meta.append(el("span", "tag", "Сезон " + info.season));
  if (info.episode) meta.append(el("span", "tag", "Серия " + info.episode));
  if (meta.children.length) root.append(meta);

  if (!info.streams.length) {
    root.append(el("div", "empty", "Ссылки не найдены. Обновите страницу и выберите серию/озвучку."));
    return;
  }
  if (!info.exact) {
    root.append(el("div", "warn", "Ссылки могут относиться к другой серии/озвучке — переключите серию или обновите страницу."));
  }

  for (const s of info.streams) {
    const row = el("div", "row");
    row.append(el("span", "q", s.quality));
    const dl = el("button", null, "Скачать");
    dl.onclick = () =>
      chrome.downloads.download({ url: s.url, filename: buildFilename(info, s.quality) }, () => {
        dl.textContent = chrome.runtime.lastError ? "Ошибка" : "Скачивается…";
        if (chrome.runtime.lastError) dl.title = chrome.runtime.lastError.message;
      });
    const cp = el("button", "sec", "Ссылка");
    cp.onclick = async () => { await navigator.clipboard.writeText(s.url); cp.textContent = "Скопировано"; };
    row.append(dl, cp);
    root.append(row);
  }
}
init();
