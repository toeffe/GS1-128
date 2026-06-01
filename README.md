# GS1-128 Generator & Verifier

Browser-based tool for generating and validating GS1-128 barcodes on food production labels. Built for logistics workflows with SSCC tracking, print-ready layouts.

No build step or server required — open the HTML file in a browser and go.

## Features

### Generate labels

- **Three GS1-128 barcodes per label**
  - **Product** — GTIN-14 (AI 02), production date (11), best before (15), use-by (17), net weight kg (3102), count (37)
  - **Batch / Lot** — AI 10
  - **SSCC** — AI 00, auto-assigned with check-digit validation
- **Label header** — item description and field summary (not encoded in the barcodes)
- **Batch production** — generate up to 50 labels, each with a unique SSCC
- **Saved items** — store and reload product presets (GTIN, weight, count, description)
- **Print layout** — label size presets, DPI/bar sizing for Zebra printer, human-readable text (HRI), and a print stylesheet that outputs one label per page

### Verify / decode

Paste scanner output or `(AI)value` notation. The verifier parses FNC1-separated strings, decodes application identifiers, and flags errors and warnings (check digits, date formats, GS1-82 charset, length limits).

### Data persistence

| File | Purpose |
|------|---------|
| `sscc-issued-log.json` | Issued SSCCs and the next serial counter — prevents reuse |
| `saved-items.json` | Saved product presets |

**Connect folder** (Chrome/Edge) writes these files directly via the File System Access API. Without folder access, data is kept in `localStorage` and can be exported or imported as JSON.

## Quick start

1. Clone or download this repository.
2. Open `gs1-128.html` in a modern browser (Chrome or Edge recommended for folder sync).
3. Optionally click **Connect folder** and choose a directory for the JSON data files.
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

Optional: use-by date, net weight (kg), SSCC override (otherwise assigned automatically).

## Project structure

```
Barcode/
├── gs1-128.html              # Single-page app (UI + storage + rendering)
├── lib/
│   ├── gs1-core.js           # Pure GS1-128 logic (no DOM; usable in Node)
│   ├── jsbarcode/            # JsBarcode (CODE128 rendering)
│   └── tabler-icons/         # Tabler Icons (UI)
└── README.md
```

## Browser support

| Feature | Requirement |
|---------|-------------|
| Core app | Any modern browser with JavaScript enabled |
| Connect folder / auto-save | Chromium-based browser with [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (Chrome, Edge) |
| Clipboard copy | Secure context (`https://` or `http://localhost`) for the Clipboard API; falls back to legacy copy otherwise |

## Dependencies

Third-party libraries are vendored under `lib/`:

- [JsBarcode](https://github.com/lindell/JsBarcode) — barcode rendering
- [Tabler Icons](https://tabler.io/icons) — UI icons

GS1 encoding, validation, and parsing live in `lib/gs1-core.js`.
