const CAPTURE_INTERVAL_MS = 550; // chrome.tabs.captureVisibleTab limita a ~2 llamadas/seg
const SETTLE_DELAY_MS = 200; // margen para repintado/lazy-load tras cada scroll
const STORAGE_KEY = "scrollshot_capture";
const SETTINGS_KEY = "scrollshot_settings";
const DEFAULT_SETTINGS = { detectInternalScroll: true };

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

function buildOffsets(maxScroll, step) {
  const offsets = [];
  for (let y = 0; y < maxScroll; y += step) {
    offsets.push(Math.min(y, maxScroll));
  }
  offsets.push(maxScroll);
  return offsets;
}

async function getSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/content-script.js"],
    });
  } catch (err) {
    throw new Error(
      "No se puede capturar esta página (restringida por Chrome, ej. chrome://, Web Store o un PDF)."
    );
  }
}

async function capturePage(tabId, tab, metrics) {
  const { scrollHeight, viewportHeight, viewportWidth, devicePixelRatio, initialScrollY, title } =
    metrics;

  const maxScrollTop = Math.max(scrollHeight - viewportHeight, 0);
  const offsets = buildOffsets(maxScrollTop, viewportHeight);

  const shots = [];
  try {
    for (let i = 0; i < offsets.length; i++) {
      await sendToTab(tabId, { type: "SCROLL_TO", pos: offsets[i] });
      // A partir de la 2ª captura se ocultan los elementos fixed/sticky (headers, banners)
      // para que no queden pegados y repetidos en cada tramo del canvas final.
      if (i === 1) await sendToTab(tabId, { type: "HIDE_FIXED_ELEMENTS" });
      chrome.action.setBadgeText({ text: `${i + 1}/${offsets.length}`, tabId });
      await wait(SETTLE_DELAY_MS);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      shots.push(dataUrl);
      if (i < offsets.length - 1) await wait(CAPTURE_INTERVAL_MS);
    }
  } finally {
    if (offsets.length > 1) await sendToTab(tabId, { type: "SHOW_FIXED_ELEMENTS" }).catch(() => {});
  }

  await sendToTab(tabId, { type: "SCROLL_TO", pos: initialScrollY });

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      mode: "page",
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
}

async function captureContainer(tabId, tab, metrics) {
  const {
    viewportHeight,
    viewportWidth,
    devicePixelRatio,
    title,
    containerRect,
    containerScrollTop,
    containerScrollHeight,
    containerClientHeight,
  } = metrics;

  const maxScrollTop = Math.max(containerScrollHeight - containerClientHeight, 0);
  const offsets = buildOffsets(maxScrollTop, containerClientHeight);

  const shots = [];
  for (let i = 0; i < offsets.length; i++) {
    await sendToTab(tabId, { type: "SCROLL_TO", pos: offsets[i] });
    chrome.action.setBadgeText({ text: `${i + 1}/${offsets.length}`, tabId });
    await wait(SETTLE_DELAY_MS);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    shots.push(dataUrl);
    if (i < offsets.length - 1) await wait(CAPTURE_INTERVAL_MS);
  }

  await sendToTab(tabId, { type: "SCROLL_TO", pos: containerScrollTop });

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      mode: "container",
      shots,
      offsets,
      viewportHeight,
      viewportWidth,
      devicePixelRatio,
      containerRect,
      containerScrollHeight,
      containerClientHeight,
      pageUrl: tab.url,
      pageTitle: title,
      capturedAt: new Date().toISOString(),
    },
  });
}

async function captureContainerX(tabId, tab, metrics) {
  const {
    viewportWidth,
    devicePixelRatio,
    title,
    containerRect,
    containerScrollLeft,
    containerScrollWidth,
    containerClientWidth,
  } = metrics;

  const maxScrollLeft = Math.max(containerScrollWidth - containerClientWidth, 0);
  const offsets = buildOffsets(maxScrollLeft, containerClientWidth);

  const shots = [];
  for (let i = 0; i < offsets.length; i++) {
    await sendToTab(tabId, { type: "SCROLL_TO", pos: offsets[i], axis: "x" });
    chrome.action.setBadgeText({ text: `${i + 1}/${offsets.length}`, tabId });
    await wait(SETTLE_DELAY_MS);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    shots.push(dataUrl);
    if (i < offsets.length - 1) await wait(CAPTURE_INTERVAL_MS);
  }

  await sendToTab(tabId, { type: "SCROLL_TO", pos: containerScrollLeft, axis: "x" });

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      mode: "container-x",
      shots,
      offsets,
      viewportWidth,
      devicePixelRatio,
      containerRect,
      containerClientWidth,
      pageUrl: tab.url,
      pageTitle: title,
      capturedAt: new Date().toISOString(),
    },
  });
}

async function captureFullPage(tabId, tab) {
  await ensureContentScript(tabId);
  const settings = await getSettings();
  const metrics = await sendToTab(tabId, {
    type: "GET_METRICS",
    detectInternalScroll: settings.detectInternalScroll,
  });

  if (metrics.mode === "container") {
    await captureContainer(tabId, tab, metrics);
  } else if (metrics.mode === "container-x") {
    await captureContainerX(tabId, tab, metrics);
  } else {
    await capturePage(tabId, tab, metrics);
  }

  await chrome.tabs.create({ url: chrome.runtime.getURL("src/editor/editor.html") });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  chrome.action.setBadgeBackgroundColor({ color: "#2563eb", tabId: tab.id });
  chrome.action.setBadgeText({ text: "●", tabId: tab.id });

  try {
    await captureFullPage(tab.id, tab);
    chrome.action.setBadgeText({ text: "", tabId: tab.id });
  } catch (err) {
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 4000);
  }
});
