import { expect, test } from 'vitest'
import { createAssistance } from '../assistance/assistance'
import { createRecordingModelContext } from './recordingModelContext'
import { registerAssistanceTools } from './registerAssistanceTools'

test('the create tool rejects a blank question through its TypeBox contract', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)

  await expect(
    modelContext.executeTool('create_assistance_request', {
      question: '   ',
      responseType: 'point_set',
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      recommendedPageIds: ['sheet-a1.2'],
    }),
  ).rejects.toThrow('Invalid input at /question.')

  controller.abort()
  assistance.close()
})

test('a Point Set request carries supporting document references into the queue', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-supporting-documents-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)

  await modelContext.executeTool('create_assistance_request', {
    question: 'Mark the Type C openings affected by the product mismatch.',
    responseType: 'point_set',
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    recommendedPageIds: ['sheet-a1.2'],
    supportingDocumentReferences: [
      {
        documentId: 'type-c-door-submittal',
        documentVersionId: 'type-c-door-submittal-v1',
        pageIds: ['door-submittal-page-1', 'door-submittal-page-2'],
      },
    ],
  })

  await expect(assistance.listPending()).resolves.toEqual([
    expect.objectContaining({
      id: 'request-1',
      supportingDocumentReferences: [
        {
          documentId: 'type-c-door-submittal',
          documentVersionId: 'type-c-door-submittal-v1',
          pageIds: ['door-submittal-page-1', 'door-submittal-page-2'],
        },
      ],
    }),
  ])

  controller.abort()
  assistance.close()
})

test('the recording adapter locks the initial Point Set tool contract', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-contract-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)

  const createResult = await modelContext.executeTool(
    'create_assistance_request',
    {
      question: 'Mark the Type C openings.',
      responseType: 'point_set',
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      recommendedPageIds: ['sheet-a1.2'],
    },
  )
  const pendingResult = await modelContext.executeTool(
    'get_assistance_request',
    { id: 'request-1' },
  )
  await assistance.submitPointSetResponse({
    requestId: 'request-1',
    points: [
      {
        pageId: 'sheet-a1.2',
        pageLabel: 'A1.2',
        pageNumber: 6,
        x: 0.25,
        y: 0.75,
      },
    ],
    note: 'Three Type C openings are shown on this sheet.',
  })
  const answeredResult = await modelContext.executeTool(
    'get_assistance_request',
    { id: 'request-1' },
  )
  const createTool = modelContext.getTool('create_assistance_request')
  const getTool = modelContext.getTool('get_assistance_request')

  expect({
    create: {
      name: createTool?.name,
      annotations: createTool?.annotations,
      inputSchema: JSON.parse(JSON.stringify(createTool?.inputSchema)),
      result: createResult,
    },
    get: {
      name: getTool?.name,
      annotations: getTool?.annotations,
      inputSchema: JSON.parse(JSON.stringify(getTool?.inputSchema)),
      results: { pending: pendingResult, answered: answeredResult },
    },
  }).toEqual({
    create: {
      name: 'create_assistance_request',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              question: { type: 'string', minLength: 1, pattern: '\\S' },
              responseType: { const: 'point_set', type: 'string' },
              documentId: { type: 'string', minLength: 1 },
              documentVersionId: { type: 'string', minLength: 1 },
              recommendedPageIds: {
                type: 'array',
                items: { type: 'string', minLength: 1 },
              },
              supportingDocumentReferences: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    documentId: { type: 'string', minLength: 1 },
                    documentVersionId: { type: 'string', minLength: 1 },
                    pageIds: {
                      type: 'array',
                      minItems: 1,
                      uniqueItems: true,
                      items: { type: 'string', minLength: 1 },
                    },
                  },
                  required: ['documentId', 'documentVersionId', 'pageIds'],
                  additionalProperties: false,
                },
              },
            },
            required: [
              'question',
              'responseType',
              'documentId',
              'documentVersionId',
              'recommendedPageIds',
            ],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              question: { type: 'string', minLength: 1, pattern: '\\S' },
              responseType: { const: 'text', type: 'string' },
            },
            required: ['question', 'responseType'],
            additionalProperties: false,
          },
        ],
      },
      result: {
        id: 'request-1',
        state: 'pending',
        createdAt: '2030-01-02T03:04:05.000Z',
      },
    },
    get: {
      name: 'get_assistance_request',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', minLength: 1 } },
        required: ['id'],
        additionalProperties: false,
      },
      results: {
        pending: {
          id: 'request-1',
          state: 'pending',
          question: 'Mark the Type C openings.',
          createdAt: '2030-01-02T03:04:05.000Z',
        },
        answered: {
          id: 'request-1',
          state: 'answered',
          question: 'Mark the Type C openings.',
          createdAt: '2030-01-02T03:04:05.000Z',
          professionalResponse: {
            type: 'point_set',
            document: {
              id: 'virginia-farmhouse-drawings',
              versionId: 'virginia-farmhouse-drawings-v1',
            },
            points: [
              {
                page: { id: 'sheet-a1.2', label: 'A1.2', number: 6 },
                x: 0.25,
                y: 0.75,
              },
            ],
            count: 1,
            note: 'Three Type C openings are shown on this sheet.',
            submittedAt: '2030-01-02T03:04:05.000Z',
          },
        },
      },
    },
  })

  controller.abort()
  assistance.close()
})

test('the create and get tools carry a text request through its final response', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-text-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)

  await expect(
    modelContext.executeTool('create_assistance_request', {
      question: 'Should this submittal be revised?',
      responseType: 'text',
    }),
  ).resolves.toEqual({
    id: 'request-1',
    state: 'pending',
    createdAt: '2030-01-02T03:04:05.000Z',
  })
  await assistance.submitTextResponse({
    requestId: 'request-1',
    text: 'Revise and resubmit.',
  })

  await expect(
    modelContext.executeTool('get_assistance_request', { id: 'request-1' }),
  ).resolves.toEqual({
    id: 'request-1',
    state: 'answered',
    question: 'Should this submittal be revised?',
    createdAt: '2030-01-02T03:04:05.000Z',
    professionalResponse: {
      type: 'text',
      text: 'Revise and resubmit.',
      submittedAt: '2030-01-02T03:04:05.000Z',
    },
  })

  controller.abort()
  assistance.close()
})

test('the get tool returns a declined request as a distinct final state', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-decline-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)
  await modelContext.executeTool('create_assistance_request', {
    question: 'Mark the Type C openings.',
    responseType: 'point_set',
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    recommendedPageIds: ['sheet-a1.2'],
  })
  await assistance.decline({
    requestId: 'request-1',
    reason: 'The drawing is not legible.',
  })

  await expect(
    modelContext.executeTool('get_assistance_request', { id: 'request-1' }),
  ).resolves.toEqual({
    id: 'request-1',
    state: 'declined',
    question: 'Mark the Type C openings.',
    createdAt: '2030-01-02T03:04:05.000Z',
    professionalResponse: {
      type: 'declined',
      reason: 'The drawing is not legible.',
      submittedAt: '2030-01-02T03:04:05.000Z',
    },
  })

  controller.abort()
  assistance.close()
})
