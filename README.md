# Grounded

Grounded is a shared construction workspace where External Agents and Senior
Project Managers collaborate on judgments that depend on precise construction
document interpretation.

The current tracer proves one durable Point Set round trip in a browser-local
Demo Project:

1. An External Agent creates a queued Assistance Request through WebMCP.
2. The Senior Project Manager marks a normalized point on Sheet A1.2 and
   submits a final Professional Response.
3. The page reloads without changing its Demo Session.
4. The External Agent retrieves the persisted response through a later WebMCP
   call.

Committed requests and responses live in IndexedDB through Dexie. The Demo
Session identity is tab-scoped in session storage. Unfinished marks and notes
are transient Zustand state and intentionally disappear on reload.

## WebMCP tools

The real-client tracer locked the initial Point Set contract documented in
[`docs/webmcp-point-set-contract.md`](docs/webmcp-point-set-contract.md):

- `create_assistance_request` persists one request and returns its identity
  immediately.
- `get_assistance_request` returns the pending request or its final Professional
  Response.

Both input contracts are TypeBox schemas used for TypeScript inference, browser
registration, and runtime validation. The application also includes a recording
model-context adapter so the same behavior can run under Vitest without browser
WebMCP support.

## Run locally

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite in a WebMCP-capable client. The workspace status
changes to **WebMCP ready** once both tools register.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The high-level behavioral test crosses the recording adapter, real application
composition, fake IndexedDB, and visible UI for create, respond, reload, and
retrieve.

## Demo Project documents

The replaceable Demo Project manifest lives in
`src/demoProject/demoProject.ts`. It points to the unchanged 25-page Virginia
Farmhouse drawing set and the two-page fictional Type C door submittal in
`public/demo-project/`. Their creator, source, license, retrieval details,
checksums, byte sizes, and page counts are recorded in
`public/demo-project/ASSET-NOTICES.md`.

The generated `DocumentIndex` files live under
`src/documents/generated/`. Regenerate them after replacing either PDF:

```bash
pnpm prepare:demo-project-index
```

The generator tries PDF.js embedded-text extraction first. The drawing set uses
outlined lettering, so it runs build-time Tesseract OCR only on the two sheets
needed for this Demo Project and records the other drawing pages as having no
usable prepared text. The application does not run OCR in the browser.

WebMCP adds three read-only document tools:

- `get_project_workspace` introduces the Demo Project.
- `list_project_documents` returns immutable document versions and page refs.
- `inspect_document_text` returns prepared positioned text for requested pages.
