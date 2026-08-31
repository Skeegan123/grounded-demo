# Point Set WebMCP contract

This is the initial contract settled by the durable Point Set tracer. Its exact
schemas, annotations, and pending and answered result shapes are locked by
`src/webmcp/registerAssistanceTools.test.ts`; the full application path is
locked independently by `src/application/createGroundedApp.test.tsx`.

## Create an Assistance Request

Tool: `create_assistance_request`

Input fields:

| Field | Shape |
| --- | --- |
| `question` | non-blank string |
| `responseType` | literal `point_set` |
| `documentId` | non-empty string |
| `documentVersionId` | non-empty string |
| `recommendedPageIds` | array of non-empty page identity strings |

The schema rejects additional fields. The tool is annotated with
`readOnlyHint: false` and `untrustedContentHint: true`.

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

The input is exactly one non-empty `id`. The tool is annotated with
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

`count` is computed from `points`; it is never accepted or stored separately.
Coordinates are normalized from the top-left of the rendered page and remain in
the inclusive range from zero to one.

## Real-client finding

On August 30, 2026, ChatGPT's in-app browser discovered both registered tools,
accepted their TypeBox-generated JSON schemas and annotations, executed the
create and pending-read calls, observed the visible point submission, reloaded
the page, and retrieved the answered response with its document version, page
identity, normalized coordinates, count, and timestamps intact.
