import { expect, test } from 'vitest'
import { createRecordingModelContext } from './recordingModelContext'
import { registerGroundedHelpTool } from './registerGroundedHelpTool'

interface RegisteredInputSchema {
  anyOf?: Array<{ const?: string }>
  description?: string
  properties?: Record<string, RegisteredInputSchema>
}

test('returns compact overall Grounded help with no parameter', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerGroundedHelpTool(modelContext, controller.signal)

  const result = await modelContext.executeTool('get_grounded_help', {}) as {
    guidance: string[]
    summary: string
    tools: Array<{ name: string; purpose: string }>
  }

  expect(result.summary).toContain('construction questions')
  const toolNames = [
    'get_grounded_help',
    'get_project_workspace',
    'list_project_documents',
    'search_project_documents',
    'inspect_document_evidence',
    'navigate_document',
    'create_assistance_request',
    'get_assistance_request',
  ]
  expect(result.tools.map(({ name }) => name)).toEqual(toolNames)
  expect(result.guidance).toEqual(expect.arrayContaining([
    expect.stringContaining('Search Hints locate content'),
    expect.stringContaining('Assistance Request'),
  ]))
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength)
    .toBeLessThanOrEqual(1_500)
  for (const tool of toolNames) {
    const focused = await modelContext.executeTool('get_grounded_help', { tool })
    expect(new TextEncoder().encode(JSON.stringify(focused)).byteLength)
      .toBeLessThanOrEqual(1_500)
  }

  controller.abort()
})

test('returns focused help for one exact tool name', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerGroundedHelpTool(modelContext, controller.signal)

  await expect(modelContext.executeTool('get_grounded_help', {
    tool: 'search_project_documents',
  })).resolves.toEqual({
    tool: 'search_project_documents',
    purpose: 'Locate prepared-content matches across Project Documents.',
    input: 'A query, with an optional document/version scope and result limit.',
    result: 'Ranked matches with stable document, page, block, and region references.',
    next: 'Inspect matched evidence before using it to support a claim. Search Hints only locate content.',
  })
  await expect(modelContext.executeTool('get_grounded_help', {
    tool: 'get_project_workspace',
  })).resolves.toEqual({
    tool: 'get_project_workspace',
    purpose: 'Return the current Project Workspace and Demo Session work state.',
    input: 'No fields.',
    result: 'Project identity and document count, the selected document version and page, and compact pending and completed Assistance summaries.',
    next: 'Pass a returned request ID to get_assistance_request, or use list_project_documents for the complete catalog.',
  })

  controller.abort()
})

test('publishes a closed optional tool selector and rejects other inputs', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerGroundedHelpTool(modelContext, controller.signal)

  const helpTool = modelContext.getTool('get_grounded_help')
  const schema = JSON.parse(JSON.stringify(
    helpTool?.inputSchema,
  )) as RegisteredInputSchema

  expect(schema.properties?.tool?.description).toBe(
    'An exact Grounded WebMCP tool name. Omit it for an overview of the complete tool set.',
  )
  expect(schema.properties?.tool?.anyOf?.map(({ const: name }) => name))
    .toEqual([
      'get_grounded_help',
      'get_project_workspace',
      'list_project_documents',
      'search_project_documents',
      'inspect_document_evidence',
      'navigate_document',
      'create_assistance_request',
      'get_assistance_request',
    ])
  expect(helpTool?.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: true,
  })
  await expect(modelContext.executeTool('get_grounded_help', {
    tool: 'unknown_tool',
  })).rejects.toThrow('Invalid input at /tool.')
  await expect(modelContext.executeTool('get_grounded_help', {
    extra: true,
  })).rejects.toThrow('Invalid input at /extra.')

  controller.abort()
  expect(modelContext.getTool('get_grounded_help')).toBeUndefined()
})
