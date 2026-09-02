import { expect, test, vi } from 'vitest'
import type {
  AppliedDocumentNavigation,
  DocumentNavigator,
  NavigateDocumentInput,
} from '../documents/DocumentNavigator'
import { createRecordingModelContext } from './recordingModelContext'
import { registerDocumentNavigationTool } from './registerDocumentNavigationTool'

function createNavigator(): DocumentNavigator {
  const navigate: DocumentNavigator['navigate'] = vi.fn(async (
    input: NavigateDocumentInput,
  ): Promise<AppliedDocumentNavigation> => ({
    status: 'applied',
    document: {
      id: input.documentId,
      versionId: `${input.documentId}-v1`,
    },
    page: { id: input.target?.pageId ?? 'first-page' },
    type: input.target?.type ?? 'document',
    fit: 'page',
    zoom: 1,
  }))
  return {
    cancelPending: vi.fn(),
    navigate,
    reportRenderError: vi.fn(),
    reportVisibleView: vi.fn(),
    takeHumanControl: vi.fn(),
  }
}

test('registers a strict non-read-only document and page navigation contract', async () => {
  const modelContext = createRecordingModelContext()
  const navigator = createNavigator()
  const controller = new AbortController()

  await registerDocumentNavigationTool(
    modelContext,
    navigator,
    controller.signal,
  )

  const tool = modelContext.getTool('navigate_document')
  const schema = JSON.parse(JSON.stringify(tool?.inputSchema)) as {
    additionalProperties: boolean
    properties: {
      documentId: { minLength: number; maxLength: number }
      target: {
        additionalProperties: boolean
        properties: {
          type: { const: string }
          pageId: { minLength: number; maxLength: number }
        }
        required: string[]
      }
    }
    required: string[]
  }

  expect({
    annotations: tool?.annotations,
    rootAdditionalProperties: schema.additionalProperties,
    required: schema.required,
    documentId: schema.properties.documentId,
    targetAdditionalProperties: schema.properties.target.additionalProperties,
    targetRequired: schema.properties.target.required,
    targetType: schema.properties.target.properties.type.const,
    pageId: schema.properties.target.properties.pageId,
  }).toEqual({
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    rootAdditionalProperties: false,
    required: ['documentId'],
    documentId: expect.objectContaining({ minLength: 1, maxLength: 200 }),
    targetAdditionalProperties: false,
    targetRequired: ['type', 'pageId'],
    targetType: 'page',
    pageId: expect.objectContaining({ minLength: 1, maxLength: 200 }),
  })

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'document-1',
    target: { type: 'page', pageId: 'page-2' },
  })).resolves.toEqual({
    status: 'applied',
    document: { id: 'document-1', versionId: 'document-1-v1' },
    page: { id: 'page-2' },
    type: 'page',
    fit: 'page',
    zoom: 1,
  })
  expect(navigator.navigate).toHaveBeenCalledWith({
    documentId: 'document-1',
    target: { type: 'page', pageId: 'page-2' },
  }, undefined)

  controller.abort()
})

test.each([
  {},
  { documentId: '' },
  { documentId: 'x'.repeat(201) },
  { documentId: 'document-1', documentVersionId: 'document-1-v1' },
  { documentId: 'document-1', extra: true },
  { documentId: 'document-1', target: {} },
  { documentId: 'document-1', target: { type: 'page' } },
  { documentId: 'document-1', target: { type: 'page', pageId: '' } },
  {
    documentId: 'document-1',
    target: { type: 'page', pageId: 'x'.repeat(201) },
  },
  {
    documentId: 'document-1',
    target: { type: 'page', pageId: 'page-2', label: '2' },
  },
  {
    documentId: 'document-1',
    target: { type: 'page', pageId: 'page-2', number: 2 },
  },
  {
    documentId: 'document-1',
    target: { type: 'page', pageId: 'page-2', index: 1 },
  },
  { documentId: 'document-1', target: { type: 'block', pageId: 'page-2' } },
])('rejects invalid navigation input without delegating: %j', async (input) => {
  const modelContext = createRecordingModelContext()
  const navigator = createNavigator()
  const controller = new AbortController()
  await registerDocumentNavigationTool(
    modelContext,
    navigator,
    controller.signal,
  )

  await expect(
    modelContext.executeTool('navigate_document', input),
  ).rejects.toThrow('Invalid input')
  expect(navigator.navigate).not.toHaveBeenCalled()

  controller.abort()
})

test('forwards the per-call cancellation signal to the navigator', async () => {
  const modelContext = createRecordingModelContext()
  const navigator = createNavigator()
  const registrationController = new AbortController()
  const callController = new AbortController()
  await registerDocumentNavigationTool(
    modelContext,
    navigator,
    registrationController.signal,
  )

  await modelContext.executeTool('navigate_document', {
    documentId: 'document-1',
  }, { signal: callController.signal })

  expect(navigator.navigate).toHaveBeenCalledWith(
    { documentId: 'document-1' },
    { signal: callController.signal },
  )
  registrationController.abort()
})
