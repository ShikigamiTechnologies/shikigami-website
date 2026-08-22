# Cypher Batch B synthetic dataset

The generator creates exactly 300 fictional business documents. No customer or third-party data is included. Names, addresses, relationships, amounts and identifiers are algorithmically produced from seed `CYPHER-BATCH-B-2026-08-15-v3`; the output is dedicated to the public domain under CC0-1.0.

Generated PNG/JPEG/PDF files, OCR results and the XLSX are written to the ignored `test-artifacts/cypher-batch-b/` directory. The 300 artifacts are byte-distinct and cross-balanced across all 90 language/type/difficulty cells, with independent layout, font, ordering, and table variants. PDF OCR independently rasterizes actual PDF bytes with the bundled, version-pinned Poppler `pdftoppm` executable into fresh temporary page images; there are no manifest rasters, generator helper rasters, or filename shortcuts.

Create the immutable pre-run artifact once with `npm run batch-b:freeze`, then reproduce with `npm run batch-b:verify`. The generator writes `manifest.json`, scorer-only `ground-truth.jsonl`, and `hashes.sha256`; it then verifies a second generation has byte-identical hashes.

Runtime dependencies: Tesseract.js 7.0.0 (Apache-2.0), `@tesseract.js-data/eng` 1.0.0 and `/spa` 1.0.0 (MIT), pdf-lib 1.17.1 (MIT), JSZip 3.10.1 (MIT), and Sharp 0.35.0 (Apache-2.0). Language data and WASM are loaded from installed packages, not a CDN. XLSX output is generated as minimal OOXML with JSZip and must pass the independent ZIP/XML reopen gate; ExcelJS and its vulnerable transitive dependency path are absent.

Ground truth is loaded only after all extraction completes and appears only in scorer outputs. Workbook content is built solely from OCR/extraction/result/error records and contains no ground-truth corrections. Human correction time remains deferred to the Batch D pilot.
