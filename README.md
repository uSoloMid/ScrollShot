# ScrollShot

Extensión de Chrome (Manifest V3) para capturar la página completa (scroll automático + stitching) y exportarla a PNG o PDF. Incluye un editor donde puedes anotar la URL y la fecha/hora de captura antes de exportar.

## Estado

MVP funcional local. Aún no publicada en la Chrome Web Store.

## Estructura

```
manifest.json
src/
  popup/           botón para iniciar la captura
  background/      orquesta scroll + captureVisibleTab
  content/         mide la página y controla el scroll
  editor/          une las capturas, anota y exporta PDF/PNG
lib/               jsPDF (vendorizado, sin llamadas a red)
icons/             íconos placeholder (generados con scripts/generate-icons.js)
```

## Cómo funciona

1. El popup pide al background iniciar la captura de la pestaña activa.
2. El background le pregunta al content script las métricas de la página (alto total, viewport, DPR).
3. El background hace scroll por tramos del alto del viewport y llama a `chrome.tabs.captureVisibleTab` en cada tramo (con una espera para no exceder el límite de ~2 capturas/segundo de Chrome).
4. Las capturas + metadatos se guardan en `chrome.storage.local` y se abre `editor.html` en una pestaña nueva.
5. El editor une las imágenes en un `<canvas>` (recortando el solape del último tramo) y permite exportar a PNG/PDF, con opción de agregar una franja con la URL y fecha de captura.

## Limitaciones conocidas (v0.1)

- No deduplica headers/barras `position: sticky` o `fixed` — aparecerán repetidos en cada tramo.
- No espera contenido lazy-load más allá de un margen fijo de 200ms.
- Sin mecanismo de licencia/premium real — el panel "Más" (anotar URL/fecha) está siempre disponible.

## Instalar en Chrome sin publicar (modo desarrollador)

1. `npm install` (solo para regenerar `lib/jspdf.umd.min.js` si lo actualizas).
2. Abre `chrome://extensions` en Chrome.
3. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
4. Clic en **Cargar descomprimida** (Load unpacked).
5. Selecciona la carpeta `c:\dev\ScrollShot` (la que contiene `manifest.json`).
6. El ícono de ScrollShot aparece en la barra de extensiones. Fíjalo con el ícono de chincheta si quieres acceso rápido.

Cada vez que edites el código:
- Cambios en `popup/`, `editor/` → basta recargar la pestaña o reabrir el popup.
- Cambios en `background/` o `content/` o `manifest.json` → clic en el botón de recargar (⟳) de la extensión en `chrome://extensions`.

## Actualizar jsPDF

```bash
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js lib/jspdf.umd.min.js
```
