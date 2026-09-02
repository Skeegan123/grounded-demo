# Role-language inventory

Snapshot: 2026-09-02, commit `869b7be`, with uncommitted changes present.

## Result

The flagged role label appears in 99 distinct textual locations across 22 files.

- 49 human-readable phrase occurrences appear in 16 files. This count includes capitalization, plural, hyphen, and line-wrap variants.
- 51 code identifier or slug matches appear in 8 files.
- One database slug matches both groups, so the distinct total is 99 rather than 100.
- Five phrase occurrences are generated copies under `dist/`. They should disappear after their source files change and the app is rebuilt.

The phrase does not appear in extracted text from the four valid checked-in PDFs. Four files with a `.pdf` extension under `scripts/fixtures/reducto/assets/` are plain-text test fixtures, not PDFs, and contain no match. OCR of `artifacts/grounded-desktop-1440x900.jpg` found no visible match.

## Why it keeps returning

The strongest source is `CONTEXT.md`. It defines the label as the canonical name for the primary human role and tells agents to avoid `Construction Professional` and `PM`. Any agent reading the domain language is being instructed to use the unwanted wording.

The next strongest source is the WebMCP tool metadata in `src/webmcp/registerAssistanceTools.ts` and `src/webmcp/registerDocumentTools.ts`. Those descriptions are sent directly to an external model when the tools register. The model sees the label as part of the tool contract even if the visible interface does not show it.

`public/llms.txt` and the README repeat the product framing for agents and people. Tests lock the wording into expected tool descriptions and behavior names. Internal navigation APIs use the role name for ordinary human takeover and browsing behavior, so code-reading agents also keep picking it up.

## Human-readable phrase inventory

Counts below are occurrences, not matching lines. A wrapped phrase can span two lines.

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
| Generated application bundle | `dist/assets/index-BObK4Xr2.js` | 433 | 3 | Compiled copies of the three runtime tool descriptions |

## Code identifier and slug inventory

Some lines contain the identifier more than once, so line counts and occurrence counts differ.

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

## Suggested cleanup order

1. Replace the canonical role definition and the two dependent definitions in `CONTEXT.md`. Decide on one plain name for the person before touching the rest.
2. Change the three WebMCP descriptions and their exact-string tests. This removes the wording from live model context.
3. Rename the navigation API around human browsing and takeover. The behavior is broader than a job title, so a capability name such as human control or local browsing will age better.
4. Rewrite README, `public/llms.txt`, demo material, contract docs, research notes, and the ADR using the chosen language.
5. Rebuild `dist/` rather than editing it by hand, then run the full test, typecheck, lint, and bundle checks.
6. Run the same repository-wide scan again and require zero matches. Delete or rewrite this inventory if the intended end state is literally zero repository references.

## Worktree caution

Twelve matching files already had uncommitted edits when this snapshot was taken:

- `CONTEXT.md`
- `README.md`
- `docs/adr/0001-agent-document-navigation.md`
- `docs/type-c-submittal-review-demo.md`
- `docs/webmcp-point-set-contract.md`
- `src/App.tsx`
- `src/application/createGroundedApp.test.tsx`
- `src/documents/DocumentNavigator.ts`
- `src/documents/DocumentWorkbench.tsx`
- `src/documents/PdfPageViewer.test.tsx`
- `src/documents/PdfPageViewer.tsx`
- `src/webmcp/registerDocumentNavigationTool.test.ts`

The later rewrite should preserve those edits and re-check line numbers before changing anything.

## Scope limits

This scan covers the current workspace, including hidden files, ignored build output, checked-in images, and checked-in PDFs. It excludes `.git/`, `node_modules/`, Git history, GitHub issues and pull requests, and prior chat transcripts. The generic `PM` example in `.agents/skills/prototype/LOGIC.md` was reviewed and excluded because it is unrelated to Grounded's role language.
