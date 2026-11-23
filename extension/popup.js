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

function buildFolder(info) {
  // Папка нужна только сериалам: «Название (год)/Сезон N»
  if (!info.season && !info.episode) return "";
  const base = safe(info.title + (info.year ? ` (${info.year})` : ""));
  return info.season ? `${base}/Сезон ${info.season}` : base;
}

function flash(btn, text, ms = 1800) {
  const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = text;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = old; btn.title = ""; }, ms);
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
  if (!info.season && !info.episode) meta.append(el("span", "tag", "Фильм"));
  root.append(meta);

  if (!info.streams.length) {
    root.append(el("div", "empty", "Не удалось получить ссылки на видео. Обновите страницу (F5) и откройте меню снова — если не помогло, запустите воспроизведение."));
    return;
  }
  if (!info.exact) {
    root.append(el("div", "warn", "Не уверен, что ссылки относятся к выбранной серии или озвучке. Обновите страницу, чтобы убедиться."));
  }

  const folder = buildFolder(info);
  let useFolder = false;
  if (folder) {
    useFolder = localStorage.getItem("useFolder") !== "0";
    const label = el("label", "folder");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = useFolder;
    cb.onchange = () => { useFolder = cb.checked; localStorage.setItem("useFolder", cb.checked ? "1" : "0"); hint.textContent = hintText(); };
    label.append(cb, " Сохранять в папку");
    const hint = el("div", "hint");
    const hintText = () => (useFolder ? "Загрузки/" + folder + "/" : "Загрузки/");
    hint.textContent = hintText();
    root.append(label, hint);
  }

  for (const s of info.streams) {
    const row = el("div", "row");
    const q = el("span", "q", s.quality);
    if (s.premium) {
      const b = el("span", "prem", "Premium");
      b.title = "Для скачивания этого качества нужна Premium-подписка";
      q.append(" ", b);
    }
    row.append(q);
    const dl = el("button", null, "Скачать");
    dl.onclick = () =>
      chrome.downloads.download(
        { url: s.url, filename: (useFolder && folder ? folder + "/" : "") + buildFilename(info, s.quality) },
        () => {
          const err = chrome.runtime.lastError;
          if (err) dl.title = err.message;
          flash(dl, err ? "Ошибка" : "Скачивается…");
        }
      );
    const cp = el("button", "sec", "Ссылка");
    cp.onclick = async () => { await navigator.clipboard.writeText(s.url); flash(cp, "Скопировано"); };
    row.append(dl, cp);
    root.append(row);
  }
}
init();
