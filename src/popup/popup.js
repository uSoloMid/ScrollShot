const button = document.getElementById("capture-btn");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Capturando…";

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    status.textContent = "No se encontró la pestaña activa.";
    button.disabled = false;
    return;
  }

  chrome.runtime.sendMessage({ type: "CAPTURE_START", tabId: activeTab.id }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = `Error: ${chrome.runtime.lastError.message}`;
      button.disabled = false;
      return;
    }
    if (response?.ok) {
      window.close();
    } else {
      status.textContent = response?.error || "No se pudo capturar la página.";
      button.disabled = false;
    }
  });
});
