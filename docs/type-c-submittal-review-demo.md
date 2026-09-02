# Type C Submittal Review demo

This is the repeatable goal prompt tested with ChatGPT's in-app browser on
August 30, 2026:

> Review the Type C interior door submittal against the Virginia Farmhouse
> contract drawings. Ask the Senior Project Manager to mark affected openings
> when visual judgment is needed, then recommend a disposition.

The prompt names the review goal and the Senior Project Manager judgment
boundary. It does not name the mismatch, target sheets, affected rooms, or
final disposition.

## Resume prompt

The Assistance Request returns immediately. After the Senior Project Manager
submits a response, use this prompt to resume clients that do not continue on
their own:

> Check the Assistance Request you created and finish the Type C door
> submittal review.

## Verified tool sequence

The successful run used the ordinary WebMCP descriptions to choose this
sequence:

1. `get_project_workspace`
2. `list_project_documents`
3. `search_project_documents` for the submitted product and contract requirement
4. `inspect_document_evidence` for the matched submittal blocks
5. `inspect_document_evidence` for the matched A4.3 door-schedule table
6. `inspect_document_evidence` for the matched A1.2 floor-plan Search Hint
7. `create_assistance_request` with A1.2 as the Point Set target, A4.3 and the
   two submittal pages as supporting references, and A1.2 as the recommended
   page
8. `get_assistance_request` after the Professional Response

The repeatable searches are:

- `hollow honeycomb core` for the submitted construction;
- `Type C 24 x 80 solid wood` for the A4.3 schedule requirement;
- `first floor plan room layout utility coats WC` for the A1.2 Search Hint.

This is a tested path through general document and Assistance Request tools,
not a required workflow. An External Agent may inspect other relevant pages or
change the order.

## Settled tool descriptions

The successful client run discovered these descriptions:

- `get_project_workspace`: "Introduce this Demo Project and its purpose before
  inspecting its immutable documents."
- `list_project_documents`: "List immutable document versions and stable page
  or sheet references without changing the visible workspace."
- `search_project_documents`: "Locate concise prepared-content matches across
  immutable Project Workspace documents. Search locates evidence and does not
  answer the question; follow a match with inspect_document_evidence for full
  context. Search Hints cannot support a claim, and visual interpretation,
  selection, measurement, or counting requires the Senior Project Manager."
- `inspect_document_evidence`: "Inspect complete pages or selected blocks from
  one immutable document version without changing the visible workspace.
  Results distinguish source-derived Document Evidence from generated Search
  Hints, which can locate content but cannot support a claim by themselves."
- `create_assistance_request`: "Queue one Assistance Request requiring a Point
  Set or text response from a Senior Project Manager. For a Point Set, include
  references to other immutable documents that support the requested judgment.
  Returns immediately with the durable request identity."
- `get_assistance_request`: "Retrieve one request from this Demo Session,
  including its final Professional Response when answered."

## Observed result

Search located a 24 by 80 inch hollow-core flush submitted door and a 24 by 80
inch solid-wood, one-panel Type C contract requirement. Inspection returned the
complete Document Evidence for both matches. The request
asked the Senior Project Manager to mark every affected Type C opening on A1.2.
The Senior Project Manager marked WC, Utility, and Coats and submitted one
final three-point Professional Response.

After reload, `get_assistance_request` returned `answered`, the immutable
drawing version, three A1.2 page references with normalized coordinates, a
computed count of three, creation and submission timestamps, and the overall
note. The External Agent recommended revise and resubmit because the proposed
hollow-core flush construction does not meet the solid-wood, one-panel contract
requirement at the three marked openings.

The create-to-retrieve portion took about one minute in the local
deployment-equivalent browser run.

## Recording checklist

- Open the public URL in a fresh ChatGPT in-app browser tab and verify that the
  header says **WebMCP ready**.
- Start recording before sending the goal prompt above.
- Let the External Agent inspect both PDFs and create the Assistance Request.
- In Current Assistance, verify the target is A1.2 and the supporting references
  include A4.3 and the two submittal pages.
- Review A1.2, place the Point Set requested by the External Agent using your
  professional judgment, and submit the Professional Response.
- Reload the page to prove the Demo Session and Professional Response persist.
- Send the resume prompt if the client does not continue on its own.
- Capture the retrieved Professional Response and the agent's disposition.
- Select **Start over** and show an empty Current, Queue, and Done before ending
  the recording.

## Client finding

The first run discovered the documents and mismatch without extra introductory
guidance. It did expose one request-contract gap: the Point Set input could name
the target drawing but could not carry the submittal pages supporting the
judgment. `supportingDocumentReferences` now accepts immutable document-version
and page identities, and Current Assistance displays them for the Senior
Project Manager.

No Demo Project-specific skill or hidden workflow was needed.

Normal runtime reads the two committed prepared artifacts offline. Reducto is
used only for the one-time Studio exports and local import. The demo needs no
Reducto account, API key, Parse job, result URL, or network request at runtime.
