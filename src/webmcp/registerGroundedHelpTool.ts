import { type Static, Type } from '@sinclair/typebox'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const GroundedToolName = Type.Union([
  Type.Literal('get_grounded_help'),
  Type.Literal('get_project_workspace'),
  Type.Literal('list_project_documents'),
  Type.Literal('search_project_documents'),
  Type.Literal('inspect_document_evidence'),
  Type.Literal('navigate_document'),
  Type.Literal('create_assistance_request'),
  Type.Literal('get_assistance_request'),
], {
  description:
    'An exact Grounded WebMCP tool name. Omit it for an overview of the complete tool set.',
})

const GetGroundedHelpInput = Type.Object(
  {
    tool: Type.Optional(GroundedToolName),
  },
  { additionalProperties: false },
)

type GroundedToolName = Static<typeof GroundedToolName>

interface ToolHelp {
  input: string
  next: string
  purpose: string
  result: string
}

const toolHelp: Record<GroundedToolName, ToolHelp> = {
  get_grounded_help: {
    purpose: 'Explain Grounded or one of its WebMCP tools.',
    input: 'Omit tool for an overview, or pass one exact registered tool name.',
    result: 'A compact overview or focused tool guidance.',
    next: 'Call the tool that matches the user\'s goal.',
  },
  get_project_workspace: {
    purpose: 'Return the current Project Workspace identity and purpose.',
    input: 'No fields.',
    result: 'The project ID, title, and description.',
    next: 'Use list_project_documents to obtain current document and page IDs.',
  },
  list_project_documents: {
    purpose: 'List current immutable Project Documents and stable page references.',
    input: 'No fields.',
    result: 'Document IDs, version IDs, metadata, and pages.',
    next: 'Search across the catalog or inspect known pages.',
  },
  search_project_documents: {
    purpose: 'Locate prepared-content matches across Project Documents.',
    input: 'A query, with an optional document/version scope and result limit.',
    result: 'Ranked matches with stable document, page, block, and region references.',
    next: 'Inspect matched evidence before using it to support a claim. Search Hints only locate content.',
  },
  inspect_document_evidence: {
    purpose: 'Read prepared evidence from one immutable document version.',
    input: 'A document/version pair and either 1-5 page IDs or 1-50 block IDs.',
    result: 'Source-derived Document Evidence and labeled generated Search Hints.',
    next: 'Use source-derived evidence for claims. Ask a Human Reviewer for visual judgment.',
  },
  navigate_document: {
    purpose: 'Move the visible document workbench to a document, page, block, or region.',
    input: 'A current document ID and an optional page, block, or normalized region target.',
    result: 'The visibly applied destination, or a compact superseded result.',
    next: 'Use this for shared visual context. It does not inspect evidence or create an annotation.',
  },
  create_assistance_request: {
    purpose: 'Queue one construction judgment for a Human Reviewer.',
    input: 'A focused question and text or point_set response type. Point Sets also need immutable target references.',
    result: 'A durable request ID and pending state without waiting for a response.',
    next: 'Keep the returned ID and retrieve the request later.',
  },
  get_assistance_request: {
    purpose: 'Retrieve one Assistance Request from the current Demo Session.',
    input: 'The exact durable request ID returned at creation.',
    result: 'Its pending state or final Professional Response.',
    next: 'If it is pending, retry later. Use an answered or declined response to finish the user\'s task.',
  },
}

const overview = {
  summary:
    'Grounded helps External Agents and Human Reviewers work together on construction questions tied to Project Documents.',
  tools: (Object.keys(toolHelp) as GroundedToolName[]).map((name) => ({
    name,
    purpose: toolHelp[name].purpose,
  })),
  guidance: [
    'Use stable document, version, page, and block IDs exactly as returned by Grounded.',
    'Search Hints locate content but cannot support a claim. Inspect source-derived Document Evidence before relying on it.',
    'Use an Assistance Request when the work needs visual interpretation, selection, measurement, counting, or another construction judgment.',
  ],
}

export function registerGroundedHelpTool(
  modelContext: ModelContextAdapter,
  signal: AbortSignal,
) {
  return modelContext.registerTool(defineTool({
    name: 'get_grounded_help',
    title: 'Get Grounded help',
    description:
      'Explain Grounded\'s WebMCP capabilities. Call with no fields for a short overview, or provide one exact tool name for its purpose, input, result, and next step.',
    schema: GetGroundedHelpInput,
    readOnly: true,
    execute: ({ tool }) => tool
      ? { tool, ...toolHelp[tool] }
      : overview,
  }), { signal })
}
