const CAPTURE_INTERVAL_MS = 550; // chrome.tabs.captureVisibleTab limita a ~2 llamadas/seg
const SETTLE_DELAY_MS = 200; // margen para repintado/lazy-load tras cada scroll
const STORAGE_KEY = "scrollshot_capture";

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureFullPage(tabId, tab) {
  const metrics = await sendToTab(tabId, { type: "GET_METRICS" });
  const { scrollHeight, viewportHeight, viewportWidth, devicePixelRatio, initialScrollY, title } =
    metrics;

  const maxScrollTop = Math.max(scrollHeight - viewportHeight, 0);
  const offsets = [];
  for (let y = 0; y < maxScrollTop; y += viewportHeight) {
    offsets.push(Math.min(y, maxScrollTop));
  }
  offsets.push(maxScrollTop);

  const shots = [];
  for (let i = 0; i < offsets.length; i++) {
    await sendToTab(tabId, { type: "SCROLL_TO", y: offsets[i] });
    await wait(SETTLE_DELAY_MS);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    shots.push(dataUrl);
    if (i < offsets.length - 1) await wait(CAPTURE_INTERVAL_MS);
  }

  await sendToTab(tabId, { type: "SCROLL_TO", y: initialScrollY });

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      shots,
      offsets,
      viewportHeight,
      viewportWidth,
      devicePixelRatio,
      scrollHeight,
      pageUrl: tab.url,
      pageTitle: title,
      capturedAt: new Date().toISOString(),
    },
  });

  await chrome.tabs.create({ url: chrome.runtime.getURL("src/editor/editor.html") });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "CAPTURE_START") return;

  (async () => {
    try {
      const tab = await chrome.tabs.get(message.tabId);
      await captureFullPage(message.tabId, tab);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});
