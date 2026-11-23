// Скачивание выполняется здесь: chrome.downloads недоступен в content script.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "download") return;
  chrome.downloads.download({ url: msg.url, filename: msg.filename, saveAs: !!msg.saveAs }, (id) =>
    sendResponse({ id, error: chrome.runtime.lastError?.message })
  );
  return true;
});
