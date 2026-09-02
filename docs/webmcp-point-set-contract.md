# Grounded WebMCP contract

## Current six-tool inventory

Grounded exposes exactly six public WebMCP tools. The application-level proof in
`src/application/webmcpRegistration.test.tsx` asserts these exact names and does
not report **WebMCP ready** until all six registrations finish:

| Role | Tool | Annotations |
| --- | --- | --- |
| Document | `get_project_workspace` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `list_project_documents` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `search_project_documents` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Document | `inspect_document_evidence` | `readOnlyHint: true`, `untrustedContentHint: true` |
| Assistance | `create_assistance_request` | `readOnlyHint: false`, `untrustedContentHint: true` |
| Assistance | `get_assistance_request` | `readOnlyHint: true`, `untrustedContentHint: true` |

The four document tools introduce the Project Workspace, list its immutable
documents, locate concise matches, and inspect the selected evidence. The two
Assistance tools queue a Senior Project Manager judgment and retrieve its
eventual Professional Response. A registration attempt is all-or-nothing: if
any registration fails, is replaced, or is unmounted, none of that attempt's
tools remains callable after cleanup. Refreshing the page starts a new attempt.

The Assistance schemas, annotations, limits, and result shapes are locked by
`src/webmcp/registerAssistanceTools.test.ts`; document inspection is locked by
`src/webmcp/registerDocumentTools.test.ts`; and the valid six-tool application
path is locked independently by `src/application/createGroundedApp.test.tsx`.

## Create an Assistance Request

Tool: `create_assistance_request`

Input fields:

| Field | Shape |
| --- | --- |
| `question` | non-blank string, at most 4,000 characters |
| `responseType` | literal `point_set` or `text` |
| `documentId` | non-empty string of at most 200 characters, required for Point Set |
| `documentVersionId` | non-empty string of at most 200 characters, required for Point Set |
| `recommendedPageIds` | required array of at most 25 unique identifiers; the array may be empty |
| `supportingDocumentReferences` | optional array of at most 10 immutable document-version references |

An Assistance Request with a text response type contains only `question` and
`responseType`. Both discriminated shapes reject additional fields. The tool is annotated with
`readOnlyHint: false` and `untrustedContentHint: true`.

Supporting references give the Senior Project Manager the documents that
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

A pending result includes `id`, `state`, `question`, and `createdAt`. An answered
Point Set adds this final response:

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
assigns contiguous numbers when the Senior Project Manager submits the response,
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
returns the complete selected pages. Block inspection returns every selected
block with the page, document/source provenance, and relevant table rows needed
to interpret it, while omitting unrelated page-wide low-level OCR content.

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

The complete Type C review client run on the same date discovered and exercised
the then-current three document tools: `get_project_workspace`,
`list_project_documents`, and the since-replaced `inspect_document_text`. It
also exercised both Assistance tools. That historical five-tool run identified
the hollow-core versus solid-wood mismatch, created one request with structured
supporting references, and retrieved the final three-point response after
reload. It is evidence for that historical surface, not a claim that the client
executed the later `search_project_documents` or
`inspect_document_evidence` contracts.

The current automated document-to-Assistance tracer exercises all six current
tools using the recording Model Context adapter. On September 2, 2026, no
supported third-party WebMCP client was available in the implementation
environment, so no new manual six-tool client rehearsal was performed or
claimed. The current tracer sequence and the reusable client checklist are in
[`type-c-submittal-review-demo.md`](type-c-submittal-review-demo.md).
