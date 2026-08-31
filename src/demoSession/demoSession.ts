import Dexie, { type EntityTable } from 'dexie'

export const DEMO_SESSION_STORAGE_KEY = 'grounded.demo-session-id'

export interface AssistanceRequestRecord {
  id: string
  sessionId: string
  question: string
  responseType: 'point_set'
  documentId: string
  documentVersionId: string
  recommendedPageIds: string[]
  createdAt: string
}

export interface StoredPoint {
  pageId: string
  pageLabel: string
  pageNumber: number
  x: number
  y: number
}

export interface ProfessionalResponseRecord {
  requestId: string
  sessionId: string
  state: 'answered'
  type: 'point_set'
  documentId: string
  documentVersionId: string
  points: StoredPoint[]
  note?: string
  submittedAt: string
}

export class DemoSessionDatabase extends Dexie {
  requests!: EntityTable<AssistanceRequestRecord, 'id'>
  responses!: EntityTable<ProfessionalResponseRecord, 'requestId'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      requests: 'id, [sessionId+createdAt]',
      responses: 'requestId, sessionId',
    })
  }
}

export function getOrCreateDemoSessionId(
  storage: Storage,
  createId: () => string,
) {
  const existing = storage.getItem(DEMO_SESSION_STORAGE_KEY)
  if (existing) return existing

  const sessionId = createId()
  storage.setItem(DEMO_SESSION_STORAGE_KEY, sessionId)
  return sessionId
}
