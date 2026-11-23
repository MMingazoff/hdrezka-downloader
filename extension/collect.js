// Выполняется в контексте страницы (через chrome.scripting.executeScript, world: MAIN).
// Возвращает всё, что нужно для меню: название, озвучку, сезон/серию и ссылки по качествам.
function collectPage() {
  const text = (sel) => document.querySelector(sel)?.textContent.trim() || null;
  const parse = window.__rzkParseStreams || (() => []);

  const title = text("h1[itemprop=name]") || text("h1") || document.title;
  const origTitle = text(".b-post__origtitle");
  const year = (document.querySelector('meta[property="og:title"]')?.content.match(/\((\d{4})\)\s*$/) || [])[1] || null;

  // Текущие значения из DOM (озвучка/сезон/серия есть не у всех видео)
  const trEl = document.querySelector(".b-translator__item.active");
  const translator = trEl ? (trEl.getAttribute("title") || trEl.textContent).trim() : null;
  const translatorId = trEl?.dataset.translator_id || null;
  const seasonEl = document.querySelector(".b-simple_season__item.active");
  const episodeEl = document.querySelector(".b-simple_episode__item.active");
  const season = seasonEl?.dataset.tab_id || episodeEl?.dataset.season_id || null;
  const episode = episodeEl?.dataset.episode_id || null;

  // Начальное состояние плеера — из inline-скрипта страницы
  let initial = null;
  for (const s of document.scripts) {
    const t = s.textContent;
    const m = t.match(/initCDN(Series|Movies)Events\(([^{]*)\{[\s\S]*?"streams":"((?:[^"\\]|\\.)*)"/);
    if (!m) continue;
    const args = m[2].split(",").map((x) => x.trim());
    const isSeries = m[1] === "Series";
    initial = {
      t: args[1],
      s: isSeries ? args[2] : null,
      e: isSeries ? args[3] : null,
      streams: parse(JSON.parse('"' + m[3] + '"')),
    };
    break;
  }

  const store = window.__rzk || { byKey: {}, latest: null };
  const key = [translatorId || "", season || "", episode || ""].join("|");
  const initialKey = initial ? [initial.t || "", initial.s || "", initial.e || ""].join("|") : null;

  let streams = [];
  let exact = true;
  if (store.byKey[key]) streams = store.byKey[key].streams;
  else if (initial && initialKey === key) streams = initial.streams;
  else if (store.latest) { streams = store.latest.streams; exact = false; }
  else if (initial) { streams = initial.streams; exact = false; }

  return { title, origTitle, year, translator, season, episode, streams, exact };
}
