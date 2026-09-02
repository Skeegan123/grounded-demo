import { expect, test } from 'vitest'
import {
  ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT,
  ASSISTANCE_QUESTION_CHARACTER_LIMIT,
  ASSISTANCE_RECOMMENDED_PAGE_LIMIT,
  ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT,
  ASSISTANCE_SUPPORTING_PAGE_LIMIT,
  createAssistance,
} from '../assistance/assistance'
import { demoProject } from '../demoProject/demoProject'
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

test('the public create tool accepts every collection maximum and the empty recommended-page case', async () => {
  let nextId = 1
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-maxima-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => `request-${nextId++}`,
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)
  const drawing = demoProject.documents.find(
    (document) => document.id === 'virginia-farmhouse-drawings',
  )!
  const pageIds = drawing.pages.map((page) => page.id)
  expect(pageIds).toHaveLength(ASSISTANCE_RECOMMENDED_PAGE_LIMIT)
  expect(pageIds).toHaveLength(ASSISTANCE_SUPPORTING_PAGE_LIMIT)

  await expect(modelContext.executeTool('create_assistance_request', {
    question: 'q'.repeat(ASSISTANCE_QUESTION_CHARACTER_LIMIT),
    responseType: 'text',
  })).resolves.toMatchObject({ id: 'request-1' })
  await expect(modelContext.executeTool('create_assistance_request', {
    question: 'No preferred destination.',
    responseType: 'point_set',
    documentId: drawing.id,
    documentVersionId: drawing.versionId,
    recommendedPageIds: [],
  })).resolves.toMatchObject({ id: 'request-2' })
  await expect(modelContext.executeTool('create_assistance_request', {
    question: 'Every drawing page is relevant.',
    responseType: 'point_set',
    documentId: drawing.id,
    documentVersionId: drawing.versionId,
    recommendedPageIds: pageIds,
  })).resolves.toMatchObject({ id: 'request-3' })
  await expect(modelContext.executeTool('create_assistance_request', {
    question: 'Use every drawing page as supporting context.',
    responseType: 'point_set',
    documentId: 'type-c-door-submittal',
    documentVersionId: 'type-c-door-submittal-v1',
    recommendedPageIds: ['door-submittal-page-1'],
    supportingDocumentReferences: [{
      documentId: drawing.id,
      documentVersionId: drawing.versionId,
      pageIds,
    }],
  })).resolves.toMatchObject({ id: 'request-4' })

  const maximumReferences = Array.from(
    { length: ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT },
    (_, index) => ({
      documentId: 'type-c-door-submittal',
      documentVersionId: 'type-c-door-submittal-v1',
      pageIds: [index % 2 === 0
        ? 'door-submittal-page-1'
        : 'door-submittal-page-2'],
    }),
  )
  await expect(modelContext.executeTool('create_assistance_request', {
    question: 'The public contract accepts ten references before domain checks.',
    responseType: 'point_set',
    documentId: drawing.id,
    documentVersionId: drawing.versionId,
    recommendedPageIds: [],
    supportingDocumentReferences: maximumReferences,
  })).rejects.toThrow(
    'Supporting document versions must be unique within an Assistance Request.',
  )

  await expect(assistance.listPending()).resolves.toHaveLength(4)
  controller.abort()
  assistance.close()
})

test('the public tools reject every immediately-above limit without echoing input or changing the queue', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-limit-errors-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)
  const drawing = demoProject.documents.find(
    (document) => document.id === 'virginia-farmhouse-drawings',
  )!
  const pageIds = drawing.pages.map((page) => page.id)
  const oversizedQuestion = `private-${'q'.repeat(
    ASSISTANCE_QUESTION_CHARACTER_LIMIT - 'private-'.length + 1,
  )}`
  const oversizedIdentifier = `private-${'i'.repeat(
    ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT - 'private-'.length + 1,
  )}`
  const validPointSetInput = {
    question: 'Bound this request.',
    responseType: 'point_set' as const,
    documentId: drawing.id,
    documentVersionId: drawing.versionId,
    recommendedPageIds: [] as string[],
  }
  const rejections: Array<{
    input: Record<string, unknown>
    error: string
    payload?: string
  }> = [
    {
      input: { question: oversizedQuestion, responseType: 'text' },
      error: 'Expected string length less or equal to 4000.',
      payload: oversizedQuestion,
    },
    {
      input: { ...validPointSetInput, documentId: oversizedIdentifier },
      error: 'Expected string length less or equal to 200.',
      payload: oversizedIdentifier,
    },
    {
      input: {
        ...validPointSetInput,
        recommendedPageIds: [...pageIds, 'page-26'],
      },
      error: 'Expected array length to be less or equal to 25.',
    },
    {
      input: {
        ...validPointSetInput,
        recommendedPageIds: ['sheet-a1.2', 'sheet-a1.2'],
      },
      error: 'Expected array elements to be unique.',
    },
    {
      input: {
        ...validPointSetInput,
        supportingDocumentReferences: [{
          documentId: drawing.id,
          documentVersionId: drawing.versionId,
          pageIds: [...pageIds, 'page-26'],
        }],
      },
      error: 'Expected array length to be less or equal to 25.',
    },
    {
      input: {
        ...validPointSetInput,
        supportingDocumentReferences: [{
          documentId: drawing.id,
          documentVersionId: drawing.versionId,
          pageIds: ['sheet-a1.2', 'sheet-a1.2'],
        }],
      },
      error: 'Expected array elements to be unique.',
    },
    {
      input: {
        ...validPointSetInput,
        supportingDocumentReferences: Array.from(
          { length: ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT + 1 },
          () => ({
            documentId: drawing.id,
            documentVersionId: drawing.versionId,
            pageIds: ['sheet-a1.2'],
          }),
        ),
      },
      error: 'Expected array length to be less or equal to 10.',
    },
  ]

  for (const rejection of rejections) {
    try {
      await modelContext.executeTool('create_assistance_request', rejection.input)
      expect.unreachable('Expected the public create tool to reject the input.')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(rejection.error)
      if (rejection.payload) {
        expect((error as Error).message).not.toContain(rejection.payload)
      }
    }
    await expect(assistance.listPending()).resolves.toEqual([])
  }

  await expect(modelContext.executeTool('get_assistance_request', {
    id: 'i'.repeat(ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT),
  })).rejects.toThrow('The Assistance Request does not exist in this Demo Session.')
  await expect(modelContext.executeTool('get_assistance_request', {
    id: oversizedIdentifier,
  })).rejects.toThrow('Expected string length less or equal to 200.')

  controller.abort()
  assistance.close()
})

test('the public create tool rejects duplicate supporting document versions at the domain boundary', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-webmcp-duplicate-versions-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerAssistanceTools(modelContext, assistance, controller.signal)

  await expect(modelContext.executeTool('create_assistance_request', {
    question: 'These references identify the same immutable document version.',
    responseType: 'point_set',
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    recommendedPageIds: [],
    supportingDocumentReferences: [
      {
        documentId: 'type-c-door-submittal',
        documentVersionId: 'type-c-door-submittal-v1',
        pageIds: ['door-submittal-page-1'],
      },
      {
        documentId: 'type-c-door-submittal',
        documentVersionId: 'type-c-door-submittal-v1',
        pageIds: ['door-submittal-page-2'],
      },
    ],
  })).rejects.toThrow(
    'Supporting document versions must be unique within an Assistance Request.',
  )
  await expect(assistance.listPending()).resolves.toEqual([])

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
              question: {
                type: 'string',
                minLength: 1,
                maxLength: 4000,
                pattern: '\\S',
              },
              responseType: { const: 'point_set', type: 'string' },
              documentId: { type: 'string', minLength: 1, maxLength: 200 },
              documentVersionId: { type: 'string', minLength: 1, maxLength: 200 },
              recommendedPageIds: {
                type: 'array',
                maxItems: 25,
                uniqueItems: true,
                items: { type: 'string', minLength: 1, maxLength: 200 },
              },
              supportingDocumentReferences: {
                type: 'array',
                minItems: 1,
                maxItems: 10,
                items: {
                  type: 'object',
                  properties: {
                    documentId: { type: 'string', minLength: 1, maxLength: 200 },
                    documentVersionId: { type: 'string', minLength: 1, maxLength: 200 },
                    pageIds: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 25,
                      uniqueItems: true,
                      items: { type: 'string', minLength: 1, maxLength: 200 },
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
              question: {
                type: 'string',
                minLength: 1,
                maxLength: 4000,
                pattern: '\\S',
              },
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
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 200 },
        },
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
                pointNumber: 1,
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
