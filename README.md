# GS1-128 Generator & Verifier

Browser-based tool for generating and validating GS1-128 barcodes on food production labels. Built for logistics workflows with SSCC tracking, print-ready layouts.

No build step or server required — open `index.html` in **Chrome or Edge** (or another Chromium-based browser) so data can be saved to disk.

**Requires a Chromium-based browser** for **Connect folder** and JSON file saving. You can generate and verify labels in any modern browser without connecting a folder — data is stored in `localStorage` until you use **Connect folder** to write JSON files to disk.

## Features

### Generate labels

- **Up to three GS1-128 barcodes per label**
  - **Product** — GTIN-14 (AI 02), production date (11), best before (15), use-by (17), net weight kg (3102), count (37)
  - **Batch / Lot** — AI 10
  - **SSCC** — AI 00, auto-assigned when a GS1 company prefix is configured (optional on the printed label)
- **Label header** — item description and field summary (not encoded in the barcodes)
- **Batch production** — generate up to 50 labels, each with a unique SSCC when prefix is configured
- **Saved items** — store and reload product presets (GTIN, weight, count, description)
- **Print layout** — label size presets, DPI/bar sizing for Zebra ZT420, human-readable text (HRI), optional SSCC barcode/header, and a print stylesheet that outputs one label per page
- **Verify label** — send generated data strings to the Verify tab for decoding
- **Copy data strings** — copy raw GS1 strings to the clipboard

When a GS1 company prefix is configured, SSCCs are reserved on **Generate barcodes** and shown in the preview. They are written to the log and serial counter only when you click **Print labels** (whether or not you complete the print dialog). Regenerating without printing reuses the same serials. Without a prefix, product and batch barcodes still generate and a warning is shown — no SSCC is assigned.

### Verify / decode

Paste scanner output or `(AI)value` notation. The verifier parses FNC1-separated strings, decodes application identifiers, and flags errors and warnings (check digits, date formats, GS1-82 charset, length limits).

**Scan from photo** — on the Verify tab, use **Take photo** (rear camera) or **Choose photo** (gallery), or drag-and-drop on desktop, to decode CODE128 barcodes (JPEG, PNG, WebP, GIF, BMP, AVIF, TIFF). The photo scans automatically after selection. Works offline when you open `index.html` directly; no local server. Chrome or Edge recommended on mobile. HEIC/HEIF (common on iPhone) is not supported — use JPEG or PNG. For best results, crop the photo to a single barcode; full labels with three barcodes may need several tries or better lighting.

### Data persistence

| File | Purpose |
|------|---------|
| `sscc-prefix.json` | GS1 company prefix and serial counter (`sscc_current_sequence`) used to build SSCC (AI 00) |
| `sscc-issued-log.json` | Audit log of issued SSCCs — prevents reuse (assignment uses `sscc-prefix.json`; `nextCounter` in older log files is legacy and ignored) |
| `saved-items.json` | Saved product presets |

Use **Connect folder** in a Chromium-based browser (Chrome, Edge, etc.) to read and write these files via the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API). The SSCC log and prefix config save when you **Print labels**; saved items save when you click **Save** or **Delete** in the preset list.

The connected folder is remembered across reloads via **IndexedDB** (no need to reconnect every session, as long as the browser still has permission).

If directory picking is unavailable, the app can fall back to linking **only** `sscc-issued-log.json` via a file picker — other files then stay in the browser until you connect a full folder.

**Browser-only fallback:** if you have not connected a folder (or the File System Access API is unavailable), data is stored in `localStorage` for that browser profile. Generate and verify work normally; data survives reloads in the same browser but is **not** written to the JSON files and does not sync across browsers or machines.

## Quick start

1. Clone or download this repository.
2. Open `index.html` in **Chrome or Edge** (required for saving data to disk).
3. Click **Connect folder** in the **Data** section and choose a directory for the JSON data files.
4. Enter your **GS1 company prefix** in Data and click **Save** (writes to `sscc-prefix.json` when a folder is connected).
5. Fill in product fields (or use **Load example**), then click **Generate barcodes**.
6. Use **Print labels**, **Verify label**, or **Copy data strings** as needed.

**Load example** works without a configured prefix — it fills demo product and batch fields. A demo SSCC is shown only when a GS1 company prefix is configured.

## SSCC configuration

SSCCs are built as: **extension digit (0) + GS1 company prefix + serial reference + Mod-10 check digit** = 18 digits.

The company prefix and serial counter live in `sscc-prefix.json`:

```json
{
  "version": 1,
  "company_prefix": "579000000001",
  "prefixes": [
    {
      "id": "default",
      "name": "Default",
      "sscc_current_sequence": 1
    }
  ]
}
```

- **`company_prefix`** — your GS1-assigned company prefix (set in the Data tab or edited in the file). Not derived from the product GTIN.
- **`sscc_current_sequence`** — the next serial reference to use. Incremented and saved when you **Print labels** after generating.
- **`prefixes[]`** — must contain exactly one entry for SSCC assignment. Multiple entries cause SSCC to be skipped with a warning.
- **Serial capacity** depends on prefix length: prefix + serial share 16 digits, so a longer prefix allows fewer serials (shown as a hint under the prefix field). A 12-digit prefix allows serials 0–9999; a 7-digit prefix allows up to 999,999,999.

On first save from the Data tab, a default `prefixes[]` entry is created if the file has none.

## Required fields

To generate a label, you must provide:

- Item description
- GTIN-14 (14 digits, check digit validated)
- Batch / Lot (GS1-82 charset, max 20 characters)
- Production date
- Best before date
- Count

Optional: use-by date, net weight (kg), GS1 company prefix (for real SSCC assignment).

## Project structure

```
.
├── index.html                # Single-page app (UI + storage + rendering)
├── favicon.svg               # App icon
├── sscc-prefix.json          # GS1 company prefix + serial counter (starter empty)
├── sscc-issued-log.json      # Example / starter SSCC audit log (empty)
├── saved-items.json          # Example / starter saved-items catalog (empty)
├── lib/
│   ├── gs1-core.js           # Pure GS1-128 logic (no DOM; usable in Node)
│   ├── barcode-scan.js       # Photo CODE128 scanner wrapper
│   ├── zbar-wasm-inlined.js  # ZBar WASM (inlined, file:// safe)
│   ├── jsbarcode/            # JsBarcode (CODE128 rendering)
│   └── tabler-icons/         # Tabler Icons (UI)
└── README.md
```

## Browser support

| Feature | Requirement |
|---------|-------------|
| **Saving data to JSON files** | **Chromium-based browser** with [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) — **Chrome or Edge** |
| Generate / verify labels | Works in any modern browser; without **Connect folder**, data stays in `localStorage` only |
| **Photo scan (Verify tab)** | **Chrome or Edge** — WASM + `createImageBitmap` EXIF orientation; works on `file://` |
| Clipboard copy | Secure context (`https://` or `http://localhost`) for the Clipboard API; falls back to legacy copy otherwise |

## Dependencies

Third-party libraries are vendored under `lib/`:

- [JsBarcode](https://github.com/lindell/JsBarcode) — barcode rendering
- [@undecaf/zbar-wasm](https://github.com/undecaf/zbar-wasm) — CODE128 photo scanning (LGPL-2.1)
- [Tabler Icons](https://tabler.io/icons) — UI icons

GS1 encoding, validation, and parsing live in `lib/gs1-core.js`.
