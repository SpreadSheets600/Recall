/**
 * Recall Memory Lane - Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  const elStatus = document.getElementById("server-status");
  const elTitle = document.getElementById("page-title");
  const elDomain = document.getElementById("domain-name");
  const elType = document.getElementById("website-type");
  const elDwell = document.getElementById("dwell-display");
  const btnExtract = document.getElementById("btn-extract");
  const toggleAuto = document.getElementById("toggle-auto");
  const selectWait = document.getElementById("select-wait-time");
  const inputBackend = document.getElementById("input-backend-url");
  const btnDashboard = document.getElementById("btn-open-dashboard");

  const inputQuickTitle = document.getElementById("input-quick-title");
  const inputQuickContent = document.getElementById("input-quick-content");
  const btnSaveNote = document.getElementById("btn-save-note");

  let currentTab = null;

  // 1. Load settings
  const settings = await chrome.storage.local.get({
    autoExtractEnabled: true,
    minWaitSeconds: 5,
    backendUrl: "http://localhost:8000",
  });

  toggleAuto.checked = !!settings.autoExtractEnabled;
  selectWait.value = String(settings.minWaitSeconds || 5);
  inputBackend.value = settings.backendUrl || "http://localhost:8000";

  // 2. Check Server Health
  async function checkServer() {
    try {
      const resp = await fetch(`${settings.backendUrl}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (resp.ok) {
        elStatus.textContent = "● Online";
        elStatus.className = "status-indicator";
      } else {
        throw new Error("Bad response");
      }
    } catch {
      elStatus.textContent = "● Offline";
      elStatus.className = "status-indicator offline";
    }
  }
  checkServer();

  // 3. Inspect Current Tab & Content Script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (tab && tab.url) {
    try {
      const urlObj = new URL(tab.url);
      elDomain.textContent = urlObj.hostname;
      elTitle.textContent = tab.title || urlObj.hostname;

      // Ask content script for real-time status
      chrome.tabs.sendMessage(tab.id, { action: "get_status" }, (res) => {
        if (chrome.runtime.lastError || !res) {
          if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
            elTitle.textContent = "Browser Internal Page";
            btnExtract.disabled = true;
            btnExtract.textContent = "Cannot clip internal page";
          }
          return;
        }

        if (res.title) elTitle.textContent = res.title;
        if (res.websiteType) {
          elType.textContent = res.websiteType;
        }
        if (res.dwellSeconds !== undefined) {
          elDwell.textContent = `${res.dwellSeconds}s dwell`;
        }
        if (res.extracted) {
          btnExtract.textContent = "✓ Ingested & Saved";
          btnExtract.style.backgroundColor = "#10b981";
        }
      });
    } catch {
      elTitle.textContent = "Invalid URL";
    }
  }

  // 4. Save Settings Changes
  async function persistSettings() {
    const updated = {
      autoExtractEnabled: toggleAuto.checked,
      minWaitSeconds: parseInt(selectWait.value, 10) || 5,
      backendUrl: inputBackend.value.trim() || "http://localhost:8000",
    };
    await chrome.storage.local.set(updated);
    if (currentTab && currentTab.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: "settings_updated" }, () => {});
    }
  }

  toggleAuto.addEventListener("change", persistSettings);
  selectWait.addEventListener("change", persistSettings);
  inputBackend.addEventListener("change", persistSettings);

  // 5. Manual Extract Now
  btnExtract.addEventListener("click", async () => {
    if (!currentTab || !currentTab.id) return;
    btnExtract.disabled = true;
    btnExtract.textContent = "Clipping with Defuddle…";

    chrome.tabs.sendMessage(currentTab.id, { action: "extract_now" }, (res) => {
      if (res && res.ok) {
        btnExtract.textContent = "✓ Saved to Recall!";
        btnExtract.style.backgroundColor = "#10b981";
      } else {
        btnExtract.disabled = false;
        btnExtract.textContent = "Clip Failed (Retry)";
        btnExtract.style.backgroundColor = "#ef4444";
      }
    });
  });

  // 6. Quick Note Save
  if (btnSaveNote) {
    btnSaveNote.addEventListener("click", async () => {
      const title = inputQuickTitle.value.trim();
      const content = inputQuickContent.value.trim();
      if (!content && !title) return;

      btnSaveNote.disabled = true;
      btnSaveNote.textContent = "Saving note…";

      try {
        const resp = await fetch(`${settings.backendUrl}/api/memories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "text",
            title: title || (currentTab ? `Note on ${currentTab.title}` : "Quick Note"),
            content: content,
            source: currentTab ? currentTab.url : "extension-popup",
          }),
        });

        if (resp.ok) {
          btnSaveNote.textContent = "✓ Note Saved";
          btnSaveNote.style.color = "#10b981";
          inputQuickTitle.value = "";
          inputQuickContent.value = "";
          setTimeout(() => {
            btnSaveNote.textContent = "Save Quick Note";
            btnSaveNote.disabled = false;
            btnSaveNote.style.color = "";
          }, 2000);
        } else {
          throw new Error("Failed");
        }
      } catch {
        btnSaveNote.disabled = false;
        btnSaveNote.textContent = "Save Failed (Retry)";
      }
    });
  }

  // 7. Open Dashboard Button
  btnDashboard.addEventListener("click", () => {
    chrome.tabs.create({ url: settings.backendUrl });
  });
});
