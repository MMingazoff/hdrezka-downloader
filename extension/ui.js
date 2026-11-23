// Кнопка скачивания прямо на странице (под плеером). Изолированный мир + Shadow DOM.
(() => {
  if (window.__rzkUi) return;
  window.__rzkUi = true;

  const host = document.createElement("div");
  host.id = "rzk-bar-host";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { display: block; }
      .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px auto; max-width: 640px;
             padding: 8px 10px; border-radius: 8px; background: #f2f5fb; color: #222; font: 13px system-ui, sans-serif; }
      .info { flex: 1; min-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #555; }
      select, button { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid #ccd; background: #fff; color: #222; }
      button { background: #2d7ff9; border-color: #2d7ff9; color: #fff; cursor: pointer; font-weight: 600; }
      button:disabled { opacity: .6; cursor: default; }
      .msg { width: 100%; font-size: 12px; color: #888; }
      @media (prefers-color-scheme: dark) { .bar { background: #23262d; color: #eee; } .info { color: #aaa; } select { background: #333; color: #eee; border-color: #555; } }
    </style>
    <div class="bar">
      <span class="info"></span>
      <select></select>
      <button>⬇ Скачать</button>
      <div class="msg" hidden></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const info$ = $(".info"), sel = $("select"), btn = $("button"), msg = $(".msg");

  let info = null;

  function say(text, ms = 4000) {
    msg.textContent = text; msg.hidden = !text;
    clearTimeout(say._t);
    if (text && ms) say._t = setTimeout(() => (msg.hidden = true), ms);
  }

  function requestData() {
    return new Promise((resolve) => {
      const done = (e) => { document.removeEventListener("rzk-data", done); clearTimeout(t); try { resolve(JSON.parse(e.detail)); } catch (_) { resolve(null); } };
      const t = setTimeout(() => { document.removeEventListener("rzk-data", done); resolve(null); }, 1500);
      document.addEventListener("rzk-data", done);
      document.dispatchEvent(new CustomEvent("rzk-collect"));
    });
  }

  async function refresh() {
    const prevQuality = info?.streams?.[sel.value]?.quality;
    info = await requestData();
    sel.textContent = "";
    if (!info || !info.streams.length) {
      info$.textContent = "Ссылки пока не найдены";
      sel.hidden = true; btn.disabled = true;
      return;
    }
    sel.hidden = false; btn.disabled = false;
    const parts = [info.title];
    if (info.season) parts.push("сезон " + info.season);
    if (info.episode) parts.push("серия " + info.episode);
    if (info.translator) parts.push(info.translator);
    info$.textContent = parts.join(" · ");
    info$.title = info$.textContent;
    info.streams.forEach((s, i) => {
      const o = document.createElement("option");
      o.value = i; o.textContent = s.quality + (s.premium ? " (Premium)" : "");
      sel.append(o);
    });
    const saved = localStorage.getItem("rzkQuality");
    const pick = info.streams.findIndex((s) => s.quality === (prevQuality || saved));
    if (pick >= 0) sel.value = pick;
    else {
      const free = info.streams.map((s, i) => (s.premium ? -1 : i)).filter((i) => i >= 0);
      sel.value = free.length ? free[free.length - 1] : 0;
    }
  }

  sel.onchange = () => { try { localStorage.setItem("rzkQuality", info.streams[sel.value].quality); } catch (_) {} };

  btn.onclick = async () => {
    if (!info) return;
    const stream = info.streams[sel.value];
    btn.disabled = true;
    const r = await rzkDownload(info, stream, await rzkLoadSettings());
    say(r.error ? "Ошибка: " + r.error : "Скачивание началось: " + stream.quality);
    btn.disabled = false;
  };

  // Вставка под плеер; при перерисовке страницы вставляем заново
  function mount() {
    if (host.isConnected) return;
    const anchor = document.getElementById("player") || document.querySelector(".b-post__title");
    if (anchor) anchor.insertAdjacentElement("afterend", host);
  }

  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { mount(); refresh(); }, 400); };
  document.addEventListener("rzk-updated", schedule);
  // Клики по озвучкам/сезонам/сериям меняют активный элемент
  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".b-translator__item, .b-simple_season__item, .b-simple_episode__item")) schedule();
  });
  new MutationObserver(() => { if (!host.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });

  mount();
  refresh();
})();
