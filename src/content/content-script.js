chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_METRICS") {
    sendResponse({
      scrollHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      ),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio || 1,
      initialScrollY: window.scrollY,
      title: document.title,
    });
    return;
  }

  if (message.type === "SCROLL_TO") {
    window.scrollTo(0, message.y);
    requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
    return true;
  }
});
