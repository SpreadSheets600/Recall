# Recall Memory Lane - Chrome Extension

Intelligent offline web clipper powered by the **Defuddle** library, with automatic extraction, configurable dwell time, website categorization, and semantic local indexing.

---

## Features

1. **Defuddle Article & Content Extraction**:
   - Parses modern webpages with KePano's Defuddle readability engine.
   - Extracts clean markdown, title, description, schema metadata, and tags without layout mutations.

2. **Configurable Wait-Time Before Ingestion**:
   - Set required dwell duration in settings (e.g., 3s, 5s, 10s, 30s).
   - Only automatically ingests pages after you have actively stayed on them for this duration.
   - Prevents noisy clipping of tabs opened and closed immediately.

3. **Automatic Ingestion Toggle**:
   - Toggle on/off automatic extraction per your preference.
   - Manual **"Extract & Save Now"** button is always accessible in the popup.

4. **Active Dwell-Time Tracking**:
   - Accurately tracks active focus time (`document.visibilityState === "visible"`).
   - Syncs heartbeats to Recall backend (`POST /api/extension/dwell`).
   - Memories with higher dwell time receive prioritized relevance boosts in search ranking.

5. **Website Type Categorization & Ranking**:
   - Categorizes visited sites into:
     - `docs` (GitHub, documentation, devdocs, MDN)
     - `article` (Medium, Substack, Dev.to, blog posts)
     - `academic` (ArXiv, PubMed, ResearchGate, .edu)
     - `social` (Reddit, Twitter/X, Hacker News)
     - `media` (YouTube, Vimeo)
     - `ecommerce` (Amazon, Shopify)
     - `general`
   - High-value knowledge types (`docs`, `academic`, `article`) receive ranking boosts.
   - Dedicated filter dropdowns in Recall Search Studio.

---

## Installation in Chrome / Brave / Edge

1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** (top-right corner).
3. Click **Load unpacked** (top-left).
4. Select the `extension/` directory inside this repository (`/home/dev/Projects/MemoryLane/extension`).
5. The **Recall Web Clipper** extension icon will appear in your browser toolbar!

---

## Endpoints Provided by Recall Backend

- `POST /api/extension/ingest` - Ingests webpage content with Defuddle markdown, title, description, website type, and dwell time.
- `POST /api/extension/dwell` - Updates dwell time for active tabs.
- `GET /api/graph` - Spider-web knowledge graph of terms and memories.
