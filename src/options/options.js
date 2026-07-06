const SETTINGS_KEY = "scrollshot_settings";
const DEFAULT_SETTINGS = { detectInternalScroll: true };

const checkbox = document.getElementById("detect-internal-scroll");
const saved = document.getElementById("saved");

async function loadSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...settings };
}

(async function init() {
  const settings = await loadSettings();
  checkbox.checked = settings.detectInternalScroll;
})();

checkbox.addEventListener("change", async () => {
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: { detectInternalScroll: checkbox.checked },
  });
  saved.textContent = "Guardado ✓";
  setTimeout(() => {
    saved.textContent = "";
  }, 1500);
});
