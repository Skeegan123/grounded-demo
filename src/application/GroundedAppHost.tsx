import { useCallback, useMemo, useState } from 'react'
import App from '../App'
import { createAssistance } from '../assistance/assistance'
import {
  getOrCreateDemoSessionId,
  startNewDemoSession,
} from '../demoSession/demoSession'
import type { createDocuments } from '../documents/documents'
import type { PdfPageRenderer } from '../documents/PdfPageViewer'
import type { ModelContextAdapter } from '../webmcp/modelContext'
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
    workspaceStore: createWorkspaceStore(),
  }), [createId, databaseName, now, sessionId])
  const startOver = useCallback(() => {
    setSessionId(startNewDemoSession({ storage, createSessionId: createId }))
  }, [createId, storage])

  return (
    <App
      key={sessionId}
      assistance={session.assistance}
      documents={documents}
      modelContext={modelContext}
      onStartOver={startOver}
      pageRenderer={pageRenderer}
      sessionId={sessionId}
      workspaceStore={session.workspaceStore}
    />
  )
}
