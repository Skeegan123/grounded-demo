# Grounded

Grounded is a shared construction workspace where External Agents and Senior
Project Managers collaborate on judgments that depend on precise construction
document interpretation.

The current demo proves one complete Type C door Submittal Review in a
browser-local Demo Project:

1. An External Agent discovers the Project Workspace, searches both document
   versions, and inspects the matched evidence through WebMCP.
2. The agent creates a queued Point Set Assistance Request with immutable
   target and supporting document references.
3. The Senior Project Manager marks the WC, Utility, and Coats openings on
   Sheet A1.2 and submits a final Professional Response.
4. The page reloads without changing its Demo Session.
5. The agent retrieves the persisted response and recommends revise and
   resubmit.

Committed requests and responses live in IndexedDB through Dexie. The Demo
Session identity is tab-scoped in session storage. Unfinished marks and notes
are transient Zustand state and intentionally disappear on reload.

The center pane renders the original PDFs with a custom PDF.js display layer.
Point Set marks sit in a separate normalized overlay, so they stay aligned when
the page resizes or zoom changes. Completed Point Sets can be reopened from
Done after reload.

## WebMCP tools

Grounded exposes exactly seven WebMCP tools. The application-level registration
test in `src/application/webmcpRegistration.test.tsx` is the inventory source of
truth:

- Four read-only document tools: `get_project_workspace`,
  `list_project_documents`, `search_project_documents`, and
  `inspect_document_evidence`.
- One document navigation tool: `navigate_document` moves the visible
  Document Browsing workbench to a current Project Document, stable page,
  semantic block, or normalized Document Region and returns after the requested
  page or transient region fit is visibly applied. Block and region navigation
  adds a dismissible Document Focus outline without creating a highlight,
  selection, or annotation.
- Two Assistance tools: `create_assistance_request` persists one request and
  returns its identity immediately; `get_assistance_request` returns the pending
  request or its final Professional Response.

All seven register as one attempt. Grounded reports **WebMCP ready** only after
the complete inventory is available. A failed, replaced, or unmounted attempt
removes every tool from that attempt before the existing unavailable state is
shown; refresh the page to retry a failed registration.

The public limits, successful result shapes, annotations, compact recovery
behavior, and historical client evidence are documented in
[`docs/webmcp-point-set-contract.md`](docs/webmcp-point-set-contract.md).

The two Assistance input contracts are TypeBox schemas used for TypeScript
inference, browser registration, and runtime validation. The application also
includes a recording model-context adapter so the same behavior can run under
Vitest without browser WebMCP support.

The tested goal prompt, resume prompt, historical client behavior, and current
automated tool sequence are recorded in
[`docs/type-c-submittal-review-demo.md`](docs/type-c-submittal-review-demo.md).

## Run locally

Grounded requires Node.js 22 or later and pnpm 10.26.0. Install dependencies,
then start Vite:

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite in a WebMCP-capable client. The workspace status
changes to **WebMCP ready** once all seven tools register. A normal browser can
still open the Project Workspace, but it cannot expose the tools to an External
Agent.

Create a production build with:

```bash
pnpm build
pnpm preview
```

Deploy that build to the configured Cloudflare Worker with static assets using
`pnpm deploy`. Wrangler reads `wrangler.jsonc` and uploads `dist/` for the
Worker to serve with SPA fallback.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm bundle:check
pnpm lighthouse:baseline
```

`pnpm lighthouse:baseline` runs Lighthouse against a production preview, not
the Vite development server. See [the performance baselines](docs/performance-baselines.md)
for the recorded environment, scores, and entry-bundle budgets.

The high-level behavioral test crosses the recording adapter, real application
composition, fake IndexedDB, and visible UI for create, respond, reload, and
retrieve. The Playwright test runs in Chrome against the actual drawing PDF and
checks PDF.js rendering plus Point Set alignment on Sheet A1.2.

## Judge test

1. Open the deployed URL in ChatGPT's in-app browser without signing in to
   Grounded.
2. Confirm the header says **WebMCP ready**.
3. Give the External Agent the goal prompt in
   [`docs/type-c-submittal-review-demo.md`](docs/type-c-submittal-review-demo.md).
4. Submit the Point Set in Current Assistance, reload the page, then use the
   documented resume prompt.
5. Confirm the agent retrieves the Professional Response and recommends revise
   and resubmit.
6. Select **Start over** and confirm Current, Queue, and Done are empty in the
   new Demo Session.

The same demo guide records the verified tool sequence and the short recording
checklist. It describes observed client behavior, not a scripted agent result.

## Demo Project documents

The replaceable Demo Project manifest lives in
`src/demoProject/demoProjectManifest.json`. It points to the unchanged 25-page
Virginia Farmhouse drawing set and the two-page fictional Type C door submittal
in `public/demo-project/`. Their creator, source, license, retrieval details,
checksums, byte sizes, and page counts are recorded in
`public/demo-project/ASSET-NOTICES.md`.

One schema version 2 Document Evidence artifact is committed for each immutable
document version under `src/documents/generated/`. The offline importer converts
one local Reducto Parse export at a time. The manifest binds each document
version to the exact raw-export SHA-256, and runtime loads the complete artifact
set from those manifest version identities. Required Studio settings,
validation rules, and commands are in
[`docs/document-evidence-import.md`](docs/document-evidence-import.md).

WebMCP adds four read-only document tools:

- `get_project_workspace` introduces the Demo Project.
- `list_project_documents` returns immutable document versions and page refs.
- `search_project_documents` returns concise ranked matches across the current
  prepared artifacts without answering the question.
- `inspect_document_evidence` returns ordered Document Evidence and labeled
  Search Hints for requested pages or blocks.

The deterministic normalization, fuzzy tolerance, Search Hint policy, and
minimum relevance gate are documented in
[`docs/document-search.md`](docs/document-search.md).

The complete public path is discovery, catalog listing, cross-document search,
evidence inspection, Assistance Request creation, and Professional Response
retrieval. Normal runtime reads the committed artifacts. It does not need a
Reducto account, API key, Parse job, result URL, or network request.

## License

Grounded source code is available under the [MIT License](LICENSE). The bundled
Demo Project documents retain their separate licenses and attribution in
[`public/demo-project/ASSET-NOTICES.md`](public/demo-project/ASSET-NOTICES.md).
