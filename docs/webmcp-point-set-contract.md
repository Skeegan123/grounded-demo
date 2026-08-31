# Assistance WebMCP contract

The durable Point Set tracer settled the initial contract. The queue extension
adds Assistance Requests with a text response type and declined Professional
Responses without changing the two tool names.
The schemas, annotations, and result shapes are locked by
`src/webmcp/registerAssistanceTools.test.ts`; the full application path is
locked independently by `src/application/createGroundedApp.test.tsx`.

## Create an Assistance Request

Tool: `create_assistance_request`

Input fields:

| Field | Shape |
| --- | --- |
| `question` | non-blank string |
| `responseType` | literal `point_set` or `text` |
| `documentId` | non-empty string, required for Point Set |
| `documentVersionId` | non-empty string, required for Point Set |
| `recommendedPageIds` | array of non-empty page identity strings, required for Point Set |

An Assistance Request with a text response type contains only `question` and
`responseType`. Both discriminated shapes reject additional fields. The tool is annotated with
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

## Real-client finding

On August 30, 2026, ChatGPT's in-app browser discovered both registered tools,
accepted their TypeBox-generated JSON schemas and annotations, executed the
create and pending-read calls, observed the visible point submission, reloaded
the page, and retrieved the answered response with its document version, page
identity, normalized coordinates, count, and timestamps intact.
