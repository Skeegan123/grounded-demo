# Browser-first PDF document ingestion

> **Superseded implementation research.** Grounded now uses committed schema
> version 2 prepared Document Evidence, not the `DocumentIndex` or Tesseract
> proposal below. Follow [`docs/document-evidence-import.md`](../document-evidence-import.md)
> for the active Reducto Studio export and offline import path. This note remains
> as research history.

## Question

How far can Grounded get with browser-side PDF processing, when does it need OCR, and can the Demo Project use a prepared index without creating a dead end for later user-supplied documents?

This note covers document ingestion architecture only. It does not add document import to the MVP.

## Recommendation

Use PDF.js for viewing and embedded-text extraction. Define one versioned `DocumentIndex` contract that is independent of where extraction runs. Generate that contract ahead of time for the Demo Project and ship the result with the bundled PDFs.

Do not add browser OCR or document import to the MVP. Leave an explicit extraction source on every indexed text run so a later browser pipeline can add Tesseract.js output without changing the contract. If a Demo Project page needs OCR, generate its OCR text during Demo Project preparation and record the source as `ocr`.

This is the smallest choice that avoids a dead end. The prepared index is generated output, not hand-authored knowledge about the Demo Project. A later import pipeline can produce the same output one page at a time.

## What PDF.js can recover

PDF.js is a parser and renderer, not an OCR engine. Its public page API exposes the useful pieces separately:

- `getTextContent()` returns text items. Each item contains the Unicode string, text direction, transform matrix, width, height, font name, and an end-of-line flag. Those values are enough to create positioned text runs in page coordinates. PDF.js normalizes whitespace unless asked not to. [PDF.js `TextItem` and `getTextContent` API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- `getViewport()` returns page dimensions and the transform needed to render PDF user space into a top-left canvas coordinate system. PDF.js's example notes that PDF coordinates start at the bottom left while canvas coordinates start at the top left. [PDF.js rendering example](https://mozilla.github.io/pdf.js/examples/)
- `getStructTree()` returns a structure tree only when the PDF contains one. It otherwise returns `null`. A `DocumentIndex` therefore cannot assume headings, paragraphs, tables, or reading order exist as PDF semantics. [PDF.js `PDFPageProxy` API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)
- `getOperatorList()` exposes the low-level operations used to paint a page. It can reveal vector paths and images, but PDF.js does not provide a high-level "give me the drawing geometry" API. Reconstructing paths means replaying transforms and path operators much like a renderer. [PDF.js operator-list API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html), [PDF.js maintainer explanation of path extraction](https://github.com/mozilla/pdf.js/discussions/21075)

For a vector construction drawing, PDF.js can usually extract text that remains text in the PDF content stream. It can also render linework sharply at arbitrary view scales. It does not infer that a path is a wall, door, revision cloud, or detail callout. Indexing every vector operation would create a large renderer-shaped data set without giving the External Agent construction semantics.

Some visually vector pages still need OCR. Export software can convert letters to outlines. Those letters become paths, so `getTextContent()` has no characters to return. Missing or unusable character mappings can also produce weak extraction. The distinction Grounded cares about is "usable embedded text" versus "words visible only after rendering," not simply vector versus raster.

The `DocumentIndex` should remain a text and location index. It is not a semantic model of the drawing. The original PDF remains authoritative for the Senior Project Manager and for any visual inspection exposed to an External Agent later.

## When OCR is needed

OCR is needed when a page is a scan or image, when text was converted to outlines, or when embedded text extraction is too incomplete to search or inspect. Tesseract itself does not accept PDF input. Tesseract.js gives the same guidance: render the PDF to images first, then recognize those images. [Tesseract input formats](https://tesseract-ocr.github.io/tessdoc/InputFormats.html), [Tesseract.js PDF FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md#are-pdf-files-supported)

A later ingestion pipeline should try embedded text first and make an OCR decision per page. A useful decision can consider:

- extracted character count and text coverage across the page;
- whether the page is dominated by one or more large raster images;
- whether extracted strings contain replacement characters or obvious encoding failures;
- an explicit retry requested by the user when the automatic result is poor.

"No extracted text" is a good OCR trigger, but not a complete detector. A hybrid page may have an extractable title block over a scanned sheet. The pipeline should keep page-level status and allow OCR to replace or supplement embedded extraction. When both sources cover the same area, it must suppress duplicates.

For the Demo Project, inspection can be simpler and more reliable. Run extraction ahead of time, spot-check the pages used in the judging path, and use build-time OCR only on pages that need it.

## Viable browser OCR architecture

The browser path is technically viable:

1. PDF.js loads the PDF bytes and handles parsing in its PDF worker.
2. The ingestion coordinator calls `getTextContent()` for one page.
3. If that text is usable, the normalizer converts text transforms into normalized page boxes and persists the page result.
4. If OCR is required, PDF.js renders that page, or a page region, into a canvas under a fixed pixel budget.
5. A reusable Tesseract.js worker recognizes the canvas. Tesseract.js runs recognition in a Web Worker and accepts `HTMLCanvasElement` and `OffscreenCanvas` inputs. Its optional block output includes text, bounding boxes, and confidence values. [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [Tesseract.js type definitions](https://github.com/naptha/tesseract.js/blob/master/src/index.d.ts)
6. The normalizer maps OCR pixel boxes into the same normalized page coordinates and writes the same page result shape.

Use one OCR worker first. Tesseract.js recommends creating a worker once, reusing it for multiple jobs, and terminating it when finished. Its scheduler can spread many jobs across several workers, but it gives no benefit to a single job and each worker adds memory pressure. [Tesseract.js workers and schedulers](https://github.com/naptha/tesseract.js/blob/master/docs/workers_vs_schedulers.md)

Host the Tesseract worker, WebAssembly core, and English trained data with the application instead of relying on several third-party CDNs. Tesseract.js supports explicit `workerPath`, `corePath`, and `langPath` values, and its browser cache stores trained data in IndexedDB. [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [Tesseract.js `createWorker` options](https://github.com/naptha/tesseract.js/blob/master/docs/api.md#createworkeroptions-worker)

### Performance constraints

The expensive step is rasterization plus OCR, not extraction of embedded text.

Canvas memory grows with pixel count. PDF.js calculates roughly four bytes per canvas pixel and recommends rendering only visible pages. Its example letter page uses about 3.5 MB at 96 DPI and about 14 MB at a 2x device scale. [PDF.js memory guidance](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#i-want-to-render-all-100-pages-in-a-document-at-a-high-resolution-is-it-a-good-idea)

Large-format drawings make this concrete. A 24 by 36 inch sheet rasterized at 150 DPI is 3,600 by 5,400 pixels, about 78 MB for one RGBA buffer. A 36 by 48 inch sheet at the same resolution is about 156 MB. OCR adds its own image copies, WebAssembly memory, and model data. A future browser pipeline therefore needs a pixel budget, page-at-a-time processing, cleanup after each page, cancellation, progress, and probably overlapped tiles for sheets that exceed the budget.

Tesseract.js says input should have enough resolution and notes that upscaling can improve recognition. That competes directly with the canvas memory limit. There is no honest universal page-time estimate in the primary documentation because the result depends on page dimensions, rendering scale, text density, device, and worker count. Grounded should benchmark representative construction sheets on the slowest supported laptop before choosing a DPI or concurrency count. [Tesseract.js recognition API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md#workerrecognizeimage-options-output-jobid-promise)

PDF viewing and OCR should not share one unbounded rendering strategy. For viewing, render only the visible page at a capped viewport size, cancel stale render tasks during navigation or zoom, and release page resources. PDF.js exposes render cancellation and page cleanup for this purpose. [PDF.js `RenderTask.cancel`](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-RenderTask.html), [PDF.js `PDFPageProxy.cleanup`](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)

When PDFs are served over HTTP, PDF.js can use range requests and streaming so it can render before the entire file arrives, provided the server supports byte ranges. Bundled or locally selected files arrive as bytes instead. [PDF.js loading options](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [PDF.js range-request guidance](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#pdfjs-is-fetching-the-entire-pdf-file-from-a-server-can-it-fetch-only-the-required-portions-for-rendering)

## One `DocumentIndex` for build time and runtime

The same contract can be produced in both places. PDF.js publishes browser and Node examples, and its current support table includes modern browsers and Node.js. Tesseract.js likewise implements browser workers and Node worker threads. [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [PDF.js environment support](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#which-browsersenvironments-are-supported), [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md#createworkeroptions-worker)

The portable boundary should sit after extraction, not around PDF.js or Tesseract.js objects. A minimal serialized shape is:

```ts
type DocumentIndex = {
  schemaVersion: 1;
  documentVersionId: string;
  sourceFingerprint: string;
  extractor: {
    pipelineVersion: string;
    pdfjsVersion: string;
    ocrEngine?: "tesseract";
    ocrEngineVersion?: string;
  };
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    rotation: number;
    status: "indexed" | "no-usable-text" | "failed";
    runs: Array<{
      text: string;
      box: [number, number, number, number];
      source: "embedded" | "ocr";
      confidence?: number;
    }>;
  }>;
};
```

`box` should use the same top-left, zero-to-one coordinate convention as Point Set locations. Keeping `width`, `height`, and `rotation` records how the source page was normalized and makes the index inspectable. Confidence belongs only on OCR output and should not become an authorization threshold without testing.

Build-time and browser ingestion can have different adapters:

- Demo Project preparation reads known PDFs, runs the extractor, validates the output, and commits the serialized `DocumentIndex` beside the project manifest.
- A future browser importer reads a `File` or `Blob`, writes the original document version to IndexedDB, processes one page at a time, and persists partial index progress under that document version.

Both call the same normalization and validation code. Pin the PDF.js library and worker to the same version because PDF.js explicitly requires them to match. Store extractor versions in the artifact so a later schema or engine change can trigger reindexing instead of silently mixing results. [PDF.js API and worker version requirement](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#reasons-for-the-error-the-api-version-abc-does-not-match-the-worker-version-xyz)

The exact TypeScript fields should be settled with the rest of the document-access contract. The architectural requirement is smaller: page identity, source dimensions and rotation, normalized positioned text, extraction provenance, failure state, and version metadata.

## Browser extraction versus a later server worker

| Concern | Browser pipeline | Later server job |
| --- | --- | --- |
| Privacy and setup | The PDF can remain on the user's device. No account, upload, or application backend is needed. | Grounded must upload, authorize, retain, and eventually delete project documents. |
| Responsiveness | Embedded text can appear page by page. OCR competes with viewing for the user's CPU and memory, even when workers keep the main thread responsive. | Controlled machines can run native PDF and OCR tooling without consuming the Senior Project Manager's laptop. |
| Reliability | Work ends if the tab closes unless progress is persisted and resumed. Device performance varies. | A durable job can continue after navigation, retry failed pages, and reuse an index across devices or collaborators. |
| Scale | Best for one person's occasional documents with page-at-a-time limits. Large sheets need conservative raster budgets or tiling. | Better for large batches, predictable OCR, and centralized reindexing when extractors change. |
| Product cost | Fits the local-first MVP and its fresh Demo Session model. | Adds backend compute, document storage, job state, security, and operating cost before the MVP needs them. |

A later server path should implement the same `DocumentIndex` producer interface, not a second application contract. It could use native Tesseract or another extractor and still emit the same normalized runs.

Cloudflare Worker compute is not an automatic fit for OCR. As of August 2026, each isolate has 128 MB total memory including WebAssembly allocations. Paid Workers default to 30 seconds of CPU and can be configured up to five minutes. The raw canvas calculation above can consume the memory budget before the OCR model and PDF parser load. If server OCR becomes necessary, benchmark a queue-backed Worker against a container or managed document-processing service instead of assuming the main site Worker can run it. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cloudflare Queues limits](https://developers.cloudflare.com/queues/platform/limits/)

## MVP boundary

For this MVP:

1. Bundle original PDFs in the Demo Project.
2. Use PDF.js for the Senior Project Manager's viewer and Point Set coordinate mapping.
3. Generate and commit a `DocumentIndex` for the Demo Project. Extract embedded text first. Use build-time OCR only where inspection proves it is needed.
4. Expose indexed text and page references to the External Agent through WebMCP. Do not expose PDF.js operator lists as a supposed semantic drawing model.
5. Define the index contract and extraction provenance now. Defer the browser ingestion coordinator, OCR worker, progress UI, document import, and server jobs.

This keeps the hackathon path fast and repeatable. It also leaves a straight extension: a later imported document version goes through browser extraction and writes the same `DocumentIndex`; a future server job can replace that producer if real files prove too large or inconsistent for client devices.

## Risks to test after the MVP

- Run `getTextContent()` against the actual Demo Project sheets. Check labels, dimensions, rotated notes, symbols, and the page order an External Agent will receive.
- Measure PDF.js render time and peak canvas size on the largest sheet at fit-to-page and expected zoom levels.
- Build a small OCR spike against one scanned sheet and one outlined-text vector sheet. Measure worker startup, trained-data transfer, per-page time, memory, and box alignment.
- Decide whether future visual access for an External Agent uses bounded page images or regions. The text index alone cannot interpret linework.
- Revisit server processing only after imported documents or multi-device Project Workspaces enter scope.
