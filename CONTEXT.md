# Grounded

Grounded is a shared construction workspace where external AI agents and construction professionals collaborate on work that depends on precise interpretation of construction documents.

## Language

**Project Workspace**:
A bounded construction job context containing the documents, work items, and human responses available to agents and construction professionals.
_Avoid_: Mini Procore, project container

**External Agent**:
An AI agent that operates outside Grounded and uses its WebMCP tools to work within a Project Workspace.
_Avoid_: Built-in agent, Grounded agent

**Senior Project Manager**:
The primary human role for the MVP: a senior employee of a general contractor who manages project execution and makes or coordinates judgments based on construction information.
_Avoid_: Construction Professional, PM

**Demo Project**:
A self-contained Project Workspace with redistributable sample documents and prepared work suitable for judging the product without third-party integrations.
_Avoid_: Fake project, sample data

**Demo Session**:
One isolated, temporary run of a Demo Project whose Assistance Requests, Professional Responses, and optional Agent Results do not carry into another run.
_Avoid_: User account, Project Workspace

**Submittal Review**:
A construction workflow that evaluates submitted product information against the project's requirements and records findings that affect acceptance or follow-up.
_Avoid_: Document review, PDF review

**Assistance Request**:
A request from an External Agent for one judgment from a Senior Project Manager, with one required response type.
_Avoid_: Human request, question

**Professional Response**:
The Senior Project Manager's final reply to one Assistance Request. An answer uses the response type the External Agent requested; a decline may include a reason.
_Avoid_: Human response, answer

**Point Set**:
A Professional Response that marks zero or more locations in one document version. Its count is the number of marked locations.
_Avoid_: Point Selection, point count
