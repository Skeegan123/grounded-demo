# Door package submittal review demo

This is the repeatable goal prompt tested with ChatGPT's in-app browser on
August 30, 2026:

> Review the Type C interior door submittal against the Virginia Farmhouse
> contract drawings. Ask the Human Reviewer to mark affected openings
> when visual judgment is needed, then recommend a disposition.

The prompt names the review goal and the Human Reviewer judgment
boundary. It does not name the mismatch, target sheets, affected rooms, or
final disposition.

## Resume prompt

The Assistance Request returns immediately. After the Human Reviewer
submits a response, use this prompt to resume clients that do not continue on
their own:

> Check the Assistance Request you created and finish the Type C door
> submittal review.

After a reload or context loss, `get_project_workspace` returns the current
pending request or latest completed request with its durable ID. The External
Agent can pass that ID to `get_assistance_request`; it does not need to retain
the create call's result in conversation context.

## Current automated tool sequence

The application-level document-to-Assistance tracer in
`src/application/createGroundedApp.test.tsx` exercises this six-tool review
sequence within the current eight-tool surface through the recording Model
Context adapter:

1. `get_project_workspace`
2. `list_project_documents`
3. `search_project_documents` for the submitted Type C schedule row, contract
   requirement, and both floor plans
4. `inspect_document_evidence` for the matched submittal schedule
5. `inspect_document_evidence` for the matched A4.3 door-schedule table
6. `inspect_document_evidence` for the matched A1.2 and A1.3 floor-plan Search
   Hints
7. `create_assistance_request` with A1.2 and A1.3 as Point Set targets, A4.3
   and the six-page submittal as supporting references, and both floor plans
   as recommended pages
8. `get_project_workspace` after reload to recover the latest completed
   request ID and state
9. `get_assistance_request` with that recovered ID

The repeatable searches are:

- `Heritage W-2480-P1 Interior` for the submitted Type C schedule row;
- `Type C 24 x 80 solid wood` for the A4.3 schedule requirement;
- `first floor plan room layout utility coats WC` for the A1.2 Search Hint;
- `second floor plan main bedroom stair hall bathroom` for the A1.3 Search Hint.

This is a tested path through six workflow tools. Separate application tests
exercise `navigate_document`, and focused tests exercise `get_grounded_help`
through the same public adapter. None of these paths is a required workflow or
a claim about a third-party client. An
External Agent may inspect other relevant pages or change the order.

## Current public tool descriptions

The current application registers these descriptions:

- `get_grounded_help`: "Use when starting a Grounded review or when unsure
  which tool to call. Returns the evidence rules, Human Reviewer handoff
  criteria, available tools, and focused guidance for each tool."
- `get_project_workspace`: "Return a fresh read-only snapshot of the current
  project, selected document and page, and resumable Assistance Request state."
- `list_project_documents`: "List immutable document versions and stable page
  or sheet references without changing the visible workspace."
- `search_project_documents`: "Locate concise prepared-content matches across
  immutable Project Workspace documents. Search does not answer the question;
  follow matches with inspect_document_evidence before relying on them. For a
  direct visual comparison, navigate to the exact blocks and inspect them.
  Search Hints cannot support a claim; interpreting drawings, symbols,
  linework, measurements, or counts requires the Human Reviewer."
- `inspect_document_evidence`: "Inspect prepared evidence from one immutable
  document version without changing the visible workspace. Results include
  semantic blocks, table rows, and normalized regions. For a direct visual
  comparison, navigate to the exact relevant blocks and inspect them first. An
  obvious isolated difference may be reported as an External Agent observation.
  Ask a Human Reviewer to confirm uncertainty and always use one for
  interpreting drawings, symbols, linework, measurements, or counts."
- `navigate_document`: "Navigate the visible Document Browsing workbench to a
  Project Document destination. Navigation changes the visible view and
  returns no visual analysis. Use table or schedule blocks for written values.
  Use figure, elevation, diagram, or detail blocks for appearance, geometry,
  and configuration. For a direct visual comparison, navigate to each exact
  visual block in turn and inspect the rendered view after each call. Use a
  page only for whole-sheet context. Block and region targets fit and briefly
  outline the resolved area without selecting or annotating it."
- `create_assistance_request`: "Use when one count-based, uncertain visual, or
  professional judgment remains. Create a separate request for each count type
  or visual comparison. Before requesting direct visual confirmation, navigate
  to and inspect the exact blocks, then put the External Agent's provisional
  assessment in context. This adds only a local Demo Session work item, contacts
  no one outside the Project Workspace, and needs no separate confirmation when
  the user requested Human Reviewer involvement."
- `get_assistance_request`: "Retrieve one request from this Demo Session,
  including its final Professional Response when answered."

## Current automated result

Search located the submitted Type C schedule row with quantity 5 and the
24-by-80-inch solid-wood, one-panel Type C contract requirement. It also
located the A1.2 and A1.3 floor-plan Search Hints. Inspection returned the
complete Document Evidence for both schedule matches. The request asked the
Human Reviewer to mark every Type C opening on both floor plans. The Human
Reviewer marked three openings on each floor and submitted one six-point
Professional Response.

After reload, `get_project_workspace` recovered the completed request ID and
its `answered` state. `get_assistance_request` then returned the immutable
drawing version, six page references with normalized coordinates, a computed
count of six, creation and submission timestamps, and the overall note. The
tracer derives a revise-and-resubmit disposition because the submittal lists
five Type C doors while the two floor plans contain six.

The historical August 30 create-to-retrieve portion took about one minute in
the local deployment-equivalent supported-client run. No timing is claimed for
a new third-party rehearsal.

## Hardened-call recovery

Keep Assistance questions at or below 240 characters and optional context at or
below 2,000 characters. Ask for exactly one judgment, and use a separate Point
Set request for each category or condition. Use no more than 25 unique
recommended pages, 10 supporting document references, or 25 unique pages per
supporting reference; keep every Assistance identifier at or below 200
characters. A Demo Session accepts 25 pending requests; an answered or declined
request frees a slot. A rejected create changes none of the existing queue and
does not echo its rejected payload, so correct the named limit and retry.

For evidence inspection, select either one through five unique pages or one
through 50 unique blocks, with identifiers at or below 200 characters. If the
complete result would exceed the 512 KiB UTF-8 cap, no partial evidence is
returned; narrow the selectors and retry. The full contract is in
[`webmcp-point-set-contract.md`](webmcp-point-set-contract.md).

## Recording checklist

- Open the public URL in a fresh ChatGPT in-app browser tab and verify that the
  header says **WebMCP ready**.
- Start recording before sending the goal prompt above.
- Let the External Agent inspect both PDFs and create the Assistance Request.
- In Current Assistance, verify the targets are A1.2 and A1.3 and the
  supporting references include A4.3 and the six-page submittal.
- Review both floor plans, place the Point Set requested by the External Agent
  using your professional judgment, and submit the Professional Response.
- Reload the page to prove the Demo Session and Professional Response persist.
- Send the resume prompt if the client does not continue on its own.
- Confirm the workspace snapshot recovers the completed request ID and state.
- Capture the retrieved Professional Response and the agent's disposition.
- Select **Start over** and show an empty Current, Queue, and Done before ending
  the recording.

## Historical client finding

The first run discovered the documents and mismatch without extra introductory
guidance. It did expose one request-contract gap: the Point Set input could name
the target drawing but could not carry the submittal pages supporting the
judgment. `supportingDocumentReferences` now accepts immutable document-version
and page identities, and Current Assistance displays them for the Human
Reviewer.

No Demo Project-specific skill or hidden workflow was needed.

Normal runtime reads the two committed prepared artifacts offline. Reducto is
used only for the one-time Studio exports and local import. The demo needs no
Reducto account, API key, Parse job, result URL, or network request at runtime.
