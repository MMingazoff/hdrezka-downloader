// Общий код: настройки и сборка пути/имени файла. Подключается в popup и в content script.
const RZK_DEFAULTS = {
  // Папки указываются относительно папки «Загрузки» (браузер не даёт писать за её пределы)
  folderSeries: "{title} ({year})/Сезон {season}",
  folderMovie: "",
  fileName: "{title}[ ({year})][ - S{season2}E{episode2}][ - {translator}] - {quality}",
  saveAs: false,
};

const RZK_PLACEHOLDERS = [
  ["title", "название"], ["orig", "оригинальное название"], ["year", "год"],
  ["season", "сезон"], ["season2", "сезон 01"], ["episode", "серия"], ["episode2", "серия 01"],
  ["translator", "озвучка"], ["quality", "качество"],
];

async function rzkLoadSettings() {
  try {
    const s = await chrome.storage.local.get(Object.keys(RZK_DEFAULTS));
    return { ...RZK_DEFAULTS, ...s };
  } catch (_) {
    return { ...RZK_DEFAULTS };
  }
}
const rzkSaveSettings = (patch) => chrome.storage.local.set(patch);

const rzkSafe = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
const rzkPad = (n) => String(n).padStart(2, "0");

function rzkVars(info, quality) {
  return {
    title: info.title || "", orig: info.origTitle || "", year: info.year || "",
    season: info.season || "", episode: info.episode || "",
    season2: info.season ? rzkPad(info.season) : "", episode2: info.episode ? rzkPad(info.episode) : "",
    translator: info.translator || "", quality: quality || "",
  };
}

// Шаблон: {поле}; блок в [квадратных скобках] пропускается, если в нём есть пустое поле.
function rzkRender(tpl, vars, sanitize = true) {
  const val = (k) => (sanitize ? rzkSafe(vars[k] ?? "") : vars[k] ?? "");
  const out = tpl.replace(/\[([^\[\]]*)\]/g, (_, inner) => {
    const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return keys.some((k) => !vars[k]) ? "" : inner;
  });
  return out.replace(/\{(\w+)\}/g, (_, k) => val(k));
}

// -> { folder: "A/B" | "", file: "name.mp4", path: "A/B/name.mp4" }
function rzkBuildTarget(info, quality, settings) {
  const vars = rzkVars(info, quality);
  const isSeries = !!(info.season || info.episode);
  const folderTpl = isSeries ? settings.folderSeries : settings.folderMovie;
  const folder = rzkRender(folderTpl || "", vars)
    .split("/").map((p) => rzkSafe(p)).filter((p) => p && p !== "..").join("/");
  let file = rzkSafe(rzkRender(settings.fileName || RZK_DEFAULTS.fileName, vars)) || "video";
  file = file.replace(/\.mp4$/i, "") + ".mp4";
  return { folder, file, path: (folder ? folder + "/" : "") + file };
}

function rzkDownload(info, stream, settings) {
  const t = rzkBuildTarget(info, stream.quality, settings);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "download", url: stream.url, filename: t.path, saveAs: !!settings.saveAs },
      (r) => resolve({ error: chrome.runtime.lastError?.message || r?.error })
    );
  });
}
