import { expect, test } from 'vitest'
import {
  createAssistance,
  type CreatePointSetRequest,
} from './assistance'

const pointSetRequest: CreatePointSetRequest = {
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
    assistance.answerPointSet({ requestId: 'request-z', points: [] }),
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
    assistance.answerPointSet({ requestId: 'request-1', points: [] }),
  ).rejects.toThrow('The Professional Response must use the requested response type.')
  await expect(
    assistance.answerText({ requestId: 'request-1', text: '   ' }),
  ).rejects.toThrow('A text Professional Response cannot be empty.')

  await assistance.answerText({
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
    assistance.answerText({ requestId: 'request-1', text: 'Approved.' }),
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
  await assistance.answerPointSet({
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
