const STORAGE_KEY = "scrollshot_capture";

const canvas = document.getElementById("stitched-canvas");
const ctx = canvas.getContext("2d");
const moreBtn = document.getElementById("toggle-more");
const morePanel = document.getElementById("more-panel");
const annotateEnabled = document.getElementById("annotate-enabled");
const pageUrlInput = document.getElementById("page-url");
const capturedAtInput = document.getElementById("captured-at");
const exportPngBtn = document.getElementById("export-png");
const exportPdfBtn = document.getElementById("export-pdf");
const copyImageBtn = document.getElementById("copy-image");

function formatLocalDateTime(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function loadCapture() {
  const { [STORAGE_KEY]: capture } = await chrome.storage.local.get(STORAGE_KEY);
  if (!capture) {
    document.body.innerHTML =
      '<p style="padding:24px;color:#f87171;">No hay ninguna captura pendiente. Cierra esta pestaña y vuelve a capturar desde el ícono de la extensión.</p>';
    throw new Error("no capture in storage");
  }
  return capture;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function stitchShots(capture) {
  const { shots, devicePixelRatio, scrollHeight } = capture;
  const images = await Promise.all(shots.map(loadImage));

  const dpr = devicePixelRatio || 1;
  canvas.width = images[0].width;
  canvas.height = Math.round(scrollHeight * dpr);

  // Se apila cada captura usando su alto real de píxeles (no el calculado a partir de
  // viewportHeight * devicePixelRatio): en pantallas con escalado fraccional (125%/150%
  // en Windows) esos dos valores pueden diferir por 1px, dejando una línea entre tramos.
  let cursorY = 0;
  images.forEach((img, i) => {
    const isLast = i === images.length - 1;
    if (!isLast) {
      ctx.drawImage(img, 0, cursorY);
      cursorY += img.height;
      return;
    }
    // el último tramo puede solaparse con el anterior (el scroll se recortó al fondo
    // real de la página): solo se dibuja la porción inferior que falta para llenar
    // el lienzo, tomada del fondo de esta captura.
    const remaining = canvas.height - cursorY;
    if (remaining >= img.height) {
      ctx.drawImage(img, 0, cursorY);
      return;
    }
    const sourceY = img.height - remaining;
    ctx.drawImage(img, 0, sourceY, img.width, remaining, 0, cursorY, img.width, remaining);
  });
}

// Combina el scroll normal de la página con el scroll interno de un contenedor
// (tabla con scroll propio, vertical u horizontal) detectado dentro de ella. Todos
// los pasos exteriores se apilan como en stitchShots; en el paso donde vive el
// contenedor, esa captura se reemplaza por su propia franja de arriba/abajo más
// las páginas de su scroll interno.
async function stitchHybrid(capture) {
  const {
    outerShots,
    outerOffsets,
    containerSubShots,
    containerOffsets,
    containerStepIndex,
    containerAxis,
    containerRect,
    containerScrollSize,
    containerClientSize,
    devicePixelRatio,
    scrollHeight,
  } = capture;

  const dpr = devicePixelRatio || 1;
  const subImages = await Promise.all(containerSubShots.map(loadImage));
  const outerImages = await Promise.all(
    outerShots.map((shot) => (shot ? loadImage(shot) : null))
  );

  const first = subImages[0];
  const frameWidth = (outerImages.find((img) => img) || first).width;
  const rectTop =
    Math.round(containerRect.top * dpr) - Math.round(outerOffsets[containerStepIndex] * dpr);
  const rectLeft = Math.round(containerRect.left * dpr);
  const rectWidth = Math.round(containerRect.width * dpr);
  const rectHeight = Math.round(containerRect.height * dpr);

  const extra =
    containerAxis === "y"
      ? Math.round((containerScrollSize - containerClientSize) * dpr)
      : rectHeight * (subImages.length - 1);

  canvas.width = frameWidth;
  canvas.height = Math.round(scrollHeight * dpr) + extra;

  // Dibuja lo que falta del fondo de `img` (su porción inferior) para llenar
  // exactamente lo que queda de lienzo, sin pasarse ni dejar huecos.
  function drawRemainingBottom(img, destY) {
    const remaining = canvas.height - destY;
    if (remaining >= img.height) {
      ctx.drawImage(img, 0, destY);
      return img.height;
    }
    if (remaining <= 0) return 0;
    const sourceY = img.height - remaining;
    ctx.drawImage(img, 0, sourceY, img.width, remaining, 0, destY, img.width, remaining);
    return remaining;
  }

  let cursorY = 0;
  outerOffsets.forEach((_offset, i) => {
    const isLastOuterStep = i === outerOffsets.length - 1;

    if (i !== containerStepIndex) {
      const img = outerImages[i];
      if (!isLastOuterStep) {
        ctx.drawImage(img, 0, cursorY);
        cursorY += img.height;
      } else {
        cursorY += drawRemainingBottom(img, cursorY);
      }
      return;
    }

    // Franja estática de arriba del contenedor (header, breadcrumbs) dentro de este paso.
    ctx.drawImage(first, 0, 0, first.width, rectTop, 0, cursorY, first.width, rectTop);
    cursorY += rectTop;

    if (containerAxis === "y") {
      subImages.forEach((img, j) => {
        if (j === 0) {
          ctx.drawImage(img, rectLeft, rectTop, rectWidth, rectHeight, rectLeft, cursorY, rectWidth, rectHeight);
          cursorY += rectHeight;
          return;
        }
        const isLastSub = j === subImages.length - 1;
        if (!isLastSub) {
          ctx.drawImage(img, rectLeft, rectTop, rectWidth, rectHeight, rectLeft, cursorY, rectWidth, rectHeight);
          cursorY += rectHeight;
          return;
        }
        const prevLocalBottom = containerOffsets[j - 1] + containerClientSize;
        const overlapPx = Math.round(Math.max(prevLocalBottom - containerOffsets[j], 0) * dpr);
        const sh = rectHeight - overlapPx;
        if (sh > 0) {
          ctx.drawImage(img, rectLeft, rectTop + overlapPx, rectWidth, sh, rectLeft, cursorY, rectWidth, sh);
          cursorY += sh;
        }
      });
    } else {
      subImages.forEach((img, j) => {
        if (j === 0) {
          ctx.drawImage(img, 0, rectTop, first.width, rectHeight, 0, cursorY, first.width, rectHeight);
          cursorY += rectHeight;
          return;
        }
        // fondo de la fila: conserva los márgenes laterales del contenedor, si los hay
        ctx.drawImage(first, 0, rectTop, first.width, rectHeight, 0, cursorY, first.width, rectHeight);
        const prevRightLocal = containerOffsets[j - 1] + containerClientSize;
        const overlapPx = Math.round(Math.max(prevRightLocal - containerOffsets[j], 0) * dpr);
        const sx = rectLeft + overlapPx;
        const sw = rectWidth - overlapPx;
        if (sw > 0) {
          ctx.drawImage(img, sx, rectTop, sw, rectHeight, sx, cursorY, sw, rectHeight);
        }
        cursorY += rectHeight;
      });
    }

    // Franja estática de abajo del contenedor, tomada del mismo frame de referencia.
    const belowHeight = first.height - (rectTop + rectHeight);
    if (belowHeight > 0) {
      const h = Math.min(belowHeight, Math.max(canvas.height - cursorY, 0));
      if (h > 0) {
        ctx.drawImage(first, 0, rectTop + rectHeight, first.width, h, 0, cursorY, first.width, h);
        cursorY += h;
      }
    }
  });
}

function drawAnnotationBand(targetCtx, width, y, text) {
  const bandHeight = 34;
  targetCtx.save();
  targetCtx.fillStyle = "rgba(17, 24, 39, 0.85)";
  targetCtx.fillRect(0, y, width, bandHeight);
  targetCtx.fillStyle = "#e5e7eb";
  targetCtx.font = "14px system-ui, sans-serif";
  targetCtx.textBaseline = "middle";
  targetCtx.fillText(text, 12, y + bandHeight / 2);
  targetCtx.restore();
  return bandHeight;
}

function buildAnnotationText() {
  return `${pageUrlInput.value}   •   ${capturedAtInput.value}`;
}

function buildFinalCanvas() {
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = canvas.width;
  const bandHeight = annotateEnabled.checked ? 34 : 0;
  finalCanvas.height = canvas.height + bandHeight;
  const fctx = finalCanvas.getContext("2d");
  fctx.drawImage(canvas, 0, 0);
  if (annotateEnabled.checked) {
    drawAnnotationBand(fctx, finalCanvas.width, canvas.height, buildAnnotationText());
  }
  return finalCanvas;
}

function exportPng() {
  const finalCanvas = buildFinalCanvas();
  const link = document.createElement("a");
  link.download = "scrollshot.png";
  link.href = finalCanvas.toDataURL("image/png");
  link.click();
}

async function copyImage() {
  const finalCanvas = buildFinalCanvas();
  const blob = await new Promise((resolve) => finalCanvas.toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const bandHeight = annotateEnabled.checked ? 34 : 0;
  const pdfHeight = canvas.height + bandHeight;
  const doc = new jsPDF({
    orientation: canvas.width > pdfHeight ? "l" : "p",
    unit: "px",
    format: [canvas.width, pdfHeight],
  });

  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);

  if (annotateEnabled.checked) {
    doc.setFillColor(17, 24, 39);
    doc.rect(0, canvas.height, canvas.width, bandHeight, "F");
    doc.setTextColor(229, 231, 235);
    doc.setFontSize(12);
    doc.text(buildAnnotationText(), 12, canvas.height + bandHeight / 2 + 4);
  }

  doc.save("scrollshot.pdf");
}

moreBtn.addEventListener("click", () => morePanel.classList.toggle("hidden"));
exportPngBtn.addEventListener("click", exportPng);
exportPdfBtn.addEventListener("click", exportPdf);
copyImageBtn.addEventListener("click", async () => {
  const original = copyImageBtn.textContent;
  try {
    await copyImage();
    copyImageBtn.textContent = "¡Copiado!";
  } catch (err) {
    copyImageBtn.textContent = "Error al copiar";
  } finally {
    setTimeout(() => {
      copyImageBtn.textContent = original;
    }, 1500);
  }
});

(async function init() {
  const capture = await loadCapture();
  pageUrlInput.value = capture.pageUrl;
  capturedAtInput.value = formatLocalDateTime(capture.capturedAt);
  if (capture.mode === "hybrid") {
    await stitchHybrid(capture);
  } else {
    await stitchShots(capture);
  }
})();
