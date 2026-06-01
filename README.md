# GS1-128 Generator & Verifier

Browser-based tool for generating and validating GS1-128 barcodes on food production labels. Built for logistics workflows with SSCC tracking, print-ready layouts.

No build step or server required — open `index.html` in **Chrome or Edge** (or another Chromium-based browser) so data can be saved to disk.

**Requires a Chromium-based browser** for **Connect folder** and JSON file saving. You can generate and verify labels in other browsers, but SSCC logs and saved items will not persist to `sscc-issued-log.json` and `saved-items.json`.

## Features

### Generate labels

- **Up to three GS1-128 barcodes per label**
  - **Product** — GTIN-14 (AI 02), production date (11), best before (15), use-by (17), net weight kg (3102), count (37)
  - **Batch / Lot** — AI 10
  - **SSCC** — AI 00, auto-assigned with check-digit validation (optional on the printed label)
- **Label header** — item description and field summary (not encoded in the barcodes)
- **Batch production** — generate up to 50 labels, each with a unique SSCC
- **Saved items** — store and reload product presets (GTIN, weight, count, description)
- **Print layout** — label size presets, DPI/bar sizing for Zebra ZT420, human-readable text (HRI), optional SSCC barcode/header, and a print stylesheet that outputs one label per page

SSCCs are always assigned and logged when you generate, even if **Include SSCC on label** is unchecked.

### Verify / decode

Paste scanner output or `(AI)value` notation. The verifier parses FNC1-separated strings, decodes application identifiers, and flags errors and warnings (check digits, date formats, GS1-82 charset, length limits).

### Data persistence

| File | Purpose |
|------|---------|
| `sscc-issued-log.json` | Issued SSCCs and the next serial counter — prevents reuse |
| `saved-items.json` | Saved product presets |

Use **Connect folder** in a Chromium-based browser (Chrome, Edge, etc.) to read and write these files via the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API). The SSCC log saves automatically on each generate; saved items save when you click **Save** or **Delete** in the preset list.

This is the only supported way to persist data. Non-Chromium browsers cannot use Connect folder; any data in `localStorage` is browser-local and is not written to the JSON files.

## Quick start

1. Clone or download this repository.
2. Open `index.html` in **Chrome or Edge** (required for saving data to disk).
3. Click **Connect folder** and choose a directory for the JSON data files (existing `sscc-issued-log.json` and `saved-items.json` in that folder are loaded automatically).
4. Fill in product fields (or use **Load example**), then click **Generate barcodes**.
5. Use **Print labels** or copy data strings as needed.

## Required fields

To generate a label, you must provide:

- Item description
- GTIN-14 (14 digits, check digit validated)
- Batch / Lot (GS1-82 charset, max 20 characters)
- Production date
- Best before date
- Count

Optional: use-by date, net weight (kg). SSCC is assigned automatically from the GTIN company prefix.

## Project structure

```
Barcode/
├── index.html                # Single-page app (UI + storage + rendering)
├── sscc-issued-log.json      # Example / starter SSCC log (empty)
├── saved-items.json          # Example / starter saved-items catalog (empty)
├── lib/
│   ├── gs1-core.js           # Pure GS1-128 logic (no DOM; usable in Node)
│   ├── jsbarcode/            # JsBarcode (CODE128 rendering)
│   └── tabler-icons/         # Tabler Icons (UI)
└── README.md
```

## Browser support

| Feature | Requirement |
|---------|-------------|
| **Saving data (SSCC log, saved items)** | **Chromium-based browser** with [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) — **Chrome or Edge** |
| Generate / verify labels | Same as above for normal use; other browsers may run the UI but **cannot save to JSON files** |
| Clipboard copy | Secure context (`https://` or `http://localhost`) for the Clipboard API; falls back to legacy copy otherwise |

## Dependencies

Third-party libraries are vendored under `lib/`:

- [JsBarcode](https://github.com/lindell/JsBarcode) — barcode rendering
- [Tabler Icons](https://tabler.io/icons) — UI icons

GS1 encoding, validation, and parsing live in `lib/gs1-core.js`.
