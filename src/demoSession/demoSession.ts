import Dexie, { type EntityTable } from 'dexie'

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
