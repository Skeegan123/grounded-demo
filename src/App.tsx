import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import type {
  AssistanceRequestView,
  createAssistance,
} from './assistance/assistance'
import type { createDocuments } from './documents/documents'
import {
  demoProject,
  findDocument,
  findPage,
} from './demoProject/demoProject'
import { registerAssistanceTools } from './webmcp/registerAssistanceTools'
import { registerDocumentTools } from './webmcp/registerDocumentTools'
import type { ModelContextAdapter } from './webmcp/modelContext'
import type { createWorkspaceStore } from './workspace/workspaceStore'
import './App.css'

interface AppProps {
  assistance: ReturnType<typeof createAssistance>
  documents: ReturnType<typeof createDocuments>
  modelContext?: ModelContextAdapter
  sessionId: string
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

type RegistrationState = 'ready' | 'unsupported' | 'error' | 'registering'

function App({ assistance, documents, modelContext, sessionId, workspaceStore }: AppProps) {
  const [pending, setPending] = useState<AssistanceRequestView[]>([])
  const [registration, setRegistration] = useState<RegistrationState>(() =>
    modelContext ? 'registering' : 'unsupported',
  )
  const [registrationError, setRegistrationError] = useState('')
  const points = useStore(workspaceStore, (state) => state.points)
  const note = useStore(workspaceStore, (state) => state.note)
  const selectedDocumentId = useStore(
    workspaceStore,
    (state) => state.selectedDocumentId,
  )
  const selectedDocumentVersionId = useStore(
    workspaceStore,
    (state) => state.selectedDocumentVersionId,
  )
  const selectedPageId = useStore(workspaceStore, (state) => state.selectedPageId)
  const zoom = useStore(workspaceStore, (state) => state.zoom)
  const addPoint = useStore(workspaceStore, (state) => state.addPoint)
  const clearDraft = useStore(workspaceStore, (state) => state.clearDraft)
  const selectDocument = useStore(workspaceStore, (state) => state.selectDocument)
  const selectPage = useStore(workspaceStore, (state) => state.selectPage)
  const setNote = useStore(workspaceStore, (state) => state.setNote)
  const undoPoint = useStore(workspaceStore, (state) => state.undoPoint)
  const zoomIn = useStore(workspaceStore, (state) => state.zoomIn)
  const zoomOut = useStore(workspaceStore, (state) => state.zoomOut)

  const refresh = useCallback(async () => {
    setPending(await assistance.listPending())
  }, [assistance])

  useEffect(() => {
    let active = true
    const load = async () => {
      const requests = await assistance.listPending()
      if (active) setPending(requests)
    }
    void load()
    const unsubscribe = assistance.subscribe(() => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [assistance])

  useEffect(() => {
    if (!modelContext) return
    const controller = new AbortController()
    Promise.all([
      registerAssistanceTools(modelContext, assistance, controller.signal),
      registerDocumentTools(modelContext, documents, controller.signal),
    ])
      .then(() => setRegistration('ready'))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRegistration('error')
        setRegistrationError(
          error instanceof Error ? error.message : 'Tool registration failed.',
        )
      })
    return () => controller.abort()
  }, [assistance, documents, modelContext])

  useEffect(() => () => assistance.close(), [assistance])

  const defaultDocument = demoProject.documents[0]!
  const current = pending[0]
  const targetDocument = current
    ? findDocument(current.documentId, current.documentVersionId) ?? defaultDocument
    : defaultDocument
  const targetPageId = current?.recommendedPageIds[0] ?? targetDocument.pages[0]!.id
  const targetPage =
    findPage(targetDocument, targetPageId) ?? targetDocument.pages[0]!
  const selectedDocument =
    findDocument(selectedDocumentId, selectedDocumentVersionId) ??
    defaultDocument
  const selectedPage =
    selectedDocument.pages.find((page) => page.id === selectedPageId) ??
    selectedDocument.pages[0]!
  const canMark = Boolean(
    current &&
      selectedDocument.id === current.documentId &&
      selectedDocument.versionId === current.documentVersionId &&
      selectedPage.id === targetPage.id,
  )

  useEffect(() => {
    if (!current) return
    selectDocument(current.documentId, current.documentVersionId, targetPage.id)
  }, [current, selectDocument, targetPage.id])

  const placePoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!canMark) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    addPoint({
      pageId: selectedPage.id,
      pageLabel: selectedPage.label,
      pageNumber: selectedPage.number,
      x,
      y,
    })
  }

  const submitPointSet = async () => {
    if (!current) return
    await assistance.answerPointSet({
      requestId: current.id,
      points,
      ...(note.trim() ? { note } : {}),
    })
    clearDraft()
    await refresh()
  }

  const statusCopy = {
    ready: 'WebMCP ready',
    unsupported: 'WebMCP unavailable',
    error: 'Registration failed',
    registering: 'Registering tools',
  }[registration]

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <a className="wordmark" href="/" aria-label="Grounded home">
            <span className="wordmark-mark" aria-hidden="true" />
            Grounded
          </a>
          <p>{demoProject.title}</p>
        </div>
        <div className="session-status">
          <span className={`status-dot status-${registration}`} aria-hidden="true" />
          <span>{statusCopy}</span>
          <code>{sessionId.slice(0, 8)}</code>
        </div>
      </header>

      {registration === 'error' && (
        <p className="error-banner" role="alert">{registrationError}</p>
      )}

      <div className="workspace-grid">
        <aside className="documents-pane" aria-labelledby="documents-title">
          <p className="pane-kicker">Demo Project</p>
          <h2 id="documents-title">Project Documents</h2>
          <nav aria-label="Project documents">
            {demoProject.documents.map((document) => (
              <button
                className={
                  document.id === selectedDocument.id &&
                  document.versionId === selectedDocument.versionId
                    ? 'document active'
                    : 'document'
                }
                key={`${document.id}:${document.versionId}`}
                onClick={() =>
                  selectDocument(
                    document.id,
                    document.versionId,
                    document.pages[0]!.id,
                  )
                }
                type="button"
              >
                <span>{document.title}</span>
                <small>{document.description}</small>
              </button>
            ))}
          </nav>
        </aside>

        <section className="document-pane" aria-labelledby="work-area-title">
          <div className="pane-heading">
            <div>
              <p className="pane-kicker">Document work area</p>
              <h1 id="work-area-title">{selectedDocument.title}</h1>
            </div>
            <span className="sheet-chip">
              {selectedPage.sheetNumber ? 'Sheet' : 'Page'} {selectedPage.label}
            </span>
          </div>
          <div className="document-toolbar">
            <label>
              <span>Document page</span>
              <select
                aria-label="Document page"
                onChange={(event) => selectPage(event.target.value)}
                value={selectedPage.id}
              >
                {selectedDocument.pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.label} - {page.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="zoom-controls" aria-label="Document zoom">
              <button onClick={zoomOut} type="button" aria-label="Zoom out">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn} type="button" aria-label="Zoom in">+</button>
            </div>
            <a
              href={`${selectedDocument.file.url}#page=${selectedPage.number}`}
              rel="noreferrer"
              target="_blank"
            >
              Open authoritative PDF
            </a>
          </div>
          <div className="drawing-stage">
            <div
              aria-label={`Drawing page ${selectedPage.label}`}
              className={canMark ? 'drawing-page marking' : 'drawing-page'}
              onClick={placePoint}
              role={canMark ? 'button' : undefined}
              style={{ transform: `scale(${zoom})` }}
              tabIndex={canMark ? 0 : -1}
            >
              <div className="page-reference">
                <span>{selectedPage.sheetNumber ?? `PDF page ${selectedPage.number}`}</span>
                <strong>{selectedPage.title}</strong>
                <small>The original PDF remains authoritative.</small>
              </div>
              {points.filter((point) => point.pageId === selectedPage.id).map((point, index) => (
                <span
                  className="point-mark"
                  key={`${point.x}-${point.y}-${index}`}
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                >
                  {index + 1}
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className="assistance-pane" aria-labelledby="assistance-title">
          <p className="pane-kicker">FIFO work rail</p>
          <h2 id="assistance-title">Current Assistance</h2>
          {current ? (
            <div className="request-card">
              <div className="request-meta"><span>Pending</span><code>{current.id}</code></div>
              <p className="question">{current.question}</p>
              <dl>
                <div><dt>Response</dt><dd>Point Set</dd></div>
                <div><dt>Page</dt><dd>{targetPage.label}</dd></div>
              </dl>
              <div className="point-controls">
                <div>
                  <strong>{points.length} {points.length === 1 ? 'point' : 'points'}</strong>
                  <span>
                    {canMark
                      ? 'Click the drawing to mark locations.'
                      : `Open ${targetPage.label} to place points.`}
                  </span>
                </div>
                <button disabled={points.length === 0} onClick={undoPoint} type="button">Undo</button>
              </div>
              {!canMark && (
                <button
                  className="response-page-button"
                  onClick={() =>
                    selectDocument(
                      targetDocument.id,
                      targetDocument.versionId,
                      targetPage.id,
                    )
                  }
                  type="button"
                >
                  Open requested page
                </button>
              )}
              <label htmlFor="point-set-note">Overall note <span>optional</span></label>
              <textarea
                id="point-set-note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add context for the External Agent"
                value={note}
              />
              <button className="submit-button" onClick={() => void submitPointSet()} type="button">
                Submit Point Set
              </button>
              {pending.length > 1 && <p className="waiting">{pending.length - 1} waiting</p>}
            </div>
          ) : (
            <div className="empty-request">
              <span aria-hidden="true">✓</span>
              <p>No pending Assistance Requests</p>
              <small>An External Agent can queue the next judgment through WebMCP.</small>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}

export default App
