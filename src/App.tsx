import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useStore } from 'zustand'
import type {
  AssistanceCompletedResult,
  AssistanceRequestView,
  createAssistance,
} from './assistance/assistance'
import type { createDocuments } from './documents/documents'
import { PdfPageViewer, type PdfPageRenderer } from './documents/PdfPageViewer'
import { WorkbenchNavigation } from './documents/WorkbenchNavigation'
import {
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
  type NormalizedPoint,
} from './documents/pageGeometry'
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
  onStartOver: () => void
  pageRenderer: PdfPageRenderer
  sessionId: string
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

type RegistrationState = 'ready' | 'unsupported' | 'error' | 'registering'

interface UndoNotice {
  pageId: string
  pageLabel: string
}

const CONSTRAINED_WORKBENCH_WIDTH = 900

function App({
  assistance,
  documents,
  modelContext,
  onStartOver,
  pageRenderer,
  sessionId,
  workspaceStore,
}: AppProps) {
  const [pending, setPending] = useState<AssistanceRequestView[]>([])
  const [completed, setCompleted] = useState<AssistanceCompletedResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [responsePending, setResponsePending] = useState(false)
  const [responseError, setResponseError] = useState('')
  const [responseMessage, setResponseMessage] = useState('')
  const [registration, setRegistration] = useState<RegistrationState>(() =>
    modelContext ? 'registering' : 'unsupported',
  )
  const [registrationError, setRegistrationError] = useState('')
  const [viewedPointSetId, setViewedPointSetId] = useState('')
  const [undoNotice, setUndoNotice] = useState<UndoNotice>()
  const [supportingReferenceRequestId, setSupportingReferenceRequestId] =
    useState('')
  const assistancePaneRef = useRef<HTMLElement>(null)
  const workspaceGridRef = useRef<HTMLDivElement>(null)
  const isConstrained = useConstrainedContainer(
    workspaceGridRef,
    CONSTRAINED_WORKBENCH_WIDTH,
  )
  const assistanceCollapsed = useStore(
    workspaceStore,
    (state) => state.assistanceCollapsed,
  )
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
  const fitPreference = useStore(
    workspaceStore,
    (state) => state.fitPreference,
  )
  const addPoint = useStore(workspaceStore, (state) => state.addPoint)
  const clearDraft = useStore(workspaceStore, (state) => state.clearDraft)
  const removePoint = useStore(workspaceStore, (state) => state.removePoint)
  const selectDocument = useStore(workspaceStore, (state) => state.selectDocument)
  const selectPage = useStore(workspaceStore, (state) => state.selectPage)
  const setAssistanceTab = useStore(
    workspaceStore,
    (state) => state.setAssistanceTab,
  )
  const setAssistanceCollapsed = useStore(
    workspaceStore,
    (state) => state.setAssistanceCollapsed,
  )
  const setDeclineReason = useStore(
    workspaceStore,
    (state) => state.setDeclineReason,
  )
  const setNote = useStore(workspaceStore, (state) => state.setNote)
  const setText = useStore(workspaceStore, (state) => state.setText)
  const setFitPreference = useStore(
    workspaceStore,
    (state) => state.setFitPreference,
  )
  const setZoom = useStore(workspaceStore, (state) => state.setZoom)
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
      try {
        const [nextPending, nextCompleted] = await Promise.all([
          assistance.listPending(),
          assistance.listCompleted(),
        ])
        if (active && revision === loadRevision) {
          setPending(nextPending)
          setCompleted(nextCompleted)
          setLoadError('')
        }
      } catch (error: unknown) {
        if (active && revision === loadRevision) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'The Demo Session could not be loaded.',
          )
        }
      } finally {
        if (active && revision === loadRevision) setLoading(false)
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
  const targetPage =
    pointSetCurrent?.recommendedPageIds
      .map((pageId) => findPage(targetDocument, pageId))
      .find((page) => page !== undefined) ?? targetDocument.pages[0]!
  const openedSupportingReference = supportingReferenceRequestId === current?.id
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
      const pages = reference.pageIds
        .map((pageId) => findPage(document, pageId))
        .filter((page): page is NonNullable<typeof page> => Boolean(page))
      return { document, pages }
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const selectedPageIndex = selectedDocument.pages.findIndex(
        (page) => page.id === selectedPage.id,
      )
      if (event.key === 'ArrowLeft' && selectedPageIndex > 0) {
        event.preventDefault()
        selectPage(selectedDocument.pages[selectedPageIndex - 1]!.id)
      } else if (
        event.key === 'ArrowRight' &&
        selectedPageIndex >= 0 &&
        selectedPageIndex < selectedDocument.pages.length - 1
      ) {
        event.preventDefault()
        selectPage(selectedDocument.pages[selectedPageIndex + 1]!.id)
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        setFitPreference(event.shiftKey ? 'width' : 'page')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    selectPage,
    selectedDocument.pages,
    selectedPage.id,
    setFitPreference,
    zoomIn,
    zoomOut,
  ])
  const viewedPointSet = completed.find(
    (result) =>
      result.id === viewedPointSetId &&
      result.professionalResponse.type === 'point_set',
  )
  const canMark = Boolean(
    pointSetCurrent &&
      !viewedPointSet &&
      selectedDocument.id === pointSetCurrent.documentId &&
      selectedDocument.versionId === pointSetCurrent.documentVersionId,
  )
  const targetNavigationLabel =
    openedSupportingReference && !canMark ? 'Return to target' : 'Go to target'
  const visiblePoints = canMark
    ? points
    : viewedPointSet?.professionalResponse.type === 'point_set'
      ? viewedPointSet.professionalResponse.points.map((point) => ({
          pointNumber: point.pointNumber,
          pageId: point.page.id,
          pageLabel: point.page.label,
          pageNumber: point.page.number,
          x: point.x,
          y: point.y,
        }))
      : []
  const selectedDocumentIsTarget = Boolean(
    pointSetCurrent &&
      selectedDocument.id === pointSetCurrent.documentId &&
      selectedDocument.versionId === pointSetCurrent.documentVersionId,
  )
  const selectedDocumentIsViewedPointSet = Boolean(
    viewedPointSet?.professionalResponse.type === 'point_set' &&
      selectedDocument.id === viewedPointSet.professionalResponse.document.id &&
      selectedDocument.versionId ===
        viewedPointSet.professionalResponse.document.versionId,
  )
  const selectedDocumentHasDraft = Boolean(
    !viewedPointSet && selectedDocumentIsTarget,
  )
  const pagePointCounts = countPointsByPage(
    selectedDocumentIsViewedPointSet
      ? visiblePoints
      : selectedDocumentHasDraft
        ? points
        : [],
  )
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

  const goToTarget = () => {
    if (!pointSetCurrent) return
    setViewedPointSetId('')
    setSupportingReferenceRequestId('')
    selectDocument(targetDocument.id, targetDocument.versionId, targetPage.id)
  }

  const undoLatestPoint = () => {
    const latestPoint = points.at(-1)
    if (!latestPoint) return
    undoPoint()
    if (latestPoint.pageId !== selectedPage.id) {
      setUndoNotice({
        pageId: latestPoint.pageId,
        pageLabel: latestPoint.pageLabel,
      })
    } else {
      setUndoNotice(undefined)
    }
  }

  useEffect(() => {
    if (!undoNotice) return
    const timeout = window.setTimeout(() => setUndoNotice(undefined), 6_000)
    return () => window.clearTimeout(timeout)
  }, [undoNotice])

  const openUndonePointPage = () => {
    if (!undoNotice || !pointSetCurrent) return
    setViewedPointSetId('')
    setSupportingReferenceRequestId('')
    selectDocument(
      pointSetCurrent.documentId,
      pointSetCurrent.documentVersionId,
      undoNotice.pageId,
    )
    setUndoNotice(undefined)
  }

  const openSupportingReference = (
    documentId: string,
    documentVersionId: string,
    pageId: string,
  ) => {
    setSupportingReferenceRequestId(current?.id ?? '')
    selectDocument(documentId, documentVersionId, pageId)
  }

  const openAssistance = () => {
    setAssistanceTab('current')
    setAssistanceCollapsed(false)
    window.requestAnimationFrame(() => {
      assistancePaneRef.current?.focus()
      if (isConstrained) {
        assistancePaneRef.current?.scrollIntoView?.({ block: 'start' })
      }
    })
  }

  const submitPointSet = async () => {
    if (!pointSetCurrent) return
    await saveProfessionalResponse(async () => {
      await assistance.submitPointSetResponse({
        requestId: pointSetCurrent.id,
        points,
        ...(note.trim() ? { note } : {}),
      })
    })
  }

  const submitText = async () => {
    if (current?.responseType !== 'text') return
    if (!text.trim()) {
      setResponseError('Enter a text Professional Response before submitting.')
      setResponseMessage('')
      return
    }
    await saveProfessionalResponse(async () => {
      await assistance.submitTextResponse({
        requestId: current.id,
        text,
        ...(note.trim() ? { note } : {}),
      })
    })
  }

  const declineCurrent = async () => {
    if (!current) return
    await saveProfessionalResponse(async () => {
      await assistance.decline({
        requestId: current.id,
        ...(declineReason.trim() ? { reason: declineReason } : {}),
      })
    })
  }

  const saveProfessionalResponse = async (save: () => Promise<void>) => {
    if (responsePending) return
    setResponsePending(true)
    setResponseError('')
    setResponseMessage('')
    try {
      await save()
      clearDraft()
      setResponseMessage(
        'Professional Response saved. The External Agent can retrieve it now.',
      )
      try {
        await refresh()
      } catch (error: unknown) {
        setLoadError(
          `${error instanceof Error ? error.message : 'The Demo Session could not be refreshed.'} The Professional Response is saved. Reload the page to continue.`,
        )
      }
    } catch (error: unknown) {
      setResponseError(
        `${error instanceof Error ? error.message : 'The Professional Response could not be saved.'} Check the response and try again.`,
      )
    } finally {
      setResponsePending(false)
    }
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
        <div className="session-actions">
          <div className="session-status">
            <span className={`status-dot status-${registration}`} aria-hidden="true" />
            <span>{statusCopy}</span>
            <code>{sessionId.slice(0, 8)}</code>
          </div>
          <button className="start-over-button" onClick={onStartOver} type="button">
            Start over
          </button>
        </div>
      </header>

      {registration === 'error' && (
        <p className="error-banner" role="alert">
          WebMCP tools could not register. Refresh the page and try again. {registrationError}
        </p>
      )}
      {registration === 'unsupported' && (
        <p className="notice-banner">
          Open this page in a WebMCP-capable browser to let an External Agent inspect
          documents and create Assistance Requests. The Project Workspace remains available.
        </p>
      )}

      <div
        className={`workspace-grid${isConstrained ? ' is-constrained' : ''}${assistanceCollapsed ? ' assistance-collapsed' : ''}`}
        ref={workspaceGridRef}
      >
        <section className="document-pane" aria-labelledby="work-area-title">
          <WorkbenchNavigation
            assistanceExpanded={!assistanceCollapsed}
            currentDocument={selectedDocument}
            currentPage={selectedPage}
            documents={demoProject.documents}
            onOpenAssistance={openAssistance}
            onSelectDocument={(document) =>
              selectDocument(document.id, document.versionId)
            }
            onSelectPage={(page) => selectPage(page.id)}
            pageItems={selectedDocument.pages.map((page) => {
              const isRecommended = Boolean(
                selectedDocumentIsTarget &&
                  pointSetCurrent?.recommendedPageIds.includes(page.id),
              )
              const pointCount = pagePointCounts.get(page.id) ?? 0
              const pointStatus = pointCount > 0
                ? `${pointCount} ${selectedDocumentIsViewedPointSet ? 'submitted' : 'draft'} ${pointCount === 1 ? 'point' : 'points'}`
                : ''
              const statuses = [isRecommended ? 'Recommended' : '', pointStatus]
                .filter(Boolean)

              return {
                page,
                ...(statuses.length > 0
                  ? {
                      adornment: (
                        <span className="page-point-set-status">
                          {isRecommended && (
                            <span className="recommended-page-badge">Recommended</span>
                          )}
                          {pointStatus && <span>{pointStatus}</span>}
                        </span>
                      ),
                      description: statuses.join(', '),
                    }
                  : {}),
              }
            })}
          />
          {current && (isConstrained || assistanceCollapsed) && (
            <div className="request-strip" aria-label="Active Assistance Request">
              <div className="request-strip-status">
                <span>Pending</span>
                <strong>
                  {current.responseType === 'point_set'
                    ? `Point Set, ${points.length} marked`
                    : 'Text response'}
                </strong>
              </div>
              <div className="request-strip-actions">
                {current.responseType === 'point_set' && (
                  <>
                    <button
                      disabled={points.length === 0}
                      onClick={undoLatestPoint}
                      type="button"
                    >
                      Undo
                    </button>
                    <button onClick={goToTarget} type="button">
                      {targetNavigationLabel}
                    </button>
                  </>
                )}
                <button onClick={openAssistance} type="button">View request</button>
              </div>
            </div>
          )}
          <div className="drawing-stage">
            <div className="zoom-controls" aria-label="Document zoom">
              <button
                aria-label="Zoom out"
                disabled={zoom <= MIN_DOCUMENT_ZOOM}
                onClick={zoomOut}
                type="button"
              >
                −
              </button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Zoom in"
                disabled={zoom >= MAX_DOCUMENT_ZOOM}
                onClick={zoomIn}
                type="button"
              >
                +
              </button>
              <button
                aria-label="Fit page"
                aria-pressed={fitPreference === 'page'}
                className="fit-control"
                onClick={() => setFitPreference('page')}
                type="button"
              >
                Page
              </button>
              <button
                aria-label="Fit width"
                aria-pressed={fitPreference === 'width'}
                className="fit-control"
                onClick={() => setFitPreference('width')}
                type="button"
              >
                Width
              </button>
            </div>
            <PdfPageViewer
              canMark={canMark}
              document={selectedDocument}
              fit={fitPreference}
              onPlacePoint={placePoint}
              onRemovePoint={canMark ? removePoint : undefined}
              onZoomChange={setZoom}
              page={selectedPage}
              points={visiblePoints}
              renderer={pageRenderer}
              zoom={zoom}
            />
            {undoNotice && (
              <div className="undo-notice" role="status">
                <span>Removed the latest point from page {undoNotice.pageLabel}.</span>
                <button onClick={openUndonePointPage} type="button">
                  View page {undoNotice.pageLabel}
                </button>
              </div>
            )}
          </div>
        </section>

        {!assistanceCollapsed && <aside
          className="assistance-pane"
          aria-labelledby="assistance-title"
          ref={assistancePaneRef}
          tabIndex={-1}
        >
          <div className="assistance-heading">
            <div>
              <p className="pane-kicker">FIFO work rail</p>
              <h2 id="assistance-title">Current Assistance</h2>
            </div>
            <button
              aria-label="Collapse Assistance"
              className="collapse-assistance-button"
              onClick={() => setAssistanceCollapsed(true)}
              type="button"
            >
              Collapse
            </button>
          </div>
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

          {responseError && (
            <p className="response-feedback error" role="alert">{responseError}</p>
          )}
          {responseMessage && (
            <p className="response-feedback success" role="status">
              {responseMessage}
            </p>
          )}

          {loading && (
            <div
              aria-label="Loading Demo Session"
              className="empty-request"
              role="status"
            >
              <p>Loading Demo Session</p>
              <small>Reading this tab's queued and completed work.</small>
            </div>
          )}
          {!loading && loadError && (
            <div className="rail-error" role="alert">
              <p>The Demo Session could not be loaded.</p>
              <small>{loadError}</small>
            </div>
          )}

          {!loading && !loadError && assistanceTab === 'current' && (current ? (
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
                              {supportingDocuments.map(({ document, pages }) => (
                                <li key={`${document.id}:${document.versionId}`}>
                                  <span>{document.title}</span>
                                  <small>
                                    {document.versionId} · Pages{' '}
                                    {pages.map((page) => page.label).join(', ')}
                                  </small>
                                  <span className="supporting-page-links">
                                    {pages.map((page) => (
                                      <button
                                        key={page.id}
                                        onClick={() => openSupportingReference(
                                          document.id,
                                          document.versionId,
                                          page.id,
                                        )}
                                        type="button"
                                      >
                                        Open page {page.label}
                                      </button>
                                    ))}
                                  </span>
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
                        onClick={undoLatestPoint}
                        type="button"
                      >
                        Undo
                      </button>
                    </div>
                    <button
                      className="response-page-button"
                      onClick={goToTarget}
                      type="button"
                    >
                      {targetNavigationLabel}
                    </button>
                  </>
                ) : (
                  <>
                    <label htmlFor="text-response">Text response</label>
                    <textarea
                      id="text-response"
                      onChange={(event) => {
                        setResponseError('')
                        setText(event.target.value)
                      }}
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
                    disabled={responsePending}
                    onClick={() => void submitPointSet()}
                    type="button"
                  >
                    Submit Point Set
                  </button>
                ) : (
                  <button
                    className="submit-button"
                    disabled={responsePending}
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
                  <button
                    disabled={responsePending}
                    onClick={() => void declineCurrent()}
                    type="button"
                  >
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

          {!loading && !loadError && assistanceTab === 'queue' && (
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

          {!loading && !loadError && assistanceTab === 'done' && (
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
                          {result.professionalResponse.points.map((point) => (
                            <li key={point.pointNumber} value={point.pointNumber}>
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
        </aside>}
      </div>
    </main>
  )
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') || target.isContentEditable
  )
}

function countPointsByPage(points: Array<{ pageId: string }>) {
  const counts = new Map<string, number>()
  for (const point of points) {
    counts.set(point.pageId, (counts.get(point.pageId) ?? 0) + 1)
  }
  return counts
}

export default App

function useConstrainedContainer(
  ref: RefObject<HTMLElement | null>,
  threshold: number,
) {
  const [isConstrained, setIsConstrained] = useState(false)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setIsConstrained(entry.contentRect.width < threshold)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [ref, threshold])

  return isConstrained
}
