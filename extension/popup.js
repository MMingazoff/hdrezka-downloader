const list = document.getElementById("list");

function safeName(s) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 120);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { videos = {} } = await chrome.storage.session.get("videos");
  const items = videos[tab.id] || [];

  if (!items.length) {
    list.innerHTML = '<div class="empty">Видео не найдено. Запустите воспроизведение и откройте это окно снова.</div>';
    return;
  }

  for (const v of items) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div class="name"></div>
      <button class="dl">Скачать</button> <button class="sec cp">Копировать ссылку</button>`;
    el.querySelector(".name").textContent = v.name;
    el.querySelector(".dl").onclick = (e) => {
      const base = safeName(tab.title || v.name.replace(/\.mp4$/i, ""));
      chrome.runtime.sendMessage(
        { type: "download", url: v.url, filename: `${base}.mp4` },
        (r) => { e.target.textContent = r?.error ? "Ошибка: " + r.error : "Скачивается…"; }
      );
    };
    el.querySelector(".cp").onclick = () => navigator.clipboard.writeText(v.url);
    list.appendChild(el);
  }
}
init();
