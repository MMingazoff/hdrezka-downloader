// Работает в контексте страницы (MAIN world) на rezka.fi.
// Подслушивает ответы /ajax/get_cdn_series/ (смена серии/озвучки) и запоминает
// списки потоков {качество: url} для каждой комбинации озвучка/сезон/серия.
(() => {
  if (window.__rzk) return;
  const store = (window.__rzk = { byKey: {}, latest: null });

  function parseStreams(str) {
    // "[360p]https://a.mp4:hls:manifest.m3u8 or https://b.mp4,[480p]..." -> [{quality, url}]
    const out = [];
    const re = /\[([^\]]+)\]([^\[]*?)(?=,\[|$)/g;
    let m;
    while ((m = re.exec(str))) {
      const urls = m[2].split(" or ").map((u) => u.trim());
      const url = urls.find((u) => /\.mp4/i.test(u));
      if (!url) continue;
      const prem = /prem/i.test(m[1]);
      const quality = m[1].replace(/<[^>]*>/g, "").trim() + (prem ? " (Premium)" : "");
      out.push({ quality, url: url.replace(/(\.mp4):hls:.*$/i, "$1") });
    }
    return out;
  }
  window.__rzkParseStreams = parseStreams;

  const keyOf = (t, s, e) => [t || "", s || "", e || ""].join("|");

  function handle(reqBody, respText) {
    try {
      const data = JSON.parse(respText);
      if (!data || typeof data.url !== "string" || !data.url.includes("[")) return;
      const p = new URLSearchParams(typeof reqBody === "string" ? reqBody : "");
      const streams = parseStreams(data.url);
      if (!streams.length) return;
      const entry = { streams, t: p.get("translator_id"), s: p.get("season"), e: p.get("episode") };
      store.byKey[keyOf(entry.t, entry.s, entry.e)] = entry;
      store.latest = entry;
    } catch (_) {}
  }

  const isTarget = (u) => /\/ajax\/get_cdn_series/.test(String(u));

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__rzkUrl = url;
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (isTarget(this.__rzkUrl)) {
      this.addEventListener("load", () => handle(body, this.responseText));
    }
    return send.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const p = origFetch.apply(this, arguments);
    if (isTarget(url)) {
      p.then((r) => r.clone().text()).then((t) => handle(init?.body && String(init.body), t)).catch(() => {});
    }
    return p;
  };
})();
