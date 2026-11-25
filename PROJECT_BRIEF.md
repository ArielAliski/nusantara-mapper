# Project: Interactive Historical Map of the Nusantara Region (~1500 BC – 2026 AD)

## Goal
Build an interactive web visualization of the Nusantara region (modern Indonesia, Malaysia, Singapore, Brunei, Timor-Leste, southern Philippines, southern Thailand and nearby areas) showing how political territories changed from roughly 1500 BC to 2026 AD. The user drags a time slider and the map updates to show the polities that existed in that year. Clicking a polity opens an info panel.

## Core features

1. **Map**
   - Pan/zoom map centered on the Southeast Asian maritime region (Indonesian archipelago as focus).
   - Each polity is a filled polygon with its own distinct color, and its name is labeled on the map.
   - Polygons update when the year changes. Where a territory changes over time, show the correct extent for the selected year, with smooth transitions where feasible.

2. **Time slider**
   - Range: 1500 BC to 2026 AD, with a proper BC/AD year display (no year 0).
   - Use a non-linear or segmented scale. Ancient periods are sparse and recent periods are dense, so a linear scale would make the modern era unusable.
   - Include quick-jump markers for key eras (e.g. Srivijaya, Majapahit, Sultanates, VOC, Dutch East Indies, Japanese occupation, Independence, Present).
   - Include a play/pause button that animates through time, and allow keyboard arrow-key stepping.

3. **Info panel (on click)**
   - Flag or emblem (use a placeholder where none exists, and only use properly licensed images, e.g. Wikimedia Commons public domain)
   - Name (including local and alternative names), start and end dates, capital
   - Short history summary (2–4 sentences)
   - Rulers, religion(s), and notable events
   - Sources and a confidence level (High / Medium / Low), with a clear note when the borders are approximate

4. **Reference examples to verify against**
   - 2026: Indonesia, Malaysia, Singapore, Brunei, Timor-Leste, etc.
   - 1890: Dutch East Indies, British Straits Settlements and Malay states, Portuguese Timor, Sarawak under the Brookes, and other surviving sultanates/kingdoms (e.g. Aceh, Bali kingdoms, Sulu).
   - Ancient and classical periods: cultural/early-state zones, then Kutai, Tarumanagara, Srivijaya, Mataram, Majapahit, early sultanates, and so on.

## Data approach (important)
- Ancient borders are not precisely known. Do not present them as fact.
- Use existing open historical datasets where they cover the period (for example Historical Basemaps or similar open GeoJSON sources, checking each one's license), and hand-draw approximated GeoJSON polygons for earlier kingdoms.
- Every polity must carry metadata: `confidence`, `sources`, and `boundary_type` (e.g. "approximate", "zone of influence", "documented").
- For low-confidence ancient polities, render them visually as softer or hatched zones instead of hard borders, and include a short legend explaining this.
- Store all data as structured, human-editable files (GeoJSON plus JSON/YAML metadata), separate from the UI code, so entries can be added or corrected easily.

## Tech stack
You decide. Constraints:
- Static site, no backend required, easy to deploy (e.g. Vercel, GitHub Pages, Netlify).
- A mapping library suited to time-filtered vector polygons (MapLibre GL or Leaflet are likely candidates).
- Explain briefly why you chose the stack before building.

## Suggested process
1. First propose the stack, the data schema (polity, time-slice geometry, metadata), and a folder structure. Wait for my confirmation.
2. Build a working skeleton with the map, slider, and 5–10 sample polities across different eras, to validate the approach.
3. Expand the dataset in batches by era, flagging anything you are unsure about instead of inventing details.
4. Polish the UI: responsive layout (usable on mobile), accessibility, and performance.

## Quality requirements
- Historical accuracy over completeness. If unsure, mark low confidence or leave it out.
- Make clear which data are approximated.
- Clean, modern UI; the layout should work on desktop and mobile.
- Provide a README covering how to run it, how the data is structured, and how to add a new polity.
- The UI is English only.

## Out of scope (for now)
Backend or user accounts, editing from the UI, other languages, and areas outside the Nusantara region.