import { useCallback, useEffect, useMemo, useState } from 'react'
import App from '../App'
import { createAssistance } from '../assistance/assistance'
import {
  getOrCreateDemoSessionId,
  startNewDemoSession,
} from '../demoSession/demoSession'
import type { createDocuments } from '../documents/documents'
import type { PdfPageRenderer } from '../documents/PdfPageViewer'
import type { ModelContextAdapter } from '../webmcp/modelContext'
import {
  clearDocumentBrowsingState,
  loadDocumentBrowsingState,
  saveDocumentBrowsingState,
} from '../workspace/documentBrowsingState'
import { createWorkspaceStore } from '../workspace/workspaceStore'

interface GroundedAppHostProps {
  createId: () => string
  databaseName: string
  documents: ReturnType<typeof createDocuments>
  modelContext?: ModelContextAdapter
  now: () => Date
  pageRenderer: PdfPageRenderer
  storage: Storage
}

export function GroundedAppHost({
  createId,
  databaseName,
  documents,
  modelContext,
  now,
  pageRenderer,
  storage,
}: GroundedAppHostProps) {
  const [sessionId, setSessionId] = useState(() =>
    getOrCreateDemoSessionId({ storage, createSessionId: createId }),
  )
  const session = useMemo(() => ({
    assistance: createAssistance({
      databaseName,
      sessionId,
      createId,
      now,
    }),
    workspaceStore: createWorkspaceStore(
      loadDocumentBrowsingState(storage, sessionId),
    ),
  }), [createId, databaseName, now, sessionId, storage])
  useEffect(() => {
    const save = () => {
      const state = session.workspaceStore.getState()
      saveDocumentBrowsingState(storage, sessionId, {
        assistanceCollapsed: state.assistanceCollapsed,
        selectedLocation: state.selectedLocation,
        lastPageIdByDocument: state.lastPageIdByDocument,
        fitPreference: state.fitPreference,
        zoom: state.zoom,
      })
    }
    save()
    return session.workspaceStore.subscribe(save)
  }, [session.workspaceStore, sessionId, storage])
  const startOver = useCallback(() => {
    clearDocumentBrowsingState(storage, sessionId)
    setSessionId(startNewDemoSession({ storage, createSessionId: createId }))
  }, [createId, sessionId, storage])

  return (
    <App
      key={sessionId}
      assistance={session.assistance}
      documents={documents}
      modelContext={modelContext}
      onStartOver={startOver}
      pageRenderer={pageRenderer}
      workspaceStore={session.workspaceStore}
    />
  )
}
