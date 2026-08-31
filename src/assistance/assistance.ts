import Dexie from 'dexie'
import {
  findDocument,
  findPage,
  type SupportingDocumentReference,
} from '../demoProject/demoProject'
import {
  DemoSessionDatabase,
  type AssistanceRequestRecord,
  type StoredPoint,
} from '../demoSession/demoSession'

export interface CreatePointSetAssistanceRequest {
  question: string
  responseType: 'point_set'
  documentId: string
  documentVersionId: string
  recommendedPageIds: string[]
  supportingDocumentReferences?: SupportingDocumentReference[]
}

export interface CreateTextAssistanceRequest {
  question: string
  responseType: 'text'
}

export type CreateAssistanceRequest =
  | CreatePointSetAssistanceRequest
  | CreateTextAssistanceRequest

export interface PointSetDraft {
  requestId: string
  points: StoredPoint[]
  note?: string
}

export interface DeclineDraft {
  requestId: string
  reason?: string
}

export interface TextDraft {
  requestId: string
  text: string
  note?: string
}

export type AssistanceRequestView = AssistanceRequestRecord & {
  state: 'pending'
}

export type AssistanceResult =
  | {
      id: string
      state: 'pending'
      question: string
      createdAt: string
    }
  | {
      id: string
      state: 'answered'
      question: string
      createdAt: string
      professionalResponse:
        | {
            type: 'point_set'
            document: { id: string; versionId: string }
            points: Array<{
              pointNumber: number
              page: { id: string; label: string; number: number }
              x: number
              y: number
            }>
            count: number
            note?: string
            submittedAt: string
          }
        | {
            type: 'text'
            text: string
            note?: string
            submittedAt: string
          }
    }
  | {
      id: string
      state: 'declined'
      question: string
      createdAt: string
      professionalResponse: {
        type: 'declined'
        reason?: string
        submittedAt: string
      }
    }

export type AssistanceCompletedResult = Exclude<
  AssistanceResult,
  { state: 'pending' }
>

export interface AssistanceOptions {
  databaseName: string
  sessionId: string
  createId: () => string
  now: () => Date
}

export function createAssistance(options: AssistanceOptions) {
  const database = new DemoSessionDatabase(options.databaseName)
  const listeners = new Set<() => void>()
  const notifyListeners = () => listeners.forEach((listener) => listener())

  async function createRequest(input: CreateAssistanceRequest) {
    if (input.responseType === 'point_set') {
      const document = findDocument(input.documentId, input.documentVersionId)
      if (!document) throw new Error('The target document version does not exist.')

      if (
        input.recommendedPageIds.some(
          (pageId) => !document.pages.some((page) => page.id === pageId),
        )
      ) {
        throw new Error('A recommended page does not belong to the target document.')
      }

      for (const reference of input.supportingDocumentReferences ?? []) {
        const supportingDocument = findDocument(
          reference.documentId,
          reference.documentVersionId,
        )
        if (!supportingDocument) {
          throw new Error('A supporting document version does not exist.')
        }
        if (
          reference.pageIds.some(
            (pageId) =>
              !supportingDocument.pages.some((page) => page.id === pageId),
          )
        ) {
          throw new Error(
            'A supporting page does not belong to its document version.',
          )
        }
      }
    }

    const request = await database.transaction(
      'rw',
      database.requests,
      async () => {
        const lastRequest = await database.requests
          .where('[sessionId+queuePosition]')
          .between(
            [options.sessionId, Dexie.minKey],
            [options.sessionId, Dexie.maxKey],
          )
          .last()
        const nextRequest: AssistanceRequestRecord = {
          ...input,
          id: options.createId(),
          sessionId: options.sessionId,
          createdAt: options.now().toISOString(),
          queuePosition: (lastRequest?.queuePosition ?? 0) + 1,
        }
        await database.requests.add(nextRequest)
        return nextRequest
      },
    )
    notifyListeners()

    return {
      id: request.id,
      state: 'pending' as const,
      createdAt: request.createdAt,
    }
  }

  async function listPending(): Promise<AssistanceRequestView[]> {
    const requests = await database.requests
      .where('[sessionId+queuePosition]')
      .between(
        [options.sessionId, Dexie.minKey],
        [options.sessionId, Dexie.maxKey],
      )
      .toArray()
    const responseIds = new Set(
      (
        await database.responses
          .where('sessionId')
          .equals(options.sessionId)
          .toArray()
      ).map((response) => response.requestId),
    )

    return requests
      .filter((request) => !responseIds.has(request.id))
      .map((request) => ({ ...request, state: 'pending' as const }))
  }

  async function listCompleted(): Promise<AssistanceCompletedResult[]> {
    const requests = await database.requests
      .where('[sessionId+queuePosition]')
      .between(
        [options.sessionId, Dexie.minKey],
        [options.sessionId, Dexie.maxKey],
      )
      .toArray()
    const responseIds = new Set(
      (
        await database.responses
          .where('sessionId')
          .equals(options.sessionId)
          .toArray()
      ).map((response) => response.requestId),
    )
    const results = await Promise.all(
      requests
        .filter((request) => responseIds.has(request.id))
        .map((request) => getResult(request.id)),
    )

    return results.filter(
      (result): result is AssistanceCompletedResult =>
        result.state !== 'pending',
    )
  }

  async function requireCurrentPendingRequest(requestId: string) {
    const request = await database.requests.get(requestId)
    if (!request || request.sessionId !== options.sessionId) {
      throw new Error('The Assistance Request does not exist.')
    }
    if (await database.responses.get(request.id)) {
      throw new Error('The Professional Response is already final.')
    }

    const pending = await listPending()
    if (pending[0]?.id !== request.id) {
      throw new Error('Assistance Requests must be answered in FIFO order.')
    }
    return request
  }

  async function submitPointSetResponse(draft: PointSetDraft) {
    await database.transaction(
      'rw',
      database.requests,
      database.responses,
      async () => {
        const request = await requireCurrentPendingRequest(draft.requestId)
        if (request.responseType !== 'point_set') {
          throw new Error('The Professional Response must use the requested response type.')
        }
        const hasInvalidPoint = draft.points.some((point) => {
          const page = findPage(
            {
              id: request.documentId,
              versionId: request.documentVersionId,
            },
            point.pageId,
          )
          return (
            point.x < 0 ||
            point.x > 1 ||
            point.y < 0 ||
            point.y > 1 ||
            !page ||
            point.pageLabel !== page.label ||
            point.pageNumber !== page.number
          )
        })
        if (hasInvalidPoint) {
          throw new Error('Every point must reference the target document and use normalized coordinates.')
        }

        const note = draft.note?.trim()
        await database.responses.add({
          requestId: request.id,
          sessionId: options.sessionId,
          state: 'answered',
          type: 'point_set',
          documentId: request.documentId,
          documentVersionId: request.documentVersionId,
          points: draft.points.map((point, index) => ({
            ...point,
            pointNumber: index + 1,
          })),
          ...(note ? { note } : {}),
          submittedAt: options.now().toISOString(),
        })
      },
    )
    notifyListeners()
  }

  async function submitTextResponse(draft: TextDraft) {
    await database.transaction(
      'rw',
      database.requests,
      database.responses,
      async () => {
        const request = await requireCurrentPendingRequest(draft.requestId)
        if (request.responseType !== 'text') {
          throw new Error('The Professional Response must use the requested response type.')
        }

        const text = draft.text.trim()
        if (!text) {
          throw new Error('A text Professional Response cannot be empty.')
        }
        const note = draft.note?.trim()
        await database.responses.add({
          requestId: request.id,
          sessionId: options.sessionId,
          state: 'answered',
          type: 'text',
          text,
          ...(note ? { note } : {}),
          submittedAt: options.now().toISOString(),
        })
      },
    )
    notifyListeners()
  }

  async function decline(draft: DeclineDraft) {
    await database.transaction(
      'rw',
      database.requests,
      database.responses,
      async () => {
        const request = await requireCurrentPendingRequest(draft.requestId)

        const reason = draft.reason?.trim()
        await database.responses.add({
          requestId: request.id,
          sessionId: options.sessionId,
          state: 'declined',
          type: 'declined',
          ...(reason ? { reason } : {}),
          submittedAt: options.now().toISOString(),
        })
      },
    )
    notifyListeners()
  }

  async function getResult(id: string): Promise<AssistanceResult> {
    const request = await database.requests.get(id)
    if (!request || request.sessionId !== options.sessionId) {
      throw new Error('The Assistance Request does not exist in this Demo Session.')
    }
    const response = await database.responses.get(id)
    if (!response) {
      return {
        id: request.id,
        state: 'pending',
        question: request.question,
        createdAt: request.createdAt,
      }
    }

    if (response.state === 'declined') {
      return {
        id: request.id,
        state: 'declined',
        question: request.question,
        createdAt: request.createdAt,
        professionalResponse: {
          type: 'declined',
          ...(response.reason ? { reason: response.reason } : {}),
          submittedAt: response.submittedAt,
        },
      }
    }

    if (response.type === 'text') {
      return {
        id: request.id,
        state: 'answered',
        question: request.question,
        createdAt: request.createdAt,
        professionalResponse: {
          type: 'text',
          text: response.text,
          ...(response.note ? { note: response.note } : {}),
          submittedAt: response.submittedAt,
        },
      }
    }

    const points = response.points.map((point, index) => ({
      pointNumber: point.pointNumber ?? index + 1,
      page: {
        id: point.pageId,
        label: point.pageLabel,
        number: point.pageNumber,
      },
      x: point.x,
      y: point.y,
    }))

    return {
      id: request.id,
      state: 'answered',
      question: request.question,
      createdAt: request.createdAt,
      professionalResponse: {
        type: 'point_set',
        document: {
          id: response.documentId,
          versionId: response.documentVersionId,
        },
        points,
        count: points.length,
        ...(response.note ? { note: response.note } : {}),
        submittedAt: response.submittedAt,
      },
    }
  }

  return {
    close: () => database.close(),
    createRequest,
    decline,
    getResult,
    listCompleted,
    listPending,
    submitPointSetResponse,
    submitTextResponse,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
