import { createElement } from 'react'
import { createDocuments } from '../documents/documents'
import type { PdfPageRenderer } from '../documents/PdfPageViewer'
import { createPdfJsPageRenderer } from '../documents/pdfJsPageRenderer'
import { createBrowserModelContext } from '../webmcp/browserModelContext'
import type { ModelContextAdapter } from '../webmcp/modelContext'
import { GroundedAppHost } from './GroundedAppHost'

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
  return createElement(GroundedAppHost, {
    createId,
    databaseName: environment.databaseName ?? 'grounded',
    documents: createDocuments(),
    modelContext: environment.modelContext ?? createBrowserModelContext(),
    now: environment.now ?? (() => new Date()),
    pageRenderer: environment.pageRenderer ?? createPdfJsPageRenderer(),
    storage,
  })
}
