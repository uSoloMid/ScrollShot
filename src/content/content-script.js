if (!window.__scrollshotContentScriptLoaded) {
  window.__scrollshotContentScriptLoaded = true;

  let hiddenFixedElements = [];
  let scrollContainer = null;

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

  function isInternallyScrollable(el) {
    const overflowY = window.getComputedStyle(el).overflowY;
    return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
  }

  function findInternalScrollContainer() {
    let best = null;
    let bestArea = 0;
    document.querySelectorAll("body *").forEach((el) => {
      if (!isInternallyScrollable(el)) return;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    });
    return best;
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
      const docScrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const title = document.title;

      scrollContainer = null;
      const pageItselfScrolls = docScrollHeight > viewportHeight + 1;
      if (!pageItselfScrolls && message.detectInternalScroll) {
        scrollContainer = findInternalScrollContainer();
      }

      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        sendResponse({
          mode: "container",
          viewportHeight,
          viewportWidth,
          devicePixelRatio,
          title,
          containerRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          containerScrollTop: scrollContainer.scrollTop,
          containerScrollHeight: scrollContainer.scrollHeight,
          containerClientHeight: scrollContainer.clientHeight,
        });
      } else {
        sendResponse({
          mode: "page",
          scrollHeight: docScrollHeight,
          viewportHeight,
          viewportWidth,
          devicePixelRatio,
          initialScrollY: window.scrollY,
          title,
        });
      }
      return;
    }

    if (message.type === "SCROLL_TO") {
      if (scrollContainer) {
        scrollContainer.scrollTop = message.y;
      } else {
        window.scrollTo(0, message.y);
      }
      requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
      return true;
    }
  });
}
