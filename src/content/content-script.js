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

  function getScrollAxes(el) {
    const style = window.getComputedStyle(el);
    const canY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1;
    const canX =
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth + 1;
    return { canX, canY };
  }

  function findInternalScrollContainer() {
    let best = null;
    let bestAxes = null;
    let bestArea = 0;
    document.querySelectorAll("body *").forEach((el) => {
      const axes = getScrollAxes(el);
      if (!axes.canX && !axes.canY) return;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
        bestAxes = axes;
      }
    });
    return best ? { el: best, axes: bestAxes } : null;
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
      const found =
        !pageItselfScrolls && message.detectInternalScroll ? findInternalScrollContainer() : null;

      if (found) {
        scrollContainer = found.el;
        const rect = scrollContainer.getBoundingClientRect();
        const containerRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };

        if (found.axes.canY) {
          sendResponse({
            mode: "container",
            viewportHeight,
            viewportWidth,
            devicePixelRatio,
            title,
            containerRect,
            containerScrollTop: scrollContainer.scrollTop,
            containerScrollHeight: scrollContainer.scrollHeight,
            containerClientHeight: scrollContainer.clientHeight,
          });
        } else {
          sendResponse({
            mode: "container-x",
            viewportWidth,
            devicePixelRatio,
            title,
            containerRect,
            containerScrollLeft: scrollContainer.scrollLeft,
            containerScrollWidth: scrollContainer.scrollWidth,
            containerClientWidth: scrollContainer.clientWidth,
          });
        }
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
      if (scrollContainer && message.axis === "x") {
        scrollContainer.scrollLeft = message.pos;
      } else if (scrollContainer) {
        scrollContainer.scrollTop = message.pos;
      } else {
        window.scrollTo(0, message.pos);
      }
      requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
      return true;
    }
  });
}
