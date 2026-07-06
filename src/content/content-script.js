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
      const initialScrollY = window.scrollY;
      // Se mide siempre desde el tope: así containerRect.top queda en el mismo
      // sistema de coordenadas (absoluto dentro de la página) que usan los offsets
      // del scroll normal, sin importar en qué punto estaba la página al capturar.
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });

      const docScrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const title = document.title;

      scrollContainer = null;
      // La búsqueda de un contenedor con scroll propio ya no depende de si la
      // página en sí necesita scroll: pueden coexistir (una página larga con una
      // tabla angosta de scroll horizontal en medio, por ejemplo).
      const found = message.detectInternalScroll ? findInternalScrollContainer() : null;

      let container = null;
      if (found) {
        scrollContainer = found.el;
        const rect = scrollContainer.getBoundingClientRect();
        const containerRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        const axis = found.axes.canY ? "y" : "x";
        container =
          axis === "y"
            ? {
                axis,
                rect: containerRect,
                scrollTop: scrollContainer.scrollTop,
                scrollHeight: scrollContainer.scrollHeight,
                clientHeight: scrollContainer.clientHeight,
              }
            : {
                axis,
                rect: containerRect,
                scrollLeft: scrollContainer.scrollLeft,
                scrollWidth: scrollContainer.scrollWidth,
                clientWidth: scrollContainer.clientWidth,
              };
      }

      sendResponse({
        scrollHeight: docScrollHeight,
        viewportHeight,
        viewportWidth,
        devicePixelRatio,
        initialScrollY,
        title,
        container,
      });
      return;
    }

    if (message.type === "SCROLL_TO") {
      if (message.target === "container" && scrollContainer) {
        if (message.axis === "x") {
          scrollContainer.scrollLeft = message.pos;
        } else {
          scrollContainer.scrollTop = message.pos;
        }
      } else {
        window.scrollTo({ top: message.pos, left: 0, behavior: "instant" });
      }
      requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
      return true;
    }
  });
}
