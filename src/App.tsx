import { useCallback, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type {
  AssistanceCompletedResult,
  AssistanceRequestView,
  createAssistance,
} from './assistance/assistance'
import type { createDocuments } from './documents/documents'
import { PdfPageViewer, type PdfPageRenderer } from './documents/PdfPageViewer'
import type { NormalizedPoint } from './documents/pageGeometry'
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
  pageRenderer: PdfPageRenderer
  sessionId: string
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

type RegistrationState = 'ready' | 'unsupported' | 'error' | 'registering'

function App({
  assistance,
  documents,
  modelContext,
  pageRenderer,
  sessionId,
  workspaceStore,
}: AppProps) {
  const [pending, setPending] = useState<AssistanceRequestView[]>([])
  const [completed, setCompleted] = useState<AssistanceCompletedResult[]>([])
  const [registration, setRegistration] = useState<RegistrationState>(() =>
    modelContext ? 'registering' : 'unsupported',
  )
  const [registrationError, setRegistrationError] = useState('')
  const [viewedPointSetId, setViewedPointSetId] = useState('')
  const assistanceTab = useStore(workspaceStore, (state) => state.assistanceTab)
  const declineReason = useStore(workspaceStore, (state) => state.declineReason)
  const points = useStore(workspaceStore, (state) => state.points)
  const note = useStore(workspaceStore, (state) => state.note)
  const text = useStore(workspaceStore, (state) => state.text)
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
  const setAssistanceTab = useStore(
    workspaceStore,
    (state) => state.setAssistanceTab,
  )
  const setDeclineReason = useStore(
    workspaceStore,
    (state) => state.setDeclineReason,
  )
  const setNote = useStore(workspaceStore, (state) => state.setNote)
  const setText = useStore(workspaceStore, (state) => state.setText)
  const undoPoint = useStore(workspaceStore, (state) => state.undoPoint)
  const zoomIn = useStore(workspaceStore, (state) => state.zoomIn)
  const zoomOut = useStore(workspaceStore, (state) => state.zoomOut)

  const refresh = useCallback(async () => {
    const [nextPending, nextCompleted] = await Promise.all([
      assistance.listPending(),
      assistance.listCompleted(),
    ])
    setPending(nextPending)
    setCompleted(nextCompleted)
  }, [assistance])

  useEffect(() => {
    let active = true
    let loadRevision = 0
    const load = async () => {
      const revision = ++loadRevision
      const [nextPending, nextCompleted] = await Promise.all([
        assistance.listPending(),
        assistance.listCompleted(),
      ])
      if (active && revision === loadRevision) {
        setPending(nextPending)
        setCompleted(nextCompleted)
      }
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
  const pointSetCurrent = current?.responseType === 'point_set' ? current : undefined
  const targetDocument = pointSetCurrent
    ? findDocument(
        pointSetCurrent.documentId,
        pointSetCurrent.documentVersionId,
      ) ?? defaultDocument
    : defaultDocument
  const targetPageId =
    pointSetCurrent?.recommendedPageIds[0] ?? targetDocument.pages[0]!.id
  const targetPage =
    findPage(targetDocument, targetPageId) ?? targetDocument.pages[0]!
  const recommendedPageLabels = pointSetCurrent?.recommendedPageIds
    .map((pageId) => findPage(targetDocument, pageId)?.label)
    .filter((label): label is string => Boolean(label))
    .join(', ')
  const supportingDocuments = pointSetCurrent?.supportingDocumentReferences
    ?.map((reference) => {
      const document = findDocument(
        reference.documentId,
        reference.documentVersionId,
      )
      if (!document) return undefined
      const pageLabels = reference.pageIds
        .map((pageId) => findPage(document, pageId)?.label)
        .filter((label): label is string => Boolean(label))
      return { document, pageLabels }
    })
    .filter((reference): reference is NonNullable<typeof reference> =>
      Boolean(reference),
    )
  const selectedDocument =
    findDocument(selectedDocumentId, selectedDocumentVersionId) ??
    defaultDocument
  const selectedPage =
    selectedDocument.pages.find((page) => page.id === selectedPageId) ??
    selectedDocument.pages[0]!
  const canMark = Boolean(
    pointSetCurrent &&
      selectedDocument.id === pointSetCurrent.documentId &&
      selectedDocument.versionId === pointSetCurrent.documentVersionId,
  )
  const viewedPointSet = completed.find(
    (result) =>
      result.id === viewedPointSetId &&
      result.professionalResponse.type === 'point_set',
  )
  const visiblePoints = canMark
    ? points
    : viewedPointSet?.professionalResponse.type === 'point_set'
      ? viewedPointSet.professionalResponse.points.map((point) => ({
          pageId: point.page.id,
          pageLabel: point.page.label,
          pageNumber: point.page.number,
          x: point.x,
          y: point.y,
        }))
      : []
  const pointSetRequestId = pointSetCurrent?.id
  const pointSetDocumentId = pointSetCurrent?.documentId
  const pointSetDocumentVersionId = pointSetCurrent?.documentVersionId

  useEffect(() => {
    if (!pointSetRequestId || !pointSetDocumentId || !pointSetDocumentVersionId) {
      return
    }
    selectDocument(
      pointSetDocumentId,
      pointSetDocumentVersionId,
      targetPage.id,
    )
  }, [
    pointSetRequestId,
    pointSetDocumentId,
    pointSetDocumentVersionId,
    selectDocument,
    targetPage.id,
  ])

  const placePoint = ({ x, y }: NormalizedPoint) => {
    if (!canMark) return
    addPoint({
      pageId: selectedPage.id,
      pageLabel: selectedPage.label,
      pageNumber: selectedPage.number,
      x,
      y,
    })
  }

  const submitPointSet = async () => {
    if (!pointSetCurrent) return
    await assistance.submitPointSetResponse({
      requestId: pointSetCurrent.id,
      points,
      ...(note.trim() ? { note } : {}),
    })
    clearDraft()
    await refresh()
  }

  const submitText = async () => {
    if (current?.responseType !== 'text') return
    await assistance.submitTextResponse({
      requestId: current.id,
      text,
      ...(note.trim() ? { note } : {}),
    })
    clearDraft()
    await refresh()
  }

  const declineCurrent = async () => {
    if (!current) return
    await assistance.decline({
      requestId: current.id,
      ...(declineReason.trim() ? { reason: declineReason } : {}),
    })
    clearDraft()
    await refresh()
  }

  const viewPointSet = (result: AssistanceCompletedResult) => {
    if (result.professionalResponse.type !== 'point_set') return
    const document = findDocument(
      result.professionalResponse.document.id,
      result.professionalResponse.document.versionId,
    )
    if (!document) return
    const pageId = result.professionalResponse.points[0]?.page.id ?? document.pages[0]!.id
    setViewedPointSetId(result.id)
    selectDocument(document.id, document.versionId, pageId)
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
            <PdfPageViewer
              canMark={canMark}
              document={selectedDocument}
              onPlacePoint={placePoint}
              page={selectedPage}
              points={visiblePoints}
              renderer={pageRenderer}
              zoom={zoom}
            />
          </div>
        </section>

        <aside className="assistance-pane" aria-labelledby="assistance-title">
          <p className="pane-kicker">FIFO work rail</p>
          <h2 id="assistance-title">Current Assistance</h2>
          <div className="assistance-tabs" role="tablist" aria-label="Assistance Requests">
            {(
              [
                ['current', 'Current', current ? 1 : 0],
                ['queue', 'Queue', Math.max(0, pending.length - 1)],
                ['done', 'Done', completed.length],
              ] as const
            ).map(([tab, label, count]) => (
              <button
                aria-selected={assistanceTab === tab}
                key={tab}
                onClick={() => setAssistanceTab(tab)}
                role="tab"
                type="button"
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>

          {assistanceTab === 'current' && (current ? (
              <div className="request-card">
                <div className="request-meta">
                  <span>Pending</span>
                  <code>{current.id}</code>
                </div>
                <p className="question">{current.question}</p>
                <dl>
                  <div>
                    <dt>Response</dt>
                    <dd>{current.responseType === 'point_set' ? 'Point Set' : 'Text'}</dd>
                  </div>
                  {current.responseType === 'point_set' && (
                    <>
                      <div>
                        <dt>Document</dt>
                        <dd>
                          {targetDocument.title}
                          <small>{targetDocument.versionId}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Recommended pages</dt>
                        <dd>{recommendedPageLabels || 'None'}</dd>
                      </div>
                      {supportingDocuments && supportingDocuments.length > 0 && (
                        <div>
                          <dt>Supporting documents</dt>
                          <dd>
                            <ul className="supporting-documents">
                              {supportingDocuments.map(({ document, pageLabels }) => (
                                <li key={`${document.id}:${document.versionId}`}>
                                  <span>{document.title}</span>
                                  <small>
                                    {document.versionId} · Pages {pageLabels.join(', ')}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>

                {current.responseType === 'point_set' ? (
                  <>
                    <div className="point-controls">
                      <div>
                        <strong>
                          {points.length} {points.length === 1 ? 'point' : 'points'}
                        </strong>
                        <span>
                          {canMark
                            ? 'Click the drawing to mark locations.'
                            : `Open ${targetPage.label} to place points.`}
                        </span>
                      </div>
                      <button
                        disabled={points.length === 0}
                        onClick={undoPoint}
                        type="button"
                      >
                        Undo
                      </button>
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
                  </>
                ) : (
                  <>
                    <label htmlFor="text-response">Text response</label>
                    <textarea
                      id="text-response"
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Enter the Professional Response"
                      value={text}
                    />
                  </>
                )}

                <label htmlFor="response-note">
                  Overall note <span>optional</span>
                </label>
                <textarea
                  id="response-note"
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add context for the External Agent"
                  value={note}
                />
                {current.responseType === 'point_set' ? (
                  <button
                    className="submit-button"
                    onClick={() => void submitPointSet()}
                    type="button"
                  >
                    Submit Point Set
                  </button>
                ) : (
                  <button
                    className="submit-button"
                    disabled={!text.trim()}
                    onClick={() => void submitText()}
                    type="button"
                  >
                    Submit Text Response
                  </button>
                )}

                <div className="decline-controls">
                  <label htmlFor="decline-reason">
                    Decline reason <span>optional</span>
                  </label>
                  <textarea
                    id="decline-reason"
                    onChange={(event) => setDeclineReason(event.target.value)}
                    placeholder="Explain why you cannot make this judgment"
                    value={declineReason}
                  />
                  <button onClick={() => void declineCurrent()} type="button">
                    Decline Request
                  </button>
                </div>

                {pending.length > 1 && (
                  <div className="waiting">
                    <strong>{pending.length - 1} waiting</strong>
                    <span>Next: {pending[1]!.question}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-request">
                <span aria-hidden="true">✓</span>
                <p>No pending Assistance Requests</p>
                <small>An External Agent can queue the next judgment through WebMCP.</small>
              </div>
            ))}

          {assistanceTab === 'queue' && (
            <div className="request-list">
              {pending.slice(1).length > 0 ? pending.slice(1).map((request, index) => (
                <article className="history-card" key={request.id}>
                  <div className="request-meta">
                    <span>Locked · {index + 2} in line</span>
                    <code>{request.id}</code>
                  </div>
                  <p className="question">{request.question}</p>
                  <small>
                    {request.responseType === 'point_set' ? 'Point Set' : 'Text'} response
                  </small>
                </article>
              )) : (
                <div className="empty-request">
                  <p>No later requests in Queue</p>
                  <small>Current must be completed before later work can be answered.</small>
                </div>
              )}
            </div>
          )}

          {assistanceTab === 'done' && (
            <div className="request-list">
              {completed.length > 0 ? completed.map((result) => (
                <article className="history-card" key={result.id}>
                  <div className="request-meta">
                    <span>{result.state === 'answered' ? 'Answered' : 'Declined'}</span>
                    <code>{result.id}</code>
                  </div>
                  <p className="question">{result.question}</p>
                  {result.professionalResponse.type === 'point_set' && (
                    <>
                      <p>{result.professionalResponse.count} {result.professionalResponse.count === 1 ? 'point' : 'points'}</p>
                      <small>
                        {result.professionalResponse.document.id} · {result.professionalResponse.document.versionId}
                      </small>
                      <button
                        className="response-page-button"
                        onClick={() => viewPointSet(result)}
                        type="button"
                      >
                        View Point Set on drawing
                      </button>
                      {result.professionalResponse.points.length > 0 && (
                        <ol className="point-summary">
                          {result.professionalResponse.points.map((point, index) => (
                            <li key={`${point.page.id}:${point.x}:${point.y}:${index}`}>
                              {point.page.label} · {Math.round(point.x * 100)}%, {Math.round(point.y * 100)}%
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  )}
                  {result.professionalResponse.type === 'text' && (
                    <p>{result.professionalResponse.text}</p>
                  )}
                  {result.professionalResponse.type === 'declined' && (
                    <p>{result.professionalResponse.reason ?? 'No reason given.'}</p>
                  )}
                  {'note' in result.professionalResponse && result.professionalResponse.note && (
                    <small>{result.professionalResponse.note}</small>
                  )}
                </article>
              )) : (
                <div className="empty-request">
                  <p>No completed Assistance Requests</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}

export default App
