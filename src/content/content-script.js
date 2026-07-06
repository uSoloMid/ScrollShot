if (!window.__scrollshotContentScriptLoaded) {
  window.__scrollshotContentScriptLoaded = true;

  let hiddenFixedElements = [];

  function hideFixedElements() {
    hiddenFixedElements = [];
    document.querySelectorAll("body *").forEach((el) => {
      const position = window.getComputedStyle(el).position;
      if (position === "fixed" || position === "sticky") {
        hiddenFixedElements.push({ el, previousVisibility: el.style.visibility });
        el.style.setProperty("visibility", "hidden", "important");
      }
    });
  }

  function showFixedElements() {
    hiddenFixedElements.forEach(({ el, previousVisibility }) => {
      if (previousVisibility) {
        el.style.visibility = previousVisibility;
      } else {
        el.style.removeProperty("visibility");
      }
    });
    hiddenFixedElements = [];
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "HIDE_FIXED_ELEMENTS") {
      hideFixedElements();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "SHOW_FIXED_ELEMENTS") {
      showFixedElements();
      sendResponse({ ok: true });
      return;
    }

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
}
