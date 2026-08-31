import Dexie from 'dexie'
import { findDocument, findPage } from '../demoProject/demoProject'
import {
  DemoSessionDatabase,
  type AssistanceRequestRecord,
  type StoredPoint,
} from '../demoSession/demoSession'

export interface CreatePointSetRequest {
  question: string
  responseType: 'point_set'
  documentId: string
  documentVersionId: string
  recommendedPageIds: string[]
}

export interface PointSetDraft {
  requestId: string
  points: StoredPoint[]
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
      professionalResponse: {
        type: 'point_set'
        document: { id: string; versionId: string }
        points: Array<{
          page: { id: string; label: string; number: number }
          x: number
          y: number
        }>
        count: number
        note?: string
        submittedAt: string
      }
    }

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

  async function createRequest(input: CreatePointSetRequest) {
    const document = findDocument(input.documentId, input.documentVersionId)
    if (!document) throw new Error('The target document version does not exist.')

    if (
      input.recommendedPageIds.some(
        (pageId) => !document.pages.some((page) => page.id === pageId),
      )
    ) {
      throw new Error('A recommended page does not belong to the target document.')
    }

    const request: AssistanceRequestRecord = {
      ...input,
      id: options.createId(),
      sessionId: options.sessionId,
      createdAt: options.now().toISOString(),
    }
    await database.requests.add(request)
    notifyListeners()

    return {
      id: request.id,
      state: 'pending' as const,
      createdAt: request.createdAt,
    }
  }

  async function listPending(): Promise<AssistanceRequestView[]> {
    const requests = await database.requests
      .where('[sessionId+createdAt]')
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

  async function answerPointSet(draft: PointSetDraft) {
    await database.transaction(
      'rw',
      database.requests,
      database.responses,
      async () => {
        const request = await database.requests.get(draft.requestId)
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
          points: draft.points.map((point) => ({ ...point })),
          ...(note ? { note } : {}),
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

    const points = response.points.map((point) => ({
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
    answerPointSet,
    close: () => database.close(),
    createRequest,
    getResult,
    listPending,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
