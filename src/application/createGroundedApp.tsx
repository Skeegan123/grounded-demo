import { createElement } from 'react'
import { createAssistance } from '../assistance/assistance'
import { getOrCreateDemoSessionId } from '../demoSession/demoSession'
import { createDocuments } from '../documents/documents'
import type { PdfPageRenderer } from '../documents/PdfPageViewer'
import { createPdfJsPageRenderer } from '../documents/pdfJsPageRenderer'
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
  pageRenderer?: PdfPageRenderer
}

export function createGroundedApp(environment: GroundedEnvironment = {}) {
  const createId = environment.createId ?? (() => crypto.randomUUID())
  const storage = environment.sessionStorage ?? window.sessionStorage
  const sessionId = getOrCreateDemoSessionId({
    storage,
    createSessionId: createId,
  })
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
    pageRenderer: environment.pageRenderer ?? createPdfJsPageRenderer(),
    sessionId,
    workspaceStore: createWorkspaceStore(),
  })
}
