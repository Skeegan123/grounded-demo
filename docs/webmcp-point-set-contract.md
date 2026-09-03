# Grounded WebMCP contract

## Current eight-tool inventory

Grounded exposes exactly eight public WebMCP tools. The application-level proof in
`src/application/webmcpRegistration.test.tsx` asserts these exact names and does
not report **WebMCP ready** until all eight registrations finish:

| Role | Tool | Annotations |
| --- | --- | --- |
| Help | `get_grounded_help` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `get_project_workspace` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `list_project_documents` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `search_project_documents` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `inspect_document_evidence` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Navigation | `navigate_document` | `readOnlyHint: false`, `untrustedContentHint: true` |
| Assistance | `create_assistance_request` | `readOnlyHint: false`, `untrustedContentHint: true` |
| Assistance | `get_assistance_request` | `readOnlyHint: true`, `untrustedContentHint: true` |

The read-only help tool returns an overview of Grounded or focused guidance for
one exact tool name. The four read-only document tools snapshot the current
Project Workspace, list its immutable documents, locate concise matches, and
inspect the selected evidence.
The navigation tool changes only the visible Document Browsing destination. The
two Assistance tools queue a Human Reviewer judgment and retrieve its
eventual Professional Response. A registration attempt is all-or-nothing: if
any registration fails, is replaced, or is unmounted, none of that attempt's
tools remains callable after cleanup. Refreshing the page starts a new attempt.

The help contract is locked by
`src/webmcp/registerGroundedHelpTool.test.ts`; the workspace snapshot is locked
by `src/webmcp/registerProjectWorkspaceTool.test.ts` and application recovery
tests; the Assistance schemas, annotations, limits, and result shapes are
locked by `src/webmcp/registerAssistanceTools.test.ts`; document inspection is
locked by `src/webmcp/registerDocumentTools.test.ts`; navigation is locked by
`src/webmcp/registerDocumentNavigationTool.test.ts`; and the valid eight-tool
application path is locked independently by
`src/application/createGroundedApp.test.tsx`.

## Get Grounded help

Tool: `get_grounded_help`

Call the tool with `{}` for a short overview of Grounded, its eight registered
tools, the evidence and Human Reviewer boundaries, and the optional
`use-grounded` workflow guide at
`/.well-known/agent-skills/use-grounded/SKILL.md`. The guide expands the compact
tool contracts with visual-inspection, Assistance, and bounded-polling
procedures. The tool descriptions and current help response remain authoritative
when a client does not read the guide. To get focused help, pass one exact
registered tool name:

```json
{ "tool": "search_project_documents" }
```

The optional `tool` field is a closed choice of the eight public tool names.
Additional fields and unknown tool names are rejected. Focused help returns the
tool's purpose, input summary, result summary, and a useful next step. The tool
is read-only, uses only app-authored static text, and changes no Project
Workspace, Document Browsing, or Assistance state. Overview and focused results
remain within 1,500 UTF-8 bytes.

The same skill is listed in `/.well-known/agent-skills/index.json` with a SHA-256
digest. Grounded also advertises that index through the deployed site's
`service-desc` Link header. Clients may use either discovery route; neither is
required for the eight WebMCP tools to work.

## Get the Project Workspace

Tool: `get_project_workspace`

Call the tool with `{}` to read a fresh snapshot of the current work state. The
input rejects additional fields. A fresh Demo Session returns:

```json
{
  "project": {
    "id": "demo-virginia-farmhouse",
    "title": "Virginia Farmhouse Demo Project",
    "description": "A Project Workspace for reviewing Type C interior door product data against the contract drawings.",
    "documentCount": 2
  },
  "documentBrowsing": {
    "selectedDocument": {
      "id": "virginia-farmhouse-drawings",
      "versionId": "virginia-farmhouse-drawings-v1"
    },
    "selectedPage": { "id": "sheet-a0.0" }
  },
  "assistance": {
    "pendingCount": 0,
    "completedCount": 0,
    "currentPending": null,
    "latestCompleted": null
  }
}
```

`currentPending` is the first request in the FIFO pending queue.
`latestCompleted` is the most recently completed request. Each non-null summary
contains `id`, `state`, requested `responseType`, `createdAt`, and a normalized
`questionPreview` capped at 100 UTF-8 bytes. The two counts cover every request
in the current Demo Session, while only those two summaries are returned.

The snapshot omits Professional Responses, the complete Project Document
catalog, and the internal Demo Session ID. Use a returned request ID with
`get_assistance_request`, and use `list_project_documents` for the catalog. This
keeps workspace state separate from the usage guidance in `get_grounded_help`.

Every execution reads persisted Assistance state and current Document Browsing
state again. The tool does not cache results or change the visible document,
selected page, Assistance queue, drafts, or panel state. Reloading within the
same Demo Session preserves the selected location and resumable request IDs.
Start over creates a new Demo Session whose Assistance counts and summaries are
empty and whose Document Browsing selection is the default location. Results
remain within 1,500 UTF-8 bytes and keep `readOnlyHint: true` and
`untrustedContentHint: true`.

## Navigate a Project Document, page, block, or Document Region

Tool: `navigate_document`

The root input contains exactly one required `documentId` and an optional
`target`. `documentId` is a non-empty string of at most 200 characters. Grounded
resolves it to the currently accessible Project Document and returns that
document's current immutable `versionId`; callers cannot provide or select a
`documentVersionId`, and additional root properties are rejected.

Omitting `target` opens the Project Document at its most recently visited page
in the current Demo Session, falling back to its first page. An explicit target
is one of three strict shapes. Use a page target for whole-sheet context. Prefer
a block target when search or inspection returned the schedule row, diagram,
note, or detail needed for a focused visual comparison. Use a region target for
an exact normalized area that has no stable block ID. A page target is:

```json
{
  "documentId": "virginia-farmhouse-drawings",
  "target": {
    "type": "page",
    "pageId": "sheet-a1.2"
  }
}
```

A semantic block target is:

```json
{
  "documentId": "virginia-farmhouse-drawings",
  "target": {
    "type": "block",
    "blockId": "block-id-from-search-or-inspection"
  }
}
```

A raw Document Region target is:

```json
{
  "documentId": "virginia-farmhouse-drawings",
  "target": {
    "type": "region",
    "pageId": "sheet-a1.2",
    "region": {
      "left": 0.4,
      "top": 0.35,
      "width": 0.2,
      "height": 0.2
    }
  }
}
```

`pageId` and `blockId` are non-empty stable identities of at most 200
characters. A block target contains no `pageId`: Grounded resolves its owning
page from the validated prepared-evidence artifact for the specified current
Project Document. Missing blocks and IDs belonging to another document fail
before the viewer changes. Every target and nested region rejects additional
properties, including display labels, page numbers, titles, and indexes. Region
values use the top-left normalized coordinate convention: `left` and `top` are
finite values from zero through one; `width` and `height` are finite and
positive; and the complete rectangle must remain inside the page.

Document-only and page navigation use ordinary full-page fit at 100 percent. A
successful call returns only after that page and fit are visibly rendered:

```json
{
  "status": "applied",
  "document": {
    "id": "virginia-farmhouse-drawings",
    "versionId": "virginia-farmhouse-drawings-v1"
  },
  "page": { "id": "sheet-a1.2" },
  "type": "page",
  "fit": "page",
  "zoom": 1
}
```

A document-only result uses `"type": "document"`. The result contains no
Document Evidence, Search Hints, OCR, highlights, or Assistance content.
Unknown document and foreign page identities fail before changing the visible
workspace.

A block or region target creates transient Document Focus. For a block,
Grounded resolves the exact semantic block region and owning page, then uses the
same fitting lifecycle as a raw region. Both source-derived Document Evidence
blocks and generated Search Hint blocks can be navigated; this location-only
action neither changes their classification nor implies that a Search Hint can
support a claim. Grounded fits the complete region into the full document
viewer, centers it when page-edge clamping permits, reserves 10 percent of the
viewer on every edge, ignores floating control overlays, and clamps the
computed scale to the existing 25–400 percent range. The existing zoom
percentage shows the actual scale and the applied result reports it with the
exact normalized region:

```json
{
  "status": "applied",
  "document": {
    "id": "virginia-farmhouse-drawings",
    "versionId": "virginia-farmhouse-drawings-v1"
  },
  "page": { "id": "sheet-a1.2" },
  "type": "region",
  "fit": "region",
  "region": {
    "left": 0.4,
    "top": 0.35,
    "width": 0.2,
    "height": 0.2
  },
  "zoom": 3.84
}
```

A block result additionally reports the requested `blockId` and the resolved
page and region:

```json
{
  "status": "applied",
  "document": {
    "id": "virginia-farmhouse-drawings",
    "versionId": "virginia-farmhouse-drawings-v1"
  },
  "page": { "id": "sheet-a4.3" },
  "type": "block",
  "blockId": "resolved-parent-table-block-id",
  "fit": "region",
  "region": {
    "left": 0.12,
    "top": 0.48,
    "width": 0.76,
    "height": 0.28
  },
  "zoom": 2.31
}
```

Search results for a table row intentionally expose the parent table as
`block.id`, while the result's `region` is the narrower matched row. Navigating
that block ID therefore fits the complete parent table. To frame only the row,
pass the search match's raw `region` with its `page.id` as a region target.
Navigation never returns block content, OCR, classification claims, evidence
payloads, or other source text.

After the region is visibly rendered and fitted, Document Focus draws a
transient outline at the exact normalized Document Region. The fixed-width
stroke stays inside the page edge, above the PDF canvas and below Point Set
markers. It is hidden from accessibility APIs, ignores pointer events, and is
visual context only. It is not a highlight, selection, annotation, evidence
classification, badge, or control. Document-only and page navigation never
show it.

A new block or region navigation replaces the prior outline. A pointer-down
anywhere in the document viewer dismisses it even if no pan follows, while the
fitted region remains in view. Resizing after dismissal does not restore it.
Repeating the same block or region navigation creates a fresh outline and keeps
the optimization that reuses an already visible PDF page. Assistance panel
interaction does not dismiss the outline. Pan, pinch, wheel, zoom, fit,
page-selection, document-selection, and keyboard actions by the user take
control and clear the outline and Document Focus.

While active, Document Focus recalculates from the normalized region when the
viewport resizes. Grounded persists the selected document and page, but not the
focus scale, offset, or outline. Reload restores that page with ordinary
full-page fit at 100 percent. Ordinary browsing preferences continue to persist
normally.

Visible completion is failure-safe and remains under user control. One
navigation call owns the viewer only until its requested page and requested fit
are visibly applied, a newer External Agent call arrives, or the user pans,
zooms, uses an existing fit action, selects a page, or selects a document. A
newer External Agent or user action supersedes the pending call immediately.
The superseded call returns only compact request
context and no fields that imply its destination became visible:

```json
{
  "status": "superseded",
  "requestedDocument": { "id": "virginia-farmhouse-drawings" },
  "targetType": "page"
}
```

Late rendering from a superseded call cannot complete that call, reclaim the
view, roll back the newer destination, or leave a stale outline. Repeating an
exact destination while its page, fit, and outline are still visibly applied
returns the existing applied result without rendering again. If the user has
moved the view, or dismissed the outline, the same input reapplies its page or
region fit and visual context before returning `applied`.

Each call has a 15-second internal visible-render deadline. A PDF render failure
or deadline expiry restores the last successfully displayed document and page
before rejecting with `The Project Document page could not be rendered.` or
`Document navigation timed out before the destination became visible.` Grounded
does not expose renderer implementation details. The tool also honors its
per-call cancellation signal; cancellation restores the prior visible view,
rejects with `Document navigation was cancelled.`, and prevents abandoned work
from applying later. Recovery never overwrites a user action or newer External
Agent navigation that acquired the viewer in the meantime.

Success, failure, cancellation, and supersession preserve Assistance Requests,
Professional Responses, tabs, unfinished Point Set drafts and notes, viewed
results, and existing overlays. The four read-only document tools remain
read-only and do not move the workbench.

## Create an Assistance Request

Tool: `create_assistance_request`

Input fields:

| Field | Shape |
| --- | --- |
| `question` | one non-blank judgment request, at most 240 characters |
| `context` | optional non-blank evidence, reference values, provisional assessment, and uncertainty, at most 2,000 characters |
| `responseType` | literal `point_set` or `text` |
| `documentId` | non-empty string of at most 200 characters, required for Point Set |
| `documentVersionId` | non-empty string of at most 200 characters, required for Point Set |
| `recommendedPageIds` | required array of at most 25 unique identifiers; the array may be empty |
| `supportingDocumentReferences` | optional array of at most 10 immutable document-version references |

An Assistance Request with a text response type contains `question`, optional
`context`, and `responseType`. Both discriminated shapes reject additional
fields. The tool is annotated with `readOnlyHint: false` and
`untrustedContentHint: true` because it changes the local Demo Session queue.
It does not contact or notify anyone outside the Project Workspace. When the
user requested Human Reviewer involvement, relevant requests do not require a
separate confirmation.

Each request asks for exactly one judgment. A Point Set is homogeneous: every
point has the same meaning and `count` is the aggregate for that one category or
condition. It cannot classify marks by type. Each count or visual comparison
therefore needs its own request for one exact type or item. Counting requests
use non-overlapping source views where each physical instance appears once;
they do not combine plans and elevations.

Supporting references give the Human Reviewer the documents that
informed the request without changing the Point Set target. Each reference has
`documentId`, `documentVersionId`, and one through 25 unique `pageIds`. Every
identifier in an Assistance call is limited to 200 characters. A request cannot
repeat the same supporting document version. Grounded also rejects document
versions outside the Project Workspace and pages outside the referenced
version.

A Demo Session may have at most 25 pending Assistance Requests. Answered and
declined requests no longer count toward that limit. The limit check, queue
position, and new record are committed together, so concurrent requests cannot
overfill the queue or share a queue position.

Successful creation returns after the request is committed, without waiting for
a Professional Response:

```json
{
  "id": "request-id",
  "state": "pending",
  "createdAt": "2030-01-02T03:04:05.000Z"
}
```

## Retrieve an Assistance Request

Tool: `get_assistance_request`

The input is exactly one non-empty `id` of at most 200 characters. The tool is annotated with
`readOnlyHint: true` and `untrustedContentHint: true`.

A pending result includes `id`, `state`, `question`, optional `context`, and
`createdAt`. Answered and declined results preserve the same optional context.
An answered Point Set adds this final response:

```json
{
  "professionalResponse": {
    "type": "point_set",
    "document": {
      "id": "virginia-farmhouse-drawings",
      "versionId": "virginia-farmhouse-drawings-v1"
    },
    "points": [
      {
        "pointNumber": 1,
        "page": { "id": "sheet-a1.2", "label": "A1.2", "number": 6 },
        "x": 0.5,
        "y": 0.5
      }
    ],
    "count": 1,
    "submittedAt": "2030-01-02T03:05:06.000Z"
  }
}
```

`pointNumber` is a one-based reference across the complete Point Set. Grounded
assigns contiguous numbers when the Human Reviewer submits the response,
then stores and returns those fixed numbers. Responses saved before Point Numbers
were added derive them from the stored array order. Point Number identifies a
location. It does not express priority, rank, category, or importance.

`count` is computed from `points`; it is never accepted or stored separately.
Coordinates are normalized from the top-left of the rendered page and remain in
the inclusive range from zero to one.

An answered Assistance Request with a text response type returns one non-empty
plain-text value and may include an overall note:

```json
{
  "professionalResponse": {
    "type": "text",
    "text": "Revise and resubmit.",
    "submittedAt": "2030-01-02T03:05:06.000Z"
  }
}
```

A declined Assistance Request uses the `declined` lifecycle state. Its final
Professional Response may include a reason:

```json
{
  "state": "declined",
  "professionalResponse": {
    "type": "declined",
    "reason": "The drawing is not legible.",
    "submittedAt": "2030-01-02T03:05:06.000Z"
  }
}
```

## Document inspection limits

`inspect_document_evidence` accepts one immutable `documentId` and
`documentVersionId`, plus exactly one selector mode:

- `pageIds`: one through five unique page identifiers; or
- `blockIds`: one through 50 unique block identifiers.

Every inspection identifier is limited to 200 characters. Page inspection
returns each selected page's semantic blocks and table rows. Block inspection
returns every selected block with the page, document/source provenance, and
relevant table rows needed to interpret it. Normalized semantic block and table
row regions support navigation and Document Focus outlines without shipping word-level
OCR in the browser artifact or adding it to an External Agent's context.

The complete serialized result is capped at 512 KiB measured as UTF-8 bytes at
the public tool boundary. If a result would exceed that cap, Grounded returns no
partial evidence and the compact error `Inspection response exceeds 512 KiB.
Narrow the pageIds or blockIds selectors and retry.`

## Rejected-call recovery

Assistance validation errors identify the violated length, collection, or
pending-queue limit without echoing the rejected question or identifier. The
rejected call writes no request and leaves existing states and queue positions
unchanged. Shorten the value, remove duplicates, split supporting context into
separate Assistance Requests, or wait for a pending request to be answered or
declined, then retry. An oversized inspection likewise returns no partial
result; narrow its page or block selectors and retry.

These hard limits do not change any valid input semantics, public tool names,
annotations, or successful result shapes. Pagination, continuation tokens,
streaming, compression, total-storage quotas, and abandoned-session cleanup
remain outside this deadline-scoped contract.

## Client and tracer evidence

On August 30, 2026, ChatGPT's in-app browser discovered both registered tools,
accepted their TypeBox-generated JSON schemas and annotations, executed the
create and pending-read calls, observed the visible point submission, reloaded
the page, and retrieved the answered response with its document version, page
identity, normalized coordinates, count, and timestamps intact.

An earlier client run exercised the then-current three document tools:
`get_project_workspace`, `list_project_documents`, and the since-replaced
`inspect_document_text`. It also exercised both Assistance tools. That run is
evidence for the historical surface, not a claim that the client executed the
later `search_project_documents` or `inspect_document_evidence` contracts.

The current automated document-to-Assistance tracer exercises six workflow
tools, including a second `get_project_workspace` call after reload to recover
the completed request ID. Application navigation tests exercise
`navigate_document`, and focused tests exercise `get_grounded_help` through the
same recording Model Context adapter. On September 2, 2026, no
supported third-party WebMCP client was available in the implementation
environment, so no new manual eight-tool client rehearsal was performed or
claimed. The current tracer sequence and the reusable client checklist are in
[`door-package-submittal-review-demo.md`](door-package-submittal-review-demo.md).
