/**
 * Recall Web Clipper - Background Service Worker
 */

const DEFAULT_SETTINGS = {
  autoExtractEnabled: true,
  minWaitSeconds: 5,
  backendUrl: "http://localhost:8000",
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const updated = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(updated);
  console.log("[Recall] Extension initialized with settings:", updated);
});

// Message listener for content script notifications and status updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extraction_success") {
    if (sender.tab && sender.tab.id) {
      chrome.action.setBadgeText({
        tabId: sender.tab.id,
        text: "✓",
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: sender.tab.id,
        color: "#10b981", // Emerald green
      });
    }
    sendResponse({ ok: true });
  } else if (message.action === "extraction_timer_started") {
    if (sender.tab && sender.tab.id) {
      chrome.action.setBadgeText({
        tabId: sender.tab.id,
        text: "...",
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: sender.tab.id,
        color: "#6366f1", // Indigo
      });
    }
    sendResponse({ ok: true });
  }
  return true;
});
