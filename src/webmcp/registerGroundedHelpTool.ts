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
    purpose: 'Explain Grounded or one WebMCP tool.',
    input: 'Omit tool for an overview, or pass one exact registered tool name.',
    result: 'A compact overview or focused tool guidance.',
    next: 'Call the tool that matches the user\'s goal.',
  },
  get_project_workspace: {
    purpose: 'Return the current Project Workspace and Demo Session work state.',
    input: 'No fields.',
    result: 'Project identity and document count, the selected document version and page, and compact pending and completed Assistance summaries.',
    next: 'Pass a returned request ID to get_assistance_request, or use list_project_documents for the complete catalog.',
  },
  list_project_documents: {
    purpose: 'List current Project Documents and pages.',
    input: 'No fields.',
    result: 'Document IDs, version IDs, metadata, and pages.',
    next: 'Search across the catalog or inspect known pages.',
  },
  search_project_documents: {
    purpose: 'Locate prepared-content matches across Project Documents.',
    input: 'A query, with an optional document/version scope and result limit.',
    result: 'Ranked matches with stable document, page, block, and region references.',
    next: 'Inspect matched evidence before using it to support a claim. For a visual comparison, navigate to the exact returned blocks and inspect them.',
  },
  inspect_document_evidence: {
    purpose: 'Read evidence from one document version.',
    input: 'A document/version pair and either 1-5 page IDs or 1-50 block IDs.',
    result: 'Source-derived Document Evidence and labeled generated Search Hints.',
    next: 'Navigate to and inspect exact blocks before a direct visual judgment. Ask the Human Reviewer about uncertainty and always for drawing interpretation or counts.',
  },
  navigate_document: {
    purpose: 'Move the visible workbench to a document destination.',
    input: 'A current document ID and an optional page, block, or normalized region target.',
    result: 'The visibly applied destination, or a compact superseded result.',
    next: 'Inspect the visible content. For an uncertain direct comparison, put the External Agent\'s provisional assessment in Assistance context.',
  },
  create_assistance_request: {
    purpose: 'Add one local judgment to the Human Reviewer queue.',
    input: 'One short question about one exact type or item, optional context with the External Agent\'s provisional assessment, and one response type. Never ask a Point Set to classify marks.',
    result: 'A durable request ID and pending state without waiting for a response.',
    next: 'Keep the returned ID and retrieve the request later.',
  },
  get_assistance_request: {
    purpose: 'Read one Assistance Request from this Demo Session.',
    input: 'The exact durable request ID returned at creation.',
    result: 'Its pending state or final Professional Response.',
    next: 'If it is pending, retry later. Use an answered or declined response to finish the user\'s task.',
  },
}

const overview = {
  summary:
    'Grounded lets External Agents and Human Reviewers resolve construction questions tied to Project Documents.',
  workflowGuide: {
    url: '/.well-known/agent-skills/use-grounded/SKILL.md',
    useWhen: 'Read before multi-document, visual, or Human Reviewer-assisted work.',
  },
  tools: (Object.keys(toolHelp) as GroundedToolName[]).map((name) => ({
    name,
    purpose: toolHelp[name].purpose,
  })),
  guidance: [
    'Search Hints locate content but cannot support claims. Inspect Document Evidence.',
    'Inspect exact figure or detail blocks and rendered pixels. An obvious isolated visual difference may be an External Agent observation.',
    'Use an Assistance Request for uncertainty, drawing interpretation, measurements, or counts. One judgment per request; counts use one type and non-overlapping source views.',
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
      'Use when starting a Grounded review or when unsure which tool to call. Returns the evidence rules, Human Reviewer handoff criteria, available tools, and focused guidance for each tool.',
    schema: GetGroundedHelpInput,
    readOnly: true,
    execute: ({ tool }) => tool
      ? { tool, ...toolHelp[tool] }
      : overview,
  }), { signal })
}
