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
  const { shots, offsets, viewportHeight, viewportWidth, devicePixelRatio, scrollHeight } =
    capture;
  const images = await Promise.all(shots.map(loadImage));

  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(scrollHeight * dpr);

  images.forEach((img, i) => {
    const destY = Math.round(offsets[i] * dpr);
    if (i === 0) {
      ctx.drawImage(img, 0, destY);
      return;
    }
    const prevBottom = Math.round((offsets[i - 1] + viewportHeight) * dpr);
    if (destY >= prevBottom) {
      ctx.drawImage(img, 0, destY);
      return;
    }
    // el último tramo se solapa con el anterior (se recortó al fondo real de la página):
    // solo se dibuja la porción inferior que aún no se había pintado.
    const overlap = prevBottom - destY;
    const sourceY = overlap;
    const sourceHeight = img.height - sourceY;
    ctx.drawImage(img, 0, sourceY, img.width, sourceHeight, 0, prevBottom, img.width, sourceHeight);
  });
}

async function stitchContainerShots(capture) {
  const {
    shots,
    offsets,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    containerRect,
    containerScrollHeight,
    containerClientHeight,
  } = capture;
  const images = await Promise.all(shots.map(loadImage));

  const dpr = devicePixelRatio || 1;
  const rectTop = Math.round(containerRect.top * dpr);
  const rectLeft = Math.round(containerRect.left * dpr);
  const rectWidth = Math.round(containerRect.width * dpr);
  const rectHeight = Math.round(containerRect.height * dpr);
  const extra = Math.round((containerScrollHeight - containerClientHeight) * dpr);

  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(viewportHeight * dpr) + extra;

  // El primer frame aporta todo lo estático fuera del contenedor (header, márgenes,
  // footer). Lo que queda debajo del contenedor se reubica más abajo, empujado por
  // el alto extra que agrega el contenido oculto por el scroll interno.
  const first = images[0];
  ctx.drawImage(first, 0, 0, first.width, rectTop, 0, 0, first.width, rectTop);
  const belowHeight = first.height - (rectTop + rectHeight);
  if (belowHeight > 0) {
    ctx.drawImage(
      first,
      0, rectTop + rectHeight, first.width, belowHeight,
      0, rectTop + rectHeight + extra, first.width, belowHeight
    );
  }

  images.forEach((img, i) => {
    const destY = rectTop + Math.round(offsets[i] * dpr);
    if (i === 0) {
      ctx.drawImage(img, rectLeft, rectTop, rectWidth, rectHeight, rectLeft, destY, rectWidth, rectHeight);
      return;
    }
    const prevBottom = rectTop + Math.round((offsets[i - 1] + containerClientHeight) * dpr);
    if (destY >= prevBottom) {
      ctx.drawImage(img, rectLeft, rectTop, rectWidth, rectHeight, rectLeft, destY, rectWidth, rectHeight);
      return;
    }
    // el último tramo se solapa con el anterior (se recortó al fondo real del contenedor):
    // solo se dibuja la porción inferior que aún no se había pintado.
    const overlap = prevBottom - destY;
    const sourceY = rectTop + overlap;
    const sourceHeight = rectHeight - overlap;
    ctx.drawImage(img, rectLeft, sourceY, rectWidth, sourceHeight, rectLeft, prevBottom, rectWidth, sourceHeight);
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
  if (capture.mode === "container") {
    await stitchContainerShots(capture);
  } else {
    await stitchShots(capture);
  }
})();
