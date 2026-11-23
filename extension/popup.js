const root = document.getElementById("root");
const HOST_RE = /^https:\/\/([^/]+\.)?rezka\.fi\//;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function flash(btn, text, ms = 1800) {
  const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = text;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = old; btn.title = ""; }, ms);
}

async function getPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !HOST_RE.test(tab.url)) return { error: "Откройте страницу видео на rezka.fi." };
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: collectPage });
    return { info: res.result };
  } catch (e) {
    return { error: "Не удалось прочитать страницу: " + e.message };
  }
}

function renderVideo(info, settings, container) {
  container.append(el("h1", null, info.title + (info.year ? ` (${info.year})` : "")));
  if (info.origTitle) container.append(el("div", "orig", info.origTitle));

  const meta = el("div", "meta");
  if (info.translator) meta.append(el("span", "tag", "Озвучка: " + info.translator));
  if (info.season) meta.append(el("span", "tag", "Сезон " + info.season));
  if (info.episode) meta.append(el("span", "tag", "Серия " + info.episode));
  if (!info.season && !info.episode) meta.append(el("span", "tag", "Фильм"));
  container.append(meta);

  if (!info.streams.length) {
    container.append(el("div", "empty", "Не удалось получить ссылки на видео. Обновите страницу (F5) и откройте меню снова — если не помогло, запустите воспроизведение."));
    return;
  }
  if (!info.exact) {
    container.append(el("div", "warn", "Не уверен, что ссылки относятся к выбранной серии или озвучке. Обновите страницу, чтобы убедиться."));
  }

  const pathHint = el("div", "hint");
  const updateHint = () => {
    const t = rzkBuildTarget(info, info.streams[info.streams.length - 1].quality, settings);
    pathHint.textContent = "Загрузки/" + (t.folder ? t.folder + "/" : "") + (settings.saveAs ? " (с выбором места)" : "");
  };
  updateHint();
  container.append(pathHint);
  container.updateHint = updateHint;

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
    dl.onclick = async () => {
      const r = await rzkDownload(info, s, settings);
      if (r.error) dl.title = r.error;
      flash(dl, r.error ? "Ошибка" : "Скачивается…");
    };
    const cp = el("button", "sec", "Ссылка");
    cp.onclick = async () => { await navigator.clipboard.writeText(s.url); flash(cp, "Скопировано"); };
    row.append(dl, cp);
    container.append(row);
  }
}

function renderSettings(settings, info, onChange) {
  const d = el("details", "settings");
  d.append(el("summary", null, "Настройки"));

  const sample = info || { title: "Название", year: "2020", origTitle: "Original", season: "1", episode: "2", translator: "Озвучка" };
  const field = (label, key, hint) => {
    const wrap = el("div", "field");
    wrap.append(el("label", null, label));
    const input = document.createElement("input");
    input.type = "text"; input.value = settings[key]; input.spellcheck = false;
    const prev = el("div", "hint");
    const upd = () => {
      const s = { ...settings, [key]: input.value };
      const seriesSample = { ...sample, season: sample.season || "1", episode: sample.episode || "2" };
      const t = rzkBuildTarget(key === "folderMovie" ? { ...sample, season: "", episode: "" } : seriesSample, "720p", s);
      prev.textContent = key === "fileName" ? t.file : "Загрузки/" + (t.folder ? t.folder + "/" : "");
    };
    input.oninput = () => { settings[key] = input.value; rzkSaveSettings({ [key]: input.value }); upd(); onChange(); };
    input.onfocus = () => { field.active = input; };
    upd();
    wrap.append(input, prev);
    if (hint) wrap.append(el("div", "hint", hint));
    return wrap;
  };
  field.active = null;

  d.append(
    field("Папка для сериалов", "folderSeries", "Пусто — сохранять прямо в «Загрузки». Вложенность через /"),
    field("Папка для фильмов", "folderMovie"),
    field("Имя файла", "fileName", "Текст в [скобках] пропускается, если в нём пустое поле")
  );

  const chips = el("div", "chips");
  chips.append(el("span", "hint", "Вставить в поле: "));
  for (const [key, title] of RZK_PLACEHOLDERS) {
    const c = el("button", "chip", "{" + key + "}");
    c.type = "button"; c.title = title;
    c.onmousedown = (e) => e.preventDefault(); // не терять фокус поля
    c.onclick = () => {
      const i = field.active;
      if (!i) return;
      const a = i.selectionStart ?? i.value.length, b = i.selectionEnd ?? a;
      i.setRangeText("{" + key + "}", a, b, "end");
      i.dispatchEvent(new Event("input"));
    };
    chips.append(c);
  }
  d.append(chips);

  const lab = el("label", "folder");
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = !!settings.saveAs;
  cb.onchange = () => { settings.saveAs = cb.checked; rzkSaveSettings({ saveAs: cb.checked }); onChange(); };
  lab.append(cb, " Спрашивать, куда сохранить (любая папка)");
  d.append(lab);

  const reset = el("button", "sec", "Сбросить настройки");
  reset.onclick = async () => { await rzkSaveSettings({ ...RZK_DEFAULTS }); location.reload(); };
  d.append(reset);
  return d;
}

async function init() {
  const settings = await rzkLoadSettings();
  const { info, error } = await getPageInfo();
  const content = el("div");
  root.append(content);
  if (error) content.append(el("div", "empty", error));
  else renderVideo(info, settings, content);
  root.append(renderSettings(settings, info, () => content.updateHint?.()));
}
init();
