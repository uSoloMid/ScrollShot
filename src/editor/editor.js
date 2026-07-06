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

function exportPng() {
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = canvas.width;
  const bandHeight = annotateEnabled.checked ? 34 : 0;
  finalCanvas.height = canvas.height + bandHeight;
  const fctx = finalCanvas.getContext("2d");
  fctx.drawImage(canvas, 0, 0);
  if (annotateEnabled.checked) {
    drawAnnotationBand(fctx, finalCanvas.width, canvas.height, buildAnnotationText());
  }

  const link = document.createElement("a");
  link.download = "scrollshot.png";
  link.href = finalCanvas.toDataURL("image/png");
  link.click();
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

(async function init() {
  const capture = await loadCapture();
  pageUrlInput.value = capture.pageUrl;
  capturedAtInput.value = formatLocalDateTime(capture.capturedAt);
  await stitchShots(capture);
})();
