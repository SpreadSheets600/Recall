/**
 * Recall Memory Lane - Content Script
 * Extracts webpage content via Defuddle with dwell-time tracking and website classification.
 */

(function () {
  // Avoid re-running in nested iframes
  if (window.top !== window.self) return;

  const STATE = {
    url: window.location.href,
    domain: window.location.hostname,
    dwellSeconds: 0,
    isActive: !document.hidden,
    extracted: false,
    extracting: false,
    memoryId: null,
    timerId: null,
    heartbeatInterval: null,
    settings: {
      autoExtractEnabled: true,
      minWaitSeconds: 5,
      backendUrl: "http://localhost:8000",
    },
  };

  /**
   * Classify website type based on hostname, pathname, and document metadata
   */
  function classifyWebsiteType() {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();

    // Documentation & Code
    if (
      host.includes("github.com") ||
      host.includes("gitlab.com") ||
      host.includes("stackoverflow.com") ||
      host.includes("developer.mozilla.org") ||
      host.includes("docs.") ||
      host.startsWith("doc.") ||
      path.includes("/docs/") ||
      path.includes("/documentation/") ||
      path.includes("/api-reference/") ||
      host.includes("readthedocs.io") ||
      host.includes("devdocs.io")
    ) {
      return "docs";
    }

    // Academic & Research
    if (
      host.includes("arxiv.org") ||
      host.includes("biorxiv.org") ||
      host.includes("nih.gov") ||
      host.includes("pubmed") ||
      host.includes("nature.com") ||
      host.includes("sciencedirect.com") ||
      host.includes("researchgate.net") ||
      host.includes("ieee.org") ||
      host.endsWith(".edu") ||
      path.includes("/paper/") ||
      path.includes("/abs/")
    ) {
      return "academic";
    }

    // Articles & Blogs
    if (
      host.includes("medium.com") ||
      host.includes("substack.com") ||
      host.includes("dev.to") ||
      host.includes("techcrunch.com") ||
      host.includes("theverge.com") ||
      host.includes("wired.com") ||
      host.includes("wikipedia.org") ||
      host.startsWith("blog.") ||
      path.includes("/blog/") ||
      path.includes("/article/") ||
      path.includes("/posts/") ||
      document.querySelector('meta[property="og:type"][content="article"]')
    ) {
      return "article";
    }

    // Social Media & Discussion Forums
    if (
      host.includes("reddit.com") ||
      host.includes("twitter.com") ||
      host.includes("x.com") ||
      host.includes("news.ycombinator.com") ||
      host.includes("threads.net") ||
      host.includes("bsky.app") ||
      host.includes("mastodon.") ||
      host.includes("lobste.rs")
    ) {
      return "social";
    }

    // Video & Streaming Media
    if (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("vimeo.com") ||
      host.includes("twitch.tv")
    ) {
      return "media";
    }

    // E-Commerce
    if (
      host.includes("amazon.") ||
      host.includes("ebay.") ||
      host.includes("shopify.com") ||
      host.includes("etsy.com") ||
      path.includes("/product/") ||
      path.includes("/dp/")
    ) {
      return "ecommerce";
    }

    return "general";
  }

  /**
   * Run Defuddle on the current document
   */
  function extractWithDefuddle() {
    try {
      if (typeof window.Defuddle === "function") {
        // Clone document to avoid mutating user layout
        const clone = document.cloneNode(true);
        const def = new window.Defuddle(clone, { markdown: true });
        const res = def.parse();

        let md = res.contentMarkdown || "";
        if (!md && typeof window.defuddleToMarkdown === "function" && res.content) {
          const tempEl = document.createElement("div");
          tempEl.innerHTML = res.content;
          md = window.defuddleToMarkdown(tempEl);
        }

        return {
          title: res.title || document.title || window.location.href,
          description: res.description || "",
          content: md || res.content || document.body.innerText || "",
          markdown: md || "",
          domain: res.domain || window.location.hostname,
          author: res.author || "",
          published: res.published || "",
          tags: Array.isArray(res.tags) ? res.tags.join(", ") : "",
          wordCount: res.wordCount || 0,
        };
      }
    } catch (err) {
      console.warn("[Recall] Defuddle parse fallback:", err);
    }

    // Fallback if Defuddle throws or encounters unsupported DOM node
    const metaDesc =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      "";
    return {
      title: document.title || window.location.href,
      description: metaDesc,
      content: document.body ? document.body.innerText.slice(0, 100000) : "",
      markdown: "",
      domain: window.location.hostname,
      tags: "",
    };
  }

  /**
   * Ingest page contents into Recall backend
   */
  async function performIngestion(isManual = false) {
    if (STATE.extracting) return;
    if (STATE.extracted && !isManual) return;

    STATE.extracting = true;
    const extractedData = extractWithDefuddle();
    const websiteType = classifyWebsiteType();

    const payload = {
      url: STATE.url,
      title: extractedData.title,
      content: extractedData.content,
      markdown: extractedData.markdown,
      description: extractedData.description,
      domain: extractedData.domain,
      website_type: websiteType,
      dwell_time: STATE.dwellSeconds,
      tags: extractedData.tags,
    };

    try {
      const resp = await fetch(`${STATE.settings.backendUrl}/api/extension/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        const res = await resp.json();
        STATE.extracted = true;
        STATE.memoryId = res.id;
        try {
          chrome.runtime.sendMessage({ action: "extraction_success", id: res.id });
        } catch {
          // Extension context might be disconnected
        }
        console.log(`[Recall] Ingested (${websiteType}) after ${STATE.dwellSeconds}s:`, extractedData.title);
      }
    } catch (err) {
      console.warn("[Recall] Failed to send ingestion payload:", err);
    } finally {
      STATE.extracting = false;
    }
  }

  /**
   * Send dwell time updates to backend periodically
   */
  async function syncDwellTime() {
    if (!STATE.extracted || STATE.dwellSeconds <= 0) return;
    try {
      await fetch(`${STATE.settings.backendUrl}/api/extension/dwell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: STATE.url,
          dwell_time: STATE.dwellSeconds,
        }),
        keepalive: true,
      });
    } catch {
      // Ignore background sync errors
    }
  }

  /**
   * Initialize settings from chrome.storage
   */
  async function initSettings() {
    try {
      const stored = await chrome.storage.local.get([
        "autoExtractEnabled",
        "minWaitSeconds",
        "backendUrl",
      ]);
      if (stored.autoExtractEnabled !== undefined) {
        STATE.settings.autoExtractEnabled = stored.autoExtractEnabled;
      }
      if (stored.minWaitSeconds !== undefined) {
        STATE.settings.minWaitSeconds = parseInt(stored.minWaitSeconds, 10) || 5;
      }
      if (stored.backendUrl) {
        STATE.settings.backendUrl = stored.backendUrl;
      }
    } catch {
      // Default settings remain
    }
  }

  /**
   * Track dwell time: 1-second interval checks if document is currently focused/visible
   */
  function startDwellTracker() {
    setInterval(() => {
      if (!document.hidden && document.hasFocus()) {
        STATE.dwellSeconds += 1;

        // Check if wait duration reached for automatic extraction
        if (
          STATE.settings.autoExtractEnabled &&
          !STATE.extracted &&
          !STATE.extracting &&
          STATE.dwellSeconds >= STATE.settings.minWaitSeconds
        ) {
          performIngestion(false);
        }
      }
    }, 1000);

    // Heartbeat every 15s to update backend dwell time for ranking boost
    setInterval(() => {
      syncDwellTime();
    }, 15000);

    // Sync dwell on visibility change / unload
    window.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        syncDwellTime();
      }
    });
    window.addEventListener("pagehide", () => {
      syncDwellTime();
    });
  }

  // Handle messages from the extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_status") {
      sendResponse({
        url: STATE.url,
        domain: STATE.domain,
        title: document.title,
        dwellSeconds: STATE.dwellSeconds,
        extracted: STATE.extracted,
        extracting: STATE.extracting,
        websiteType: classifyWebsiteType(),
        autoExtractEnabled: STATE.settings.autoExtractEnabled,
        minWaitSeconds: STATE.settings.minWaitSeconds,
      });
    } else if (request.action === "extract_now") {
      performIngestion(true).then(() => {
        sendResponse({
          ok: true,
          extracted: STATE.extracted,
          dwellSeconds: STATE.dwellSeconds,
        });
      });
      return true; // Keep sendResponse open for async
    } else if (request.action === "settings_updated") {
      initSettings();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Start initialization
  initSettings().then(() => {
    startDwellTracker();
  });
})();
