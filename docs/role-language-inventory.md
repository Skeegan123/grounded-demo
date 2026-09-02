# Role-language inventory

Original inventory: 2026-09-02, commit `869b7be`.
Cleanup verified: 2026-09-02, based on commit `b45d98f`.

## Original result

Before cleanup, the flagged role label appeared in 99 distinct textual
locations across 22 files.

- 49 human-readable phrase occurrences appeared in 16 files. This count
  includes capitalization, plural, hyphen, and line-wrap variants.
- 51 code identifier or slug matches appeared in 8 files.
- One database slug matches both groups, so the distinct total is 99 rather than 100.
- Five phrase occurrences were generated copies under `dist/`.

The phrase did not appear in extracted text from the four valid checked-in
PDFs. Four files with a `.pdf` extension under
`scripts/fixtures/reducto/assets/` are plain-text test fixtures, not PDFs, and
contained no match. OCR of `artifacts/grounded-desktop-1440x900.jpg` found no
visible match.

## Cleanup result

The current full-workspace scan returns zero matches, including source, tests,
docs, hidden files, and generated output under `dist/`.

- `Human Reviewer` now names the person who evaluates an Assistance Request.
- `Construction Professional` describes the broader product audience.
- Navigation code now uses user-control terms instead of a business role.
- WebMCP tool descriptions and their contract tests use the new language.
- The production build was regenerated from the updated sources.

## Former injection paths

The strongest source was `CONTEXT.md`. It defined the label as the canonical
name for the primary human role and told agents to avoid `Construction
Professional` and `PM`.

The next strongest source was the WebMCP tool metadata in
`src/webmcp/registerAssistanceTools.ts` and
`src/webmcp/registerDocumentTools.ts`. Those descriptions are sent directly to
an external model when the tools register.

`public/llms.txt` and the README repeated the product framing for agents and
people. Tests locked the wording into expected tool descriptions and behavior
names. Internal navigation APIs also used the role name for ordinary user
takeover and browsing behavior.

## Human-readable phrase inventory

Counts below are occurrences, not matching lines. A wrapped phrase can span
two lines.

| Area | File | Lines | Count | What it controls |
| --- | --- | ---: | ---: | --- |
| Canonical domain language | `CONTEXT.md` | 15, 60, 64 | 3 | Role definition plus Assistance Request and Professional Response definitions |
| Product README | `README.md` | 3-4, 14 | 2 | Product description and demo workflow |
| Agent-facing public copy | `public/llms.txt` | 3, 5 | 2 | Product description exposed to models and crawlers |
| Runtime tool metadata | `src/webmcp/registerAssistanceTools.ts` | 24, 117 | 2 | Assistance question schema and tool description |
| Runtime tool metadata | `src/webmcp/registerDocumentTools.ts` | 124 | 1 | Document search tool description |
| Runtime tests | `src/webmcp/registerAssistanceTools.test.ts` | 62, 64, 463, 559 | 4 | Exact tool schema expectations |
| Runtime tests | `src/webmcp/registerDocumentTools.test.ts` | 541 | 1 | Exact document search description expectation |
| Application tests | `src/application/createGroundedApp.test.tsx` | 676, 1076, 1089, 2171 | 4 | Navigation takeover, database slug, and queue behavior names |
| Viewer tests | `src/documents/PdfPageViewer.test.tsx` | 788 | 1 | Pan and zoom takeover behavior name |
| Contract docs | `docs/webmcp-point-set-contract.md` | 22, 196, 203, 206, 208-209, 210, 225-226, 236, 263, 320 | 10 | Assistance, navigation ownership, recovery, references, and submission |
| Demo docs | `docs/type-c-submittal-review-demo.md` | 7, 10, 16, 82, 96, 107, 108, 159-160 | 8 | Prompt, workflow, tool copy, and example result |
| Research docs | `docs/research/browser-document-ingestion.md` | 36, 131, 145 | 3 | Viewer authority, compute location, and implementation recommendation |
| ADR | `docs/adr/0001-agent-document-navigation.md` | 5, 7 | 2 | Human takeover and navigation supersession |
| Search docs | `docs/document-search.md` | 48 | 1 | Human authority over visual interpretation |
| Generated public copy | `dist/llms.txt` | 3, 5 | 2 | Build copy of `public/llms.txt` |
| Generated application bundle | `dist/assets/index-*.js` | one minified line | 3 | Compiled copies of the three runtime tool descriptions |

## Code identifier and slug inventory

Some lines contain the identifier more than once, so line counts and occurrence
counts differ.

| File | Lines | Count | Role in the code |
| --- | ---: | ---: | --- |
| `src/documents/DocumentNavigator.ts` | 85, 86, 89, 341, 356, 358, 362, 366, 370, 374, 378, 516, 517 | 15 | Public navigator shape, browsing interface, takeover function, and returned API |
| `src/documents/useDocumentKeyboardShortcuts.ts` | 4, 9, 27, 36, 41, 44, 47, 55 | 9 | Navigator type and keyboard action calls |
| `src/documents/PdfPageViewer.tsx` | 60, 106, 469, 473, 528, 552 | 6 | Viewer takeover callback prop and invocations |
| `src/documents/PdfPageViewer.test.tsx` | 696, 713, 747, 798, 804, 828, 841, 852 | 10 | Callback setup, wiring, and assertions |
| `src/documents/DocumentWorkbench.tsx` | 36, 66, 168 | 4 | Workbench callback prop and viewer wiring |
| `src/App.tsx` | 161, 164, 474, 475 | 4 | Navigator destructuring, keyboard wiring, and workbench callback |
| `src/webmcp/registerDocumentNavigationTool.test.ts` | 45, 53 | 2 | Navigator mock shape |
| `src/application/createGroundedApp.test.tsx` | 1089 | 1 | Test database slug; also counted in the phrase inventory |

## Scope limits

This scan covers the current workspace, including hidden files, ignored build output, checked-in images, and checked-in PDFs. It excludes `.git/`, `node_modules/`, Git history, GitHub issues and pull requests, and prior chat transcripts. The generic `PM` example in `.agents/skills/prototype/LOGIC.md` was reviewed and excluded because it is unrelated to Grounded's role language.
