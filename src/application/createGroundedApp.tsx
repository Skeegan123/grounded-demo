import { createElement } from 'react'
import { createAssistance } from '../assistance/assistance'
import { getOrCreateDemoSessionId } from '../demoSession/demoSession'
import { createDocuments } from '../documents/documents'
import { createBrowserModelContext } from '../webmcp/browserModelContext'
import type { ModelContextAdapter } from '../webmcp/modelContext'
import { createWorkspaceStore } from '../workspace/workspaceStore'
import App from '../App'

export interface GroundedEnvironment {
  databaseName?: string
  modelContext?: ModelContextAdapter
  sessionStorage?: Storage
  createId?: () => string
  now?: () => Date
}

export function createGroundedApp(environment: GroundedEnvironment = {}) {
  const createId = environment.createId ?? (() => crypto.randomUUID())
  const storage = environment.sessionStorage ?? window.sessionStorage
  const sessionId = getOrCreateDemoSessionId(storage, createId)
  const assistance = createAssistance({
    databaseName: environment.databaseName ?? 'grounded',
    sessionId,
    createId,
    now: environment.now ?? (() => new Date()),
  })
  const documents = createDocuments()

  return createElement(App, {
    assistance,
    documents,
    modelContext: environment.modelContext ?? createBrowserModelContext(),
    sessionId,
    workspaceStore: createWorkspaceStore(),
  })
}
