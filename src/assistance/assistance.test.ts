import { expect, test } from 'vitest'
import {
  ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT,
  ASSISTANCE_CONTEXT_CHARACTER_LIMIT,
  ASSISTANCE_QUESTION_CHARACTER_LIMIT,
  ASSISTANCE_RECOMMENDED_PAGE_LIMIT,
  ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT,
  ASSISTANCE_SUPPORTING_PAGE_LIMIT,
  DEMO_SESSION_PENDING_ASSISTANCE_LIMIT,
  createAssistance,
  type CreateAssistanceRequest,
  type CreatePointSetAssistanceRequest,
} from './assistance'
import { DemoSessionDatabase } from '../demoSession/demoSession'

const pointSetRequest: CreatePointSetAssistanceRequest = {
  question: 'Mark the Type C openings.',
  responseType: 'point_set',
  documentId: 'virginia-farmhouse-drawings',
  documentVersionId: 'virginia-farmhouse-drawings-v1',
  recommendedPageIds: ['sheet-a1.2'],
}

function createIds(...ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `unexpected-id-${index}`
}

test('declining the oldest request is final and advances the FIFO queue', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-assistance-decline-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: createIds('request-z', 'request-a'),
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  await assistance.createRequest(pointSetRequest)
  await assistance.createRequest({
    ...pointSetRequest,
    question: 'Confirm the next set of openings.',
  })

  await expect(
    assistance.decline({ requestId: 'request-a', reason: 'Not enough detail.' }),
  ).rejects.toThrow('Assistance Requests must be answered in FIFO order.')

  await assistance.decline({
    requestId: 'request-z',
    reason: 'The drawing is not legible.',
  })

  expect({
    declined: await assistance.getResult('request-z'),
    pending: (await assistance.listPending()).map((request) => request.id),
  }).toEqual({
    declined: {
      id: 'request-z',
      state: 'declined',
      question: 'Mark the Type C openings.',
      createdAt: '2030-01-02T03:04:05.000Z',
      professionalResponse: {
        type: 'declined',
        reason: 'The drawing is not legible.',
        submittedAt: '2030-01-02T03:04:05.000Z',
      },
    },
    pending: ['request-a'],
  })

  await expect(
    assistance.submitPointSetResponse({ requestId: 'request-z', points: [] }),
  ).rejects.toThrow('The Professional Response is already final.')
  assistance.close()
})

test('a text request accepts one non-empty final text response', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-assistance-text-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  await assistance.createRequest({
    question: 'Should the submittal be revised?',
    responseType: 'text',
  })

  await expect(
    assistance.submitPointSetResponse({ requestId: 'request-1', points: [] }),
  ).rejects.toThrow('The Professional Response must use the requested response type.')
  await expect(
    assistance.submitTextResponse({ requestId: 'request-1', text: '   ' }),
  ).rejects.toThrow('A text Professional Response cannot be empty.')

  await assistance.submitTextResponse({
    requestId: 'request-1',
    text: '  Revise and resubmit.  ',
    note: '  The product does not match the schedule.  ',
  })

  expect(await assistance.getResult('request-1')).toEqual({
    id: 'request-1',
    state: 'answered',
    question: 'Should the submittal be revised?',
    createdAt: '2030-01-02T03:04:05.000Z',
    professionalResponse: {
      type: 'text',
      text: 'Revise and resubmit.',
      note: 'The product does not match the schedule.',
      submittedAt: '2030-01-02T03:04:05.000Z',
    },
  })
  await expect(
    assistance.submitTextResponse({ requestId: 'request-1', text: 'Approved.' }),
  ).rejects.toThrow('The Professional Response is already final.')
  assistance.close()
})

test('completed history distinguishes an empty Point Set from a decline', async () => {
  const assistance = createAssistance({
    databaseName: `grounded-assistance-history-${crypto.randomUUID()}`,
    sessionId: 'session-1',
    createId: createIds('request-1', 'request-2'),
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  await assistance.createRequest(pointSetRequest)
  await assistance.createRequest({
    ...pointSetRequest,
    question: 'Mark another set of openings.',
  })
  await assistance.submitPointSetResponse({
    requestId: 'request-1',
    points: [],
    note: 'No matching openings were found.',
  })
  await assistance.decline({ requestId: 'request-2' })

  expect(await assistance.listCompleted()).toEqual([
    {
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
        points: [],
        count: 0,
        note: 'No matching openings were found.',
        submittedAt: '2030-01-02T03:04:05.000Z',
      },
    },
    {
      id: 'request-2',
      state: 'declined',
      question: 'Mark another set of openings.',
      createdAt: '2030-01-02T03:04:05.000Z',
      professionalResponse: {
        type: 'declined',
        submittedAt: '2030-01-02T03:04:05.000Z',
      },
    },
  ])
  assistance.close()
})

test('submission stores fixed Point Numbers across pages', async () => {
  const databaseName = `grounded-assistance-point-numbers-${crypto.randomUUID()}`
  const assistance = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => 'request-1',
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  await assistance.createRequest(pointSetRequest)
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
      {
        pageId: 'sheet-a4.3',
        pageLabel: 'A4.3',
        pageNumber: 24,
        x: 0.5,
        y: 0.5,
      },
    ],
  })

  const database = new DemoSessionDatabase(databaseName)
  const stored = await database.responses.get('request-1')
  expect(stored?.type === 'point_set' ? stored.points : undefined).toEqual([
    expect.objectContaining({ pageId: 'sheet-a1.2', pointNumber: 1 }),
    expect.objectContaining({ pageId: 'sheet-a4.3', pointNumber: 2 }),
  ])

  database.close()
  assistance.close()
})

test('legacy stored Point Sets derive Point Numbers from array order', async () => {
  const databaseName = `grounded-assistance-legacy-point-numbers-${crypto.randomUUID()}`
  const database = new DemoSessionDatabase(databaseName)
  await database.requests.add({
    ...pointSetRequest,
    id: 'request-1',
    sessionId: 'session-1',
    createdAt: '2030-01-02T03:04:05.000Z',
    queuePosition: 1,
  })
  await database.responses.add({
    requestId: 'request-1',
    sessionId: 'session-1',
    state: 'answered',
    type: 'point_set',
    documentId: pointSetRequest.documentId,
    documentVersionId: pointSetRequest.documentVersionId,
    points: [
      {
        pageId: 'sheet-a1.2',
        pageLabel: 'A1.2',
        pageNumber: 6,
        x: 0.25,
        y: 0.75,
      },
      {
        pageId: 'sheet-a4.3',
        pageLabel: 'A4.3',
        pageNumber: 24,
        x: 0.5,
        y: 0.5,
      },
    ],
    submittedAt: '2030-01-02T03:05:06.000Z',
  })
  database.close()

  const assistance = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => 'unused-request',
    now: () => new Date('2030-01-02T03:06:07.000Z'),
  })
  const result = await assistance.getResult('request-1')

  expect(result.state === 'answered' && result.professionalResponse.type === 'point_set'
    ? result.professionalResponse.points
    : undefined).toEqual([
    expect.objectContaining({ pointNumber: 1 }),
    expect.objectContaining({ pointNumber: 2 }),
  ])
  assistance.close()
})

test('the domain rejects bounded Assistance input without modifying the queue', async () => {
  const databaseName = `grounded-assistance-domain-limits-${crypto.randomUUID()}`
  const assistance = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: createIds('request-1', 'request-2'),
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  await assistance.createRequest({
    question: 'q'.repeat(ASSISTANCE_QUESTION_CHARACTER_LIMIT),
    responseType: 'text',
  })
  const before = await assistance.listPending()

  const rejectedInputs: Array<{
    input: CreateAssistanceRequest
    message: string
  }> = [
    {
      input: {
        question: 'q'.repeat(ASSISTANCE_QUESTION_CHARACTER_LIMIT + 1),
        responseType: 'text',
      },
      message: 'An Assistance question can have at most 240 characters.',
    },
    {
      input: {
        question: 'Confirm the Type C count.',
        context: 'c'.repeat(ASSISTANCE_CONTEXT_CHARACTER_LIMIT + 1),
        responseType: 'text',
      },
      message: 'Assistance context can have at most 2,000 characters.',
    },
    {
      input: {
        ...pointSetRequest,
        documentId: 'd'.repeat(ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT + 1),
      },
      message: 'Assistance identifiers can have at most 200 characters.',
    },
    {
      input: {
        ...pointSetRequest,
        recommendedPageIds: Array.from(
          { length: ASSISTANCE_RECOMMENDED_PAGE_LIMIT + 1 },
          (_, index) => `page-${index}`,
        ),
      },
      message: 'Recommended page identifiers are limited to 25 per Assistance Request.',
    },
    {
      input: {
        ...pointSetRequest,
        recommendedPageIds: ['sheet-a1.2', 'sheet-a1.2'],
      },
      message: 'Recommended page identifiers must be unique.',
    },
    {
      input: {
        ...pointSetRequest,
        supportingDocumentReferences: Array.from(
          { length: ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT + 1 },
          (_, index) => ({
            documentId: `document-${index}`,
            documentVersionId: `version-${index}`,
            pageIds: ['page-1'],
          }),
        ),
      },
      message: 'An Assistance Request can have at most 10 supporting document references.',
    },
    {
      input: {
        ...pointSetRequest,
        supportingDocumentReferences: [{
          documentId: 'virginia-farmhouse-drawings',
          documentVersionId: 'virginia-farmhouse-drawings-v1',
          pageIds: Array.from(
            { length: ASSISTANCE_SUPPORTING_PAGE_LIMIT + 1 },
            (_, index) => `page-${index}`,
          ),
        }],
      },
      message: 'Supporting page identifiers are limited to 25 per Assistance Request.',
    },
    {
      input: {
        ...pointSetRequest,
        supportingDocumentReferences: [
          {
            documentId: 'door-package-submittal',
            documentVersionId: 'door-package-submittal-v1',
            pageIds: ['door-package-submittal-cover'],
          },
          {
            documentId: 'door-package-submittal',
            documentVersionId: 'door-package-submittal-v1',
            pageIds: ['door-package-submittal-interior-product-data'],
          },
        ],
      },
      message: 'Supporting document versions must be unique within an Assistance Request.',
    },
  ]

  for (const { input, message } of rejectedInputs) {
    await expect(assistance.createRequest(input)).rejects.toThrow(message)
    await expect(assistance.listPending()).resolves.toEqual(before)
  }

  assistance.close()
})

test('the twenty-sixth pending request is rejected without changing persisted queue state', async () => {
  const databaseName = `grounded-assistance-pending-limit-${crypto.randomUUID()}`
  let nextId = 1
  const assistance = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => `request-${nextId++}`,
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  for (let index = 0; index < DEMO_SESSION_PENDING_ASSISTANCE_LIMIT; index += 1) {
    await assistance.createRequest({
      question: `Question ${index + 1}`,
      responseType: 'text',
    })
  }
  const database = new DemoSessionDatabase(databaseName)
  const before = await database.requests.toArray()

  await expect(assistance.createRequest({
    question: 'This request must not be persisted.',
    responseType: 'text',
  })).rejects.toThrow(
    'A Demo Session can have at most 25 pending Assistance Requests.',
  )

  expect(await database.requests.toArray()).toEqual(before)
  await expect(assistance.listPending()).resolves.toHaveLength(
    DEMO_SESSION_PENDING_ASSISTANCE_LIMIT,
  )
  database.close()
  assistance.close()
})

test('answered and declined requests each free one pending slot', async () => {
  const databaseName = `grounded-assistance-freed-slots-${crypto.randomUUID()}`
  let nextId = 1
  const assistance = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => `request-${nextId++}`,
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  for (let index = 0; index < DEMO_SESSION_PENDING_ASSISTANCE_LIMIT; index += 1) {
    await assistance.createRequest({
      question: `Question ${index + 1}`,
      responseType: 'text',
    })
  }

  await assistance.submitTextResponse({ requestId: 'request-1', text: 'Done.' })
  await expect(assistance.createRequest({
    question: 'Uses the answered request slot.',
    responseType: 'text',
  })).resolves.toMatchObject({ id: 'request-26' })
  await assistance.decline({ requestId: 'request-2' })
  await expect(assistance.createRequest({
    question: 'Uses the declined request slot.',
    responseType: 'text',
  })).resolves.toMatchObject({ id: 'request-27' })

  await expect(assistance.listPending()).resolves.toHaveLength(
    DEMO_SESSION_PENDING_ASSISTANCE_LIMIT,
  )
  await expect(assistance.listCompleted()).resolves.toHaveLength(2)
  assistance.close()
})

test('concurrent creates share the remaining capacity and assign one queue position', async () => {
  const databaseName = `grounded-assistance-concurrent-limit-${crypto.randomUUID()}`
  let seedId = 1
  const seed = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => `request-${seedId++}`,
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  })
  for (let index = 0; index < DEMO_SESSION_PENDING_ASSISTANCE_LIMIT - 1; index += 1) {
    await seed.createRequest({ question: `Question ${index + 1}`, responseType: 'text' })
  }
  const first = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => 'concurrent-a',
    now: () => new Date('2030-01-02T03:04:06.000Z'),
  })
  const second = createAssistance({
    databaseName,
    sessionId: 'session-1',
    createId: () => 'concurrent-b',
    now: () => new Date('2030-01-02T03:04:06.000Z'),
  })

  const results = await Promise.allSettled([
    first.createRequest({ question: 'Concurrent A', responseType: 'text' }),
    second.createRequest({ question: 'Concurrent B', responseType: 'text' }),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)

  const database = new DemoSessionDatabase(databaseName)
  const requests = await database.requests.toArray()
  expect(requests).toHaveLength(DEMO_SESSION_PENDING_ASSISTANCE_LIMIT)
  expect(new Set(requests.map((request) => request.queuePosition)).size)
    .toBe(DEMO_SESSION_PENDING_ASSISTANCE_LIMIT)
  expect(requests.map((request) => request.queuePosition).sort((a, b) => a - b))
    .toEqual(Array.from(
      { length: DEMO_SESSION_PENDING_ASSISTANCE_LIMIT },
      (_, index) => index + 1,
    ))

  database.close()
  first.close()
  second.close()
  seed.close()
})
