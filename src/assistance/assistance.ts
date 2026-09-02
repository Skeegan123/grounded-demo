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

export const ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT = 200
export const ASSISTANCE_QUESTION_CHARACTER_LIMIT = 4_000
export const ASSISTANCE_RECOMMENDED_PAGE_LIMIT = 25
export const ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT = 10
export const ASSISTANCE_SUPPORTING_PAGE_LIMIT = 25
export const DEMO_SESSION_PENDING_ASSISTANCE_LIMIT = 25

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

export interface AssistanceRequestState {
  id: string
  state: 'pending' | 'answered' | 'declined'
  responseType: 'point_set' | 'text'
  question: string
  createdAt: string
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

  async function createRequest(input: CreateAssistanceRequest) {
    validateCreateRequest(input)

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
      database.responses,
      async () => {
        const sessionRequests = await database.requests
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
        const pendingCount = sessionRequests.filter(
          (request) => !responseIds.has(request.id),
        ).length
        if (pendingCount >= DEMO_SESSION_PENDING_ASSISTANCE_LIMIT) {
          throw new Error(
            `A Demo Session can have at most ${DEMO_SESSION_PENDING_ASSISTANCE_LIMIT} pending Assistance Requests.`,
          )
        }

        const lastRequest = sessionRequests.at(-1)
        const id = options.createId()
        validateIdentifier(id)
        const nextRequest: AssistanceRequestRecord = {
          ...input,
          id,
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

  async function listRequestStates(): Promise<AssistanceRequestState[]> {
    const requests = await database.requests
      .where('[sessionId+queuePosition]')
      .between(
        [options.sessionId, Dexie.minKey],
        [options.sessionId, Dexie.maxKey],
      )
      .toArray()
    const responses = await database.responses
      .where('sessionId')
      .equals(options.sessionId)
      .toArray()
    const responseByRequestId = new Map(
      responses.map((response) => [response.requestId, response]),
    )

    return requests.map((request) => ({
      id: request.id,
      state: responseByRequestId.get(request.id)?.state ?? 'pending',
      responseType: request.responseType,
      question: request.question,
      createdAt: request.createdAt,
    }))
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
    validateIdentifier(id)
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
    listRequestStates,
    submitPointSetResponse,
    submitTextResponse,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function validateCreateRequest(input: CreateAssistanceRequest) {
  if (input.question.length > ASSISTANCE_QUESTION_CHARACTER_LIMIT) {
    throw new Error(
      `An Assistance question can have at most ${ASSISTANCE_QUESTION_CHARACTER_LIMIT.toLocaleString('en-US')} characters.`,
    )
  }
  if (input.responseType !== 'point_set') return

  validateIdentifier(input.documentId)
  validateIdentifier(input.documentVersionId)
  validateUniqueIdentifiers(
    input.recommendedPageIds,
    ASSISTANCE_RECOMMENDED_PAGE_LIMIT,
    'Recommended page identifiers',
  )

  const references = input.supportingDocumentReferences ?? []
  if (references.length > ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT) {
    throw new Error(
      `An Assistance Request can have at most ${ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT} supporting document references.`,
    )
  }

  const documentVersions = new Set<string>()
  for (const reference of references) {
    validateIdentifier(reference.documentId)
    validateIdentifier(reference.documentVersionId)
    validateUniqueIdentifiers(
      reference.pageIds,
      ASSISTANCE_SUPPORTING_PAGE_LIMIT,
      'Supporting page identifiers',
    )
    const key = documentVersionIdentity(reference)
    if (documentVersions.has(key)) {
      throw new Error(
        'Supporting document versions must be unique within an Assistance Request.',
      )
    }
    documentVersions.add(key)
  }
}

function documentVersionIdentity(
  reference: Pick<
    SupportingDocumentReference,
    'documentId' | 'documentVersionId'
  >,
) {
  return JSON.stringify([reference.documentId, reference.documentVersionId])
}

function validateUniqueIdentifiers(
  identifiers: string[],
  limit: number,
  label: string,
) {
  if (identifiers.length > limit) {
    throw new Error(`${label} are limited to ${limit} per Assistance Request.`)
  }
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error(`${label} must be unique.`)
  }
  identifiers.forEach(validateIdentifier)
}

function validateIdentifier(identifier: string) {
  if (identifier.length > ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT) {
    throw new Error(
      `Assistance identifiers can have at most ${ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT} characters.`,
    )
  }
}
