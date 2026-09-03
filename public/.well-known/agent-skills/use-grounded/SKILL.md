---
name: use-grounded
description: Use Grounded WebMCP to investigate construction questions across Project Documents, inspect visual content, and collaborate with a Human Reviewer when professional judgment is needed.
---

# Use Grounded

Treat the current `get_grounded_help` response and tool schemas as the source
of truth. This skill supplies the working method.

## Build the evidence trail

Start with `get_grounded_help`, then read the current Project Workspace and
document catalog.

Search locates relevant content. Inspect matched Document Evidence before
relying on it. Search Hints may locate a figure, detail, or plan but cannot
support a claim by themselves.

Choose evidence based on the question:

- Use schedules and table rows for written attributes, quantities,
  identifiers, and requirements.
- Use figures, elevations, diagrams, and details for appearance, geometry,
  orientation, layout, lite patterns, panel patterns, and other graphical
  configurations.
- Inspect the corresponding visual content when appearance matters, even when
  table rows agree.

## Perform a visual check

Navigation alone is not visual inspection. After navigating, inspect the
rendered pixels with a screenshot or another vision-capable browser operation.
A DOM snapshot and extracted text do not show drawing linework.

For a direct comparison:

1. Identify the exact figure, elevation, diagram, or detail block in each
   relevant document.
2. Navigate to each block instead of only its page or table row.
3. Inspect the rendered content and compare the same type, item, or condition
   on both sides.
4. Record a clear match, mismatch, or uncertainty.

An obvious isolated visual difference may be reported as an External Agent
observation. Ask the Human Reviewer when the comparison is uncertain or
depends on interpreting construction drawings, symbols, linework, dimensions,
measurements, or counts.

## Request Assistance precisely

Create one Assistance Request for one judgment about one exact type, item, or
condition.

A Point Set has one meaning and cannot classify mixed marks. Use a separate
request for each type or category. For counting, recommend only non-overlapping
source views where each physical instance appears once.

Put supporting evidence, expected values, the External Agent's provisional
assessment, and the exact uncertainty in `context`.

Creating a relevant Assistance Request is part of the local Grounded workflow
when the user requested Human Reviewer involvement. It does not require another
permission check.

## Wait for Professional Responses

Keep every returned Assistance Request ID. Continue independent evidence work
while requests are pending.

When a Professional Response is needed to finish the task, keep the task active
and poll `get_assistance_request` every 10 to 20 seconds for no more than two
minutes per batch. Use responses as they arrive. After two minutes, report the
pending request IDs and unresolved judgments. Never invent or infer a
Professional Response.

## Finish the work

Distinguish claims supported by Document Evidence, direct visual observations
made by the External Agent, Professional Responses supplied by the Human
Reviewer, and unresolved questions. Leave Document Browsing on the most useful
final destination.
