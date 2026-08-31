import { useEffect, useRef, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useStore } from 'zustand'
import type {
  AssistanceCompletedResult,
  createAssistance,
} from './assistance/assistance'
import {
  AssistancePanel,
  AssistanceRequestStrip,
} from './assistance/AssistancePanel'
import {
  asPointSetResult,
  asPointSetRequest,
  findPointSetResult,
  firstMarkedPageId,
  toStoredPoints,
} from './assistance/assistancePresentation'
import { useAssistanceController } from './assistance/useAssistanceController'
import type { createDocuments } from './documents/documents'
import {
  DocumentWorkbench,
} from './documents/DocumentWorkbench'
import type { PdfPageRenderer } from './documents/PdfPageViewer'
import { useDocumentKeyboardShortcuts } from './documents/useDocumentKeyboardShortcuts'
import { useConstrainedWorkbench } from './documents/useConstrainedWorkbench'
import {
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
  const isConstrained = useConstrainedWorkbench(
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
  const selectedLocation = useStore(
    workspaceStore,
    (state) => state.selectedLocation,
  )
  const zoom = useStore(workspaceStore, (state) => state.zoom)
  const fitPreference = useStore(
    workspaceStore,
    (state) => state.fitPreference,
  )
  const addPoint = useStore(workspaceStore, (state) => state.addPoint)
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
  useDocumentKeyboardShortcuts(workspaceStore)
  const assistanceController = useAssistanceController({
    assistance,
    workspaceStore,
  })

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

  const defaultDocument = demoProject.documents[0]!
  const {
    clearResponseError,
    completed,
    current,
    declineCurrent,
    loadError,
    loading,
    pending,
    responseError,
    responseMessage,
    responsePending,
    submitPointSet,
    submitText,
  } = assistanceController
  const pointSetCurrent = asPointSetRequest(current)
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
    findDocument(
      selectedLocation.documentId,
      selectedLocation.documentVersionId,
    ) ??
    defaultDocument
  const selectedPage =
    selectedDocument.pages.find((page) => page.id === selectedLocation.pageId) ??
    selectedDocument.pages[0]!

  const viewedPointSet = findPointSetResult(completed, viewedPointSetId)
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
    : toStoredPoints(viewedPointSet)
  const selectedDocumentIsTarget = Boolean(
    pointSetCurrent &&
      selectedDocument.id === pointSetCurrent.documentId &&
      selectedDocument.versionId === pointSetCurrent.documentVersionId,
  )
  const selectedDocumentIsViewedPointSet = Boolean(
    viewedPointSet &&
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
    selectDocument({
      documentId: targetDocument.id,
      documentVersionId: targetDocument.versionId,
      pageId: targetPage.id,
    })
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
    selectDocument({
      documentId: pointSetCurrent.documentId,
      documentVersionId: pointSetCurrent.documentVersionId,
      pageId: undoNotice.pageId,
    })
    setUndoNotice(undefined)
  }

  const openSupportingReference = (
    documentId: string,
    documentVersionId: string,
    pageId: string,
  ) => {
    setSupportingReferenceRequestId(current?.id ?? '')
    selectDocument({ documentId, documentVersionId, pageId })
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

  const viewPointSet = (result: AssistanceCompletedResult) => {
    const pointSetResult = asPointSetResult(result)
    if (!pointSetResult) return
    const document = findDocument(
      pointSetResult.professionalResponse.document.id,
      pointSetResult.professionalResponse.document.versionId,
    )
    if (!document) return
    const pageId = firstMarkedPageId(document, pointSetResult)
    setViewedPointSetId(pointSetResult.id)
    selectDocument({
      documentId: document.id,
      documentVersionId: document.versionId,
      pageId,
    })
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
          <button
            aria-expanded={!assistanceCollapsed}
            aria-label={assistanceCollapsed ? 'Show Assistance' : 'Hide Assistance'}
            className="assistance-toggle icon-button tooltip-button"
            data-tooltip={assistanceCollapsed ? 'Show Assistance' : 'Hide Assistance'}
            onClick={() => {
              if (assistanceCollapsed) openAssistance()
              else setAssistanceCollapsed(true)
            }}
            type="button"
          >
            {assistanceCollapsed ? (
              <PanelRightOpen aria-hidden="true" size={18} strokeWidth={1.8} />
            ) : (
              <PanelRightClose aria-hidden="true" size={18} strokeWidth={1.8} />
            )}
          </button>
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
      <div
        className={`workspace-grid${isConstrained ? ' is-constrained' : ''}${assistanceCollapsed ? ' assistance-collapsed' : ''}`}
        ref={workspaceGridRef}
      >
        <DocumentWorkbench
          canMark={canMark}
          currentDocument={selectedDocument}
          currentPage={selectedPage}
          documents={demoProject.documents}
          fit={fitPreference}
          onFitChange={setFitPreference}
          onPlacePoint={placePoint}
          onRemovePoint={canMark ? removePoint : undefined}
          onSelectDocument={(document) => selectDocument({
            documentId: document.id,
            documentVersionId: document.versionId,
          })}
          onSelectPage={(page) => selectPage(page.id)}
          onViewUndonePointPage={openUndonePointPage}
          onZoomChange={setZoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
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
          pageRenderer={pageRenderer}
          points={visiblePoints}
          requestStrip={current && (isConstrained || assistanceCollapsed) ? (
            <AssistanceRequestStrip
              current={current}
              onOpenAssistance={openAssistance}
              onTargetNavigation={goToTarget}
              onUndoPoint={undoLatestPoint}
              pointCount={points.length}
              targetNavigationLabel={targetNavigationLabel}
            />
          ) : undefined}
          undoNotice={undoNotice}
          zoom={zoom}
        />

        {!assistanceCollapsed && (
          <AssistancePanel
            assistancePaneRef={assistancePaneRef}
            assistanceTab={assistanceTab}
            canMark={canMark}
            completed={completed}
            current={current}
            declineReason={declineReason}
            loadError={loadError}
            loading={loading}
            note={note}
            onDecline={() => void declineCurrent()}
            onOpenSupportingReference={openSupportingReference}
            onSelectTab={setAssistanceTab}
            onSetDeclineReason={setDeclineReason}
            onSetNote={setNote}
            onSetText={(value) => {
              clearResponseError()
              setText(value)
            }}
            onSubmitPointSet={() => void submitPointSet()}
            onSubmitText={() => void submitText()}
            onTargetNavigation={goToTarget}
            onUndoPoint={undoLatestPoint}
            onViewPointSet={viewPointSet}
            pending={pending}
            pointCount={points.length}
            recommendedPageLabels={recommendedPageLabels ?? ''}
            responseError={responseError}
            responseMessage={responseMessage}
            responsePending={responsePending}
            supportingDocuments={supportingDocuments}
            targetDocument={targetDocument}
            targetNavigationLabel={targetNavigationLabel}
            targetPage={targetPage}
            text={text}
          />
        )}

      </div>
    </main>
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
