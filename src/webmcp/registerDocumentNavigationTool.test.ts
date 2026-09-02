import { expect, test, vi } from 'vitest'
import type {
  AppliedDocumentNavigation,
  DocumentNavigator,
  NavigateDocumentInput,
} from '../documents/DocumentNavigator'
import { createRecordingModelContext } from './recordingModelContext'
import { registerDocumentNavigationTool } from './registerDocumentNavigationTool'

function createNavigator(): DocumentNavigator {
  const blockRegion = { left: 0.1, top: 0.2, width: 0.3, height: 0.4 }
  const navigate: DocumentNavigator['navigate'] = vi.fn(async (
    input: NavigateDocumentInput,
  ): Promise<AppliedDocumentNavigation> => ({
    status: 'applied',
    document: {
      id: input.documentId,
      versionId: `${input.documentId}-v1`,
    },
    page: {
      id: input.target?.type === 'page' || input.target?.type === 'region'
        ? input.target.pageId
        : input.target?.type === 'block'
          ? 'resolved-block-page'
          : 'first-page',
    },
    type: input.target?.type ?? 'document',
    ...(input.target?.type === 'block' ? { blockId: input.target.blockId } : {}),
    fit: input.target?.type === 'region' || input.target?.type === 'block'
      ? 'region'
      : 'page',
    ...(input.target?.type === 'region'
      ? { region: input.target.region }
      : input.target?.type === 'block'
        ? { region: blockRegion }
        : {}),
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
        anyOf: Array<{
          additionalProperties: boolean
          properties: Record<string, Record<string, unknown>>
          required: string[]
        }>
      }
    }
    required: string[]
  }

  expect({
    annotations: tool?.annotations,
    rootAdditionalProperties: schema.additionalProperties,
    required: schema.required,
    documentId: schema.properties.documentId,
      targetVariants: schema.properties.target.anyOf.map((variant) => ({
        additionalProperties: variant.additionalProperties,
        required: variant.required,
        type: variant.properties.type?.const,
        pageId: variant.properties.pageId,
        blockId: variant.properties.blockId,
        region: variant.properties.region,
      })),
  }).toEqual({
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    rootAdditionalProperties: false,
    required: ['documentId'],
    documentId: expect.objectContaining({ minLength: 1, maxLength: 200 }),
    targetVariants: [
      {
        additionalProperties: false,
        required: ['type', 'pageId'],
        type: 'page',
        pageId: expect.objectContaining({ minLength: 1, maxLength: 200 }),
        blockId: undefined,
        region: undefined,
      },
      {
        additionalProperties: false,
        required: ['type', 'blockId'],
        type: 'block',
        pageId: undefined,
        blockId: expect.objectContaining({ minLength: 1, maxLength: 200 }),
        region: undefined,
      },
      {
        additionalProperties: false,
        required: ['type', 'pageId', 'region'],
        type: 'region',
        pageId: expect.objectContaining({ minLength: 1, maxLength: 200 }),
        blockId: undefined,
        region: expect.objectContaining({
          additionalProperties: false,
          required: ['left', 'top', 'width', 'height'],
        }),
      },
    ],
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

test('delegates an exact normalized Document Region and returns its applied focus', async () => {
  const modelContext = createRecordingModelContext()
  const navigator = createNavigator()
  const controller = new AbortController()
  await registerDocumentNavigationTool(modelContext, navigator, controller.signal)
  const region = { left: 0.2, top: 0.3, width: 0.25, height: 0.15 }

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'document-1',
    target: { type: 'region', pageId: 'page-2', region },
  })).resolves.toEqual({
    status: 'applied',
    document: { id: 'document-1', versionId: 'document-1-v1' },
    page: { id: 'page-2' },
    type: 'region',
    fit: 'region',
    region,
    zoom: 1,
  })
})

test('delegates a strict semantic block target and returns its resolved focus without evidence content', async () => {
  const modelContext = createRecordingModelContext()
  const navigator = createNavigator()
  const controller = new AbortController()
  await registerDocumentNavigationTool(modelContext, navigator, controller.signal)

  const result = await modelContext.executeTool('navigate_document', {
    documentId: 'document-1',
    target: { type: 'block', blockId: 'block-7' },
  })

  expect(result).toEqual({
    status: 'applied',
    document: { id: 'document-1', versionId: 'document-1-v1' },
    page: { id: 'resolved-block-page' },
    type: 'block',
    blockId: 'block-7',
    fit: 'region',
    region: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 },
    zoom: 1,
  })
  expect(result).not.toHaveProperty('classification')
  expect(result).not.toHaveProperty('content')
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
  { documentId: 'document-1', target: { type: 'block', blockId: '' } },
  {
    documentId: 'document-1',
    target: { type: 'block', blockId: 'x'.repeat(201) },
  },
  {
    documentId: 'document-1',
    target: { type: 'block', blockId: 'block-7', pageId: 'page-2' },
  },
  {
    documentId: 'document-1',
    target: { type: 'block', blockId: 'block-7', region: {
      left: 0, top: 0, width: 0.2, height: 0.2,
    } },
  },
  {
    documentId: 'document-1',
    target: { type: 'block', blockId: 'block-7', extra: true },
  },
  {
    documentId: 'document-1',
    target: {
      type: 'region',
      pageId: 'page-2',
      region: { left: 0, top: 0, width: 0.2, height: 0.2 },
      extra: true,
    },
  },
  {
    documentId: 'document-1',
    target: {
      type: 'region',
      pageId: 'page-2',
      region: { left: 0, top: 0, width: 0.2, height: 0.2, extra: true },
    },
  },
  ...[
    { left: -0.1, top: 0, width: 0.2, height: 0.2 },
    { left: 0, top: -0.1, width: 0.2, height: 0.2 },
    { left: 1.1, top: 0, width: 0.2, height: 0.2 },
    { left: 0, top: 1.1, width: 0.2, height: 0.2 },
    { left: 0, top: 0, width: 0, height: 0.2 },
    { left: 0, top: 0, width: -0.1, height: 0.2 },
    { left: 0, top: 0, width: 0.2, height: 0 },
    { left: 0, top: 0, width: 0.2, height: -0.1 },
    { left: Number.NaN, top: 0, width: 0.2, height: 0.2 },
    { left: 0, top: Number.POSITIVE_INFINITY, width: 0.2, height: 0.2 },
  ].map((region) => ({
    documentId: 'document-1',
    target: { type: 'region', pageId: 'page-2', region },
  })),
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
