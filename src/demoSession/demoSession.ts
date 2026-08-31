import Dexie, { type Table } from 'dexie'

export const DEMO_SESSION_STORAGE_KEY = 'grounded.demo-session-id'
const DEMO_TAB_NAME_PREFIX = 'grounded:'

interface BrowserTabContext {
  name: string
}

interface DemoSessionIdentityOptions {
  storage: Storage
  createSessionId: () => string
  tabContext?: BrowserTabContext
  createTabId?: () => string
}

interface StoredDemoSessionIdentity {
  sessionId: string
  tabId: string
}

interface AssistanceRequestRecordBase {
  id: string
  sessionId: string
  question: string
  createdAt: string
  queuePosition: number
}

export interface PointSetRequestRecord extends AssistanceRequestRecordBase {
  responseType: 'point_set'
  documentId: string
  documentVersionId: string
  recommendedPageIds: string[]
}

export interface TextRequestRecord extends AssistanceRequestRecordBase {
  responseType: 'text'
}

export type AssistanceRequestRecord = PointSetRequestRecord | TextRequestRecord

export interface StoredPoint {
  pageId: string
  pageLabel: string
  pageNumber: number
  x: number
  y: number
}

export interface PointSetResponseRecord {
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

export interface DeclinedResponseRecord {
  requestId: string
  sessionId: string
  state: 'declined'
  type: 'declined'
  reason?: string
  submittedAt: string
}

export interface TextResponseRecord {
  requestId: string
  sessionId: string
  state: 'answered'
  type: 'text'
  text: string
  note?: string
  submittedAt: string
}

export type ProfessionalResponseRecord =
  | PointSetResponseRecord
  | TextResponseRecord
  | DeclinedResponseRecord

export class DemoSessionDatabase extends Dexie {
  requests!: Table<AssistanceRequestRecord, string>
  responses!: Table<ProfessionalResponseRecord, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      requests: 'id, [sessionId+createdAt]',
      responses: 'requestId, sessionId',
    })
    this.version(2)
      .stores({
        requests: 'id, [sessionId+queuePosition]',
        responses: 'requestId, sessionId',
      })
      .upgrade(async (transaction) => {
        const requests = await transaction
          .table<AssistanceRequestRecord, string>('requests')
          .toArray()
        requests.sort(
          (left, right) =>
            left.sessionId.localeCompare(right.sessionId) ||
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )
        const nextPosition = new Map<string, number>()
        for (const request of requests) {
          const queuePosition = (nextPosition.get(request.sessionId) ?? 0) + 1
          nextPosition.set(request.sessionId, queuePosition)
          await transaction
            .table<AssistanceRequestRecord, string>('requests')
            .update(request.id, { queuePosition })
        }
      })
  }
}

export function getOrCreateDemoSessionId({
  storage,
  createSessionId,
  tabContext = window,
  createTabId = () => crypto.randomUUID(),
}: DemoSessionIdentityOptions) {
  const existingTabId = tabContext.name.startsWith(DEMO_TAB_NAME_PREFIX)
    ? tabContext.name.slice(DEMO_TAB_NAME_PREFIX.length)
    : ''
  if (!existingTabId) {
    tabContext.name = `${DEMO_TAB_NAME_PREFIX}${createTabId()}`
  }

  const tabId = tabContext.name.slice(DEMO_TAB_NAME_PREFIX.length)
  const stored = storage.getItem(DEMO_SESSION_STORAGE_KEY)
  if (stored) {
    try {
      const existing = JSON.parse(stored) as StoredDemoSessionIdentity
      if (existing.tabId === tabId && existing.sessionId) {
        return existing.sessionId
      }
    } catch {
      // Older tracer builds stored the session identity without its tab owner.
    }
  }

  const sessionId = createSessionId()
  storage.setItem(
    DEMO_SESSION_STORAGE_KEY,
    JSON.stringify({ sessionId, tabId } satisfies StoredDemoSessionIdentity),
  )
  return sessionId
}
