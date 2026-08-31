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
3. `inspect_document_text` for both submittal pages
4. `inspect_document_text` for A4.3, Doors & Windows
5. `inspect_document_text` for A1.2, 1st Floor Plan
6. `create_assistance_request` with A1.2 as the Point Set target, A4.3 and the
   two submittal pages as supporting references, and A1.2 as the recommended
   page
7. `get_assistance_request` after the Professional Response

This is a tested path through general document and Assistance Request tools,
not a required workflow. An External Agent may inspect other relevant pages or
change the order.

## Settled tool descriptions

The successful client run discovered these descriptions:

- `get_project_workspace`: "Introduce this Demo Project and its purpose before
  inspecting its immutable documents."
- `list_project_documents`: "List immutable document versions and stable page
  or sheet references without changing the visible workspace."
- `inspect_document_text`: "Return prepared positioned text for specified
  stable page identities in one immutable document version."
- `create_assistance_request`: "Queue one Assistance Request requiring a Point
  Set or text response from a Senior Project Manager. For a Point Set, include
  references to other immutable documents that support the requested judgment.
  Returns immediately with the durable request identity."
- `get_assistance_request`: "Retrieve one request from this Demo Session,
  including its final Professional Response when answered."

## Observed result

The document text exposed a 24 by 80 inch hollow-core flush submitted door and
a 24 by 80 inch solid-wood, one-panel Type C contract requirement. The request
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

## Client finding

The first run discovered the documents and mismatch without extra introductory
guidance. It did expose one request-contract gap: the Point Set input could name
the target drawing but could not carry the submittal pages supporting the
judgment. `supportingDocumentReferences` now accepts immutable document-version
and page identities, and Current Assistance displays them for the Senior
Project Manager.

No Demo Project-specific skill or hidden workflow was needed.
